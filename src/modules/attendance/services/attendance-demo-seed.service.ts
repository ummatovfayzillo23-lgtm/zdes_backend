import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AttendanceSource, AttendanceStatus } from '@prisma/client';
import { PrismaService } from '../../../common/congif/prisma/prisma.service';
import {
  DEFAULT_TIMEZONE,
  getMonthKey,
  parseTimeToZonedDate,
  toZonedDateOnly,
} from '../../../common/utils/helpers';

const DEMO_EMPLOYEE_LOGIN = 'employee';
const DEMO_ATTENDANCE_DAYS = 10;
const DEMO_WORK_START = '09:00';
const DEMO_WORK_END = '18:00';

/**
 * Seeds up to 10 workdays of demo attendance for the default `employee`
 * login (created by prisma/seed.ts) on every app boot, so the app has
 * non-empty attendance data to demo/test against. Idempotent — skips
 * dates that already have a record. Disabled in production unless
 * SEED_DEMO_ATTENDANCE=true is set.
 */
@Injectable()
export class AttendanceDemoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger('AttendanceDemoSeed');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.SEED_DEMO_ATTENDANCE !== 'true'
    ) {
      return;
    }

    try {
      await this.seedDefaultEmployeeAttendance();
    } catch (error) {
      this.logger.error(
        `Failed to seed demo attendance: ${(error as Error).message}`,
      );
    }
  }

  private async seedDefaultEmployeeAttendance(): Promise<void> {
    let employee = await this.prisma.user.findUnique({
      where: { login: DEMO_EMPLOYEE_LOGIN },
    });

    if (!employee) {
      return;
    }

    if (!employee.companyId) {
      const company = await this.prisma.company.findFirst({
        orderBy: { createdAt: 'asc' },
      });

      if (!company) {
        this.logger.warn(
          'No company exists yet — skipping demo attendance seed',
        );
        return;
      }

      const branch = await this.prisma.branch.findFirst({
        where: { companyId: company.id },
        orderBy: { createdAt: 'asc' },
      });

      employee = await this.prisma.user.update({
        where: { id: employee.id },
        data: {
          companyId: company.id,
          branchId: branch?.id ?? null,
        },
      });
    }

    const companyId = employee.companyId;
    if (!companyId) {
      return;
    }

    const today = toZonedDateOnly(new Date(), DEFAULT_TIMEZONE);
    const daysToSeed = Math.min(DEMO_ATTENDANCE_DAYS, today.getUTCDate());
    let seededCount = 0;

    for (let day = 1; day <= daysToSeed; day += 1) {
      const attendanceDate = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day),
      );

      const weekday = attendanceDate.getUTCDay();
      if (weekday === 0 || weekday === 6) {
        continue;
      }

      const existing = await this.prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: employee.id,
            date: attendanceDate,
          },
        },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      const checkIn = parseTimeToZonedDate(
        attendanceDate,
        DEMO_WORK_START,
        DEFAULT_TIMEZONE,
      );
      const checkOut = parseTimeToZonedDate(
        attendanceDate,
        DEMO_WORK_END,
        DEFAULT_TIMEZONE,
      );

      await this.prisma.attendance.create({
        data: {
          companyId,
          branchId: employee.branchId,
          employeeId: employee.id,
          date: attendanceDate,
          checkIn,
          checkOut,
          status: AttendanceStatus.present,
          source: AttendanceSource.manual,
          workStartTime: DEMO_WORK_START,
          workEndTime: DEMO_WORK_END,
          workedMinutes: Math.round(
            (checkOut.getTime() - checkIn.getTime()) / 60000,
          ),
          notes: 'Auto-seeded demo attendance',
        },
      });

      seededCount += 1;
    }

    if (seededCount > 0) {
      this.logger.log(
        `Seeded ${seededCount} demo attendance day(s) for '${DEMO_EMPLOYEE_LOGIN}' (${getMonthKey(today)})`,
      );
    }
  }
}
