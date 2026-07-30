import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Attendance,
  AttendanceStatus,
  Terminal,
  TerminalEventType,
  User,
} from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import {
  calculateMinutesDifference,
  toZonedDateOnly,
  trimToNull,
} from '../../common/utils/helpers';
import { IngestTurnstileLogDto } from './dto/ingest-turnstile-log.dto';

@Injectable()
export class TurnstileService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestLog(dto: IngestTurnstileLogDto, sharedSecret?: string) {
    this.validateSharedSecret(sharedSecret);
    const terminalSerialNumber = trimToNull(dto.terminalSerialNumber);
    const deviceUserId = trimToNull(dto.deviceUserId);

    if (!terminalSerialNumber || !deviceUserId) {
      throw new BadRequestException(
        'terminalSerialNumber and deviceUserId are required',
      );
    }

    const eventTime = new Date(dto.eventTime);

    if (Number.isNaN(eventTime.getTime())) {
      throw new BadRequestException(
        'eventTime must be a valid ISO date string',
      );
    }

    const terminal = await this.prisma.terminal.findUnique({
      where: {
        serialNumber: terminalSerialNumber,
      },
      include: {
        company: { select: { timezone: true } },
      },
    });

    if (!terminal) {
      throw new NotFoundException('Turnstile terminal not found');
    }

    const existingRawLog = await this.prisma.rawAttendanceLog.findFirst({
      where: {
        terminalId: terminal.id,
        eventTime,
        deviceUserId,
        eventType: dto.eventType,
      },
    });

    if (existingRawLog) {
      return {
        duplicate: true,
        processed: existingRawLog.processed,
        rawLogId: existingRawLog.id,
        attendanceId: existingRawLog.attendanceId,
        employeeId: existingRawLog.employeeId,
        message: 'This turnstile log was already ingested',
      };
    }

    const employee = await this.prisma.user.findFirst({
      where: {
        companyId: terminal.companyId,
        faceDeviceUserId: deviceUserId,
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const outcome = employee
        ? await this.createAttendanceFromLog(
            tx,
            terminal,
            employee,
            dto.eventType,
            eventTime,
            terminal.company.timezone,
          )
        : {
            processed: false,
            attendanceId: null,
            employeeId: null,
            message:
              'No employee was mapped to this turnstile device user. Raw log stored for later reconciliation.',
          };

      const rawLog = await tx.rawAttendanceLog.create({
        data: {
          companyId: terminal.companyId,
          terminalId: terminal.id,
          employeeId: employee?.id ?? null,
          attendanceId: outcome.attendanceId,
          deviceUserId,
          eventTime,
          eventType: dto.eventType,
          rawPayload: this.toRawPayloadInput(dto.rawPayload),
          processed: outcome.processed,
          error: outcome.processed ? null : outcome.message,
        },
      });

      return {
        duplicate: false,
        processed: outcome.processed,
        rawLogId: rawLog.id,
        attendanceId: outcome.attendanceId,
        employeeId: employee?.id ?? null,
        message: outcome.message,
      };
    });
  }

  private async createAttendanceFromLog(
    tx: Prisma.TransactionClient,
    terminal: Terminal,
    employee: User,
    eventType: TerminalEventType,
    eventTime: Date,
    timezone: string,
  ): Promise<{
    processed: boolean;
    attendanceId: string;
    employeeId: string;
    message: string;
  }> {
    const attendanceDate = toZonedDateOnly(eventTime, timezone);
    const existingAttendance = await tx.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: attendanceDate,
        },
      },
    });

    const nextTimes = this.getNextAttendanceTimes(
      existingAttendance,
      eventType,
      eventTime,
    );
    const workedMinutes = calculateMinutesDifference(
      nextTimes.checkIn,
      nextTimes.checkOut,
    );

    const attendanceData: Prisma.AttendanceUncheckedCreateInput = {
      companyId: terminal.companyId,
      branchId: employee.branchId ?? terminal.branchId,
      employeeId: employee.id,
      terminalId: terminal.id,
      date: attendanceDate,
      checkIn: nextTimes.checkIn,
      checkOut: nextTimes.checkOut,
      status: this.getAttendanceStatus(nextTimes.checkIn, nextTimes.checkOut),
      source: 'terminal',
      workedMinutes,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      overtimeMinutes: 0,
    };

    const attendance = existingAttendance
      ? await tx.attendance.update({
          where: {
            id: existingAttendance.id,
          },
          data: attendanceData,
        })
      : await tx.attendance.create({
          data: attendanceData,
        });

    return {
      processed: true,
      attendanceId: attendance.id,
      employeeId: employee.id,
      message: 'Turnstile log processed and linked to attendance',
    };
  }

  private getNextAttendanceTimes(
    attendance: Attendance | null,
    eventType: TerminalEventType,
    eventTime: Date,
  ): { checkIn: Date | null; checkOut: Date | null } {
    const currentCheckIn = attendance?.checkIn ?? null;
    const currentCheckOut = attendance?.checkOut ?? null;

    if (eventType === 'check_in') {
      return {
        checkIn:
          !currentCheckIn || eventTime.getTime() < currentCheckIn.getTime()
            ? eventTime
            : currentCheckIn,
        checkOut: currentCheckOut,
      };
    }

    if (eventType === 'check_out') {
      return {
        checkIn: currentCheckIn,
        checkOut:
          !currentCheckOut || eventTime.getTime() > currentCheckOut.getTime()
            ? eventTime
            : currentCheckOut,
      };
    }

    return {
      checkIn: currentCheckIn,
      checkOut: currentCheckOut,
    };
  }

  private getAttendanceStatus(
    checkIn: Date | null,
    checkOut: Date | null,
  ): AttendanceStatus {
    if (checkIn || checkOut) {
      return 'present';
    }

    return 'absent';
  }

  private validateSharedSecret(receivedSecret?: string): void {
    const expectedSecret = trimToNull(process.env.TURNSTILE_SHARED_SECRET);

    if (expectedSecret && receivedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid turnstile shared secret');
    }
  }

  private toRawPayloadInput(
    rawPayload?: Record<string, unknown> | null,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (rawPayload == null) {
      return Prisma.JsonNull;
    }

    return rawPayload as Prisma.InputJsonValue;
  }
}
