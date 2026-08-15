import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AdjustmentCategory,
  AdjustmentType,
  AttendanceSource,
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import type {
  Attendance,
  AttendanceSession,
  SalaryAdjustment,
  User,
  WorkSchedule,
} from '@prisma/client';
import { readFile } from 'fs/promises';
import { PrismaService } from '../../../common/congif/prisma/prisma.service';
import {
  assertFileProvided,
  buildUploadUrl,
} from '../../../common/upload/image-upload.util';
import {
  DEFAULT_TIMEZONE,
  calculateMinutesDifference,
  getMonthKey,
  getWorkDayNumber,
  parseTimeToZonedDate,
  toZonedDateOnly,
  trimToNull,
} from '../../../common/utils/helpers';
import { AccessTokenPayload } from '../../auth/interfaces/access-token-payload.interface';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../../common/utils/scope.util';
import { NotificationService } from '../../notification/notification.service';
import { notificationTemplates } from '../../notification/notification.templates';
import {
  ATTENDANCE_KPI_SETTING_KEY,
  AUTO_ATTENDANCE_REASON_PREFIX,
  DEFAULT_ATTENDANCE_KPI_TEMPLATE,
} from '../constants/attendance.constants';
import { AttendanceAdjustmentDto } from '../dto/attendance-adjustment.dto';
import { AttendanceCheckInDto } from '../dto/attendance-check-in.dto';
import { AttendanceCheckOutDto } from '../dto/attendance-check-out.dto';
import { AttendanceKpiTemplateDto } from '../dto/attendance-kpi-template.dto';
import { AttendanceQueryDto } from '../dto/attendance-query.dto';
import { AttendanceSessionQueryDto } from '../dto/attendance-session-query.dto';
import { SelfAttendanceCheckInDto } from '../dto/self-attendance-check-in.dto';
import { SelfAttendanceCheckOutDto } from '../dto/self-attendance-check-out.dto';
import { AwsFaceVerificationService } from './aws-face-verification.service';

type AttendanceKpiTemplate = Required<
  Omit<AttendanceKpiTemplateDto, 'companyId'>
> & { companyId: string };

type UserWithSchedule = User & {
  workSchedule: WorkSchedule | null;
  timezone: string;
};

type AttendanceMetrics = {
  workStartTime: string | null;
  workEndTime: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus;
};

@Injectable()
export class AttendanceService {
  private readonly reminderLogger = new Logger('AttendanceReminder');

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsFaceVerificationService: AwsFaceVerificationService,
    private readonly notification: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async remindAbsentAndNoCheckoutEmployees(): Promise<void> {
    const employees = await this.prisma.user.findMany({
      where: {
        isActive: true,
        isBlocked: false,
        companyId: { not: null },
      },
      include: {
        workSchedule: true,
        company: { select: { timezone: true } },
      },
    });

    for (const employee of employees) {
      try {
        await this.remindEmployeeIfNeeded({
          ...employee,
          workSchedule:
            employee.workSchedule ??
            (await this.findDefaultWorkSchedule(employee.companyId as string)),
          timezone: employee.company?.timezone ?? DEFAULT_TIMEZONE,
        });
      } catch (error) {
        this.reminderLogger.error(
          `Failed to check attendance reminder for employee ${employee.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async remindEmployeeIfNeeded(
    employee: UserWithSchedule,
  ): Promise<void> {
    if (!employee.workSchedule?.isActive) {
      return;
    }

    const now = new Date();
    const today = toZonedDateOnly(now, employee.timezone);
    const workDays = this.extractWorkDays(employee.workSchedule.workDays);

    if (!workDays.includes(getWorkDayNumber(today))) {
      return;
    }

    const scheduledEnd = parseTimeToZonedDate(
      today,
      employee.workSchedule.endTime,
      employee.timezone,
    );

    if (now.getTime() < scheduledEnd.getTime()) {
      return;
    }

    if (await this.hasApprovedLeave(employee.id, today)) {
      return;
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: today,
        },
      },
    });

    const dayStartUtc = parseTimeToZonedDate(today, '00:00', employee.timezone);
    const name = trimToNull(employee.firstName);

    if (!attendance?.checkIn) {
      await this.notifyOnce(
        employee.id,
        notificationTemplates.attendanceAbsent(name),
        dayStartUtc,
      );
      return;
    }

    if (!attendance.checkOut) {
      await this.notifyOnce(
        employee.id,
        notificationTemplates.attendanceNoCheckout(name),
        dayStartUtc,
      );
    }
  }

  private async notifyOnce(
    userId: string,
    template: ReturnType<typeof notificationTemplates.attendanceAbsent>,
    sinceUtc: Date,
  ): Promise<void> {
    const alreadySent = await this.prisma.notification.findFirst({
      where: {
        userId,
        title: template.title,
        createdAt: { gte: sinceUtc },
      },
      select: { id: true },
    });

    if (alreadySent) {
      return;
    }

    await this.notification.notifyUserWithTemplate(userId, template);
  }

  private async hasApprovedLeave(
    employeeId: string,
    date: Date,
  ): Promise<boolean> {
    const leave = await this.prisma.employeeLeave.findFirst({
      where: {
        employeeId,
        status: 'approved',
        fromDate: { lte: date },
        toDate: { gte: date },
      },
      select: { id: true },
    });

    return leave !== null;
  }

  /**
   * Approved hourly leave (max 3h) covering the start of the shift on `date`
   * shifts the "you must be here by" line forward — lateness is only counted
   * for minutes beyond the approved window.
   */
  private async getApprovedLeaveHours(
    employeeId: string,
    date: Date,
  ): Promise<number> {
    const leave = await this.prisma.employeeLeave.findFirst({
      where: {
        employeeId,
        status: 'approved',
        durationType: 'hourly',
        fromDate: { lte: date },
        toDate: { gte: date },
      },
      select: { leaveHours: true },
    });

    return leave?.leaveHours ?? 0;
  }

  private async notifyLate(
    employee: UserWithSchedule,
    lateMinutes: number,
  ): Promise<void> {
    await this.notification.notifyUserWithTemplate(
      employee.id,
      notificationTemplates.attendanceLate(
        trimToNull(employee.firstName),
        lateMinutes,
      ),
    );
  }

  private async notifyAdjustments(
    employee: UserWithSchedule,
    adjustments: AttendanceAdjustmentDto[],
  ): Promise<void> {
    for (const adjustment of adjustments) {
      const type =
        adjustment.type === AdjustmentType.bonus ? 'bonus' : 'penalty';
      await this.notification.notifyUserWithTemplate(
        employee.id,
        notificationTemplates.adjustmentApplied(
          type,
          adjustment.amount,
          adjustment.category,
        ),
      );
    }
  }

  async getKpiTemplate(
    companyId: string,
    actor: AccessTokenPayload,
  ): Promise<AttendanceKpiTemplateDto> {
    assertWithinScope(actor, { companyId });
    return this.getKpiTemplateOrDefault(companyId);
  }

  async upsertKpiTemplate(
    dto: AttendanceKpiTemplateDto,
    actor: AccessTokenPayload,
  ): Promise<AttendanceKpiTemplateDto> {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    await this.ensureCompanyExists(companyId);

    const template = this.normalizeKpiTemplate(dto);

    await this.prisma.setting.upsert({
      where: {
        companyId_key: {
          companyId,
          key: ATTENDANCE_KPI_SETTING_KEY,
        },
      },
      update: {
        value: template,
      },
      create: {
        companyId,
        key: ATTENDANCE_KPI_SETTING_KEY,
        value: template,
      },
    });

    return {
      companyId,
      ...template,
    };
  }

  async checkIn(
    dto: AttendanceCheckInDto,
    file: Express.Multer.File,
    actor: AccessTokenPayload,
  ) {
    const uploadedFile = assertFileProvided(file);
    const eventTime = this.parseEventTime(dto.eventTime);
    const employee = await this.findEmployeeOrThrow(dto.employeeId);
    assertWithinScope(actor, employee);
    const template = await this.getKpiTemplateOrDefault(
      employee.companyId as string,
    );
    const terminalId = await this.ensureTerminalBelongsToCompany(
      dto.terminalId,
      employee.companyId as string,
    );

    const { imageUrl, similarity } = await this.verifyAndUploadAttendanceImage({
      employee,
      file: uploadedFile,
      similarityThreshold: template.faceSimilarityThreshold,
    });

    const attendanceDate = toZonedDateOnly(eventTime, employee.timezone);
    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: attendanceDate,
        },
      },
    });

    if (existingAttendance?.checkIn) {
      throw new ConflictException('Employee already checked in for this date');
    }

    const approvedLeaveHours = await this.getApprovedLeaveHours(
      employee.id,
      attendanceDate,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const metrics = this.calculateAttendanceMetrics(
        employee.workSchedule,
        attendanceDate,
        eventTime,
        existingAttendance?.checkOut ?? null,
        employee.timezone,
        approvedLeaveHours,
      );

      const attendance = existingAttendance
        ? await tx.attendance.update({
            where: { id: existingAttendance.id },
            data: {
              terminalId: terminalId ?? existingAttendance.terminalId,
              checkIn: eventTime,
              status: metrics.status,
              source: AttendanceSource.manual,
              workStartTime: metrics.workStartTime,
              workEndTime: metrics.workEndTime,
              workedMinutes: metrics.workedMinutes,
              lateMinutes: metrics.lateMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              overtimeMinutes: metrics.overtimeMinutes,
              checkInImageUrl: imageUrl,
              notes: this.mergeNotes(existingAttendance.notes, dto.notes),
            },
          })
        : await tx.attendance.create({
            data: {
              companyId: employee.companyId as string,
              branchId: employee.branchId,
              employeeId: employee.id,
              terminalId,
              date: attendanceDate,
              checkIn: eventTime,
              status: metrics.status,
              source: AttendanceSource.manual,
              workStartTime: metrics.workStartTime,
              workEndTime: metrics.workEndTime,
              workedMinutes: metrics.workedMinutes,
              lateMinutes: metrics.lateMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              overtimeMinutes: metrics.overtimeMinutes,
              checkInImageUrl: imageUrl,
              notes: this.mergeNotes(null, dto.notes),
            },
          });

      const adjustments = await this.syncAttendanceAdjustments(
        tx,
        attendance,
        template,
        actor.sub,
      );

      return { attendance, adjustments };
    });

    if (
      result.attendance.lateMinutes > 0 &&
      !(await this.hasApprovedLeave(employee.id, attendanceDate))
    ) {
      await this.notifyLate(employee, result.attendance.lateMinutes);
    }

    return this.toResponse(result.attendance, result.adjustments, similarity);
  }

  async checkOut(
    dto: AttendanceCheckOutDto,
    file: Express.Multer.File,
    actor: AccessTokenPayload,
  ) {
    const uploadedFile = assertFileProvided(file);
    const eventTime = this.parseEventTime(dto.eventTime);
    const employee = await this.findEmployeeOrThrow(dto.employeeId);
    assertWithinScope(actor, employee);
    const template = await this.getKpiTemplateOrDefault(
      employee.companyId as string,
    );
    const terminalId = await this.ensureTerminalBelongsToCompany(
      dto.terminalId,
      employee.companyId as string,
    );

    const { imageUrl, similarity } = await this.verifyAndUploadAttendanceImage({
      employee,
      file: uploadedFile,
      similarityThreshold: template.faceSimilarityThreshold,
    });

    const attendanceDate = toZonedDateOnly(eventTime, employee.timezone);
    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: attendanceDate,
        },
      },
    });

    if (!existingAttendance?.checkIn) {
      throw new ConflictException('Employee must check in before check out');
    }

    if (existingAttendance.checkOut) {
      throw new ConflictException('Employee already checked out for this date');
    }

    const approvedLeaveHours = await this.getApprovedLeaveHours(
      employee.id,
      attendanceDate,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const metrics = this.calculateAttendanceMetrics(
        employee.workSchedule,
        attendanceDate,
        existingAttendance.checkIn,
        eventTime,
        employee.timezone,
        approvedLeaveHours,
      );

      const attendance = await tx.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          terminalId: terminalId ?? existingAttendance.terminalId,
          checkOut: eventTime,
          status: metrics.status,
          source: AttendanceSource.manual,
          workStartTime: metrics.workStartTime,
          workEndTime: metrics.workEndTime,
          workedMinutes: metrics.workedMinutes,
          lateMinutes: metrics.lateMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          checkOutImageUrl: imageUrl,
          notes: this.mergeNotes(existingAttendance.notes, dto.notes),
        },
      });

      const adjustments = await this.syncAttendanceAdjustments(
        tx,
        attendance,
        template,
        actor.sub,
      );

      return { attendance, adjustments };
    });

    await this.notifyAdjustments(employee, result.adjustments);

    return this.toResponse(result.attendance, result.adjustments, similarity);
  }

  /**
   * Employee self-service check-in from the app (selfie, no terminal/operator
   * involved). Unlike checkIn(), multiple sessions per day are allowed — each
   * call creates a new AttendanceSession row, and the day's Attendance row is
   * kept as the first-in/last-out summary (same collapse rule the turnstile
   * ingestion uses) so payroll/KPI keep working unchanged.
   */
  async selfCheckIn(
    dto: SelfAttendanceCheckInDto,
    file: Express.Multer.File,
    actor: AccessTokenPayload,
  ) {
    const uploadedFile = assertFileProvided(file);
    const employee = await this.findEmployeeOrThrow(actor.sub);
    const template = await this.getKpiTemplateOrDefault(
      employee.companyId as string,
    );

    const eventTime = new Date();
    const attendanceDate = toZonedDateOnly(eventTime, employee.timezone);

    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        employeeId: employee.id,
        date: attendanceDate,
        checkOut: null,
      },
    });

    if (openSession) {
      throw new ConflictException(
        'You already have an open check-in for today. Check out first.',
      );
    }

    const { imageUrl, similarity } = await this.verifyAndUploadAttendanceImage({
      employee,
      file: uploadedFile,
      similarityThreshold: template.faceSimilarityThreshold,
    });

    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: attendanceDate,
        },
      },
    });

    const approvedLeaveHours = await this.getApprovedLeaveHours(
      employee.id,
      attendanceDate,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const nextTimes = this.collapseAttendanceTimes(
        existingAttendance,
        'check_in',
        eventTime,
      );
      const metrics = this.calculateAttendanceMetrics(
        employee.workSchedule,
        attendanceDate,
        nextTimes.checkIn,
        nextTimes.checkOut,
        employee.timezone,
        approvedLeaveHours,
      );

      const attendance = existingAttendance
        ? await tx.attendance.update({
            where: { id: existingAttendance.id },
            data: {
              checkIn: nextTimes.checkIn,
              checkOut: nextTimes.checkOut,
              status: metrics.status,
              source: AttendanceSource.mobile,
              workStartTime: metrics.workStartTime,
              workEndTime: metrics.workEndTime,
              workedMinutes: metrics.workedMinutes,
              lateMinutes: metrics.lateMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              overtimeMinutes: metrics.overtimeMinutes,
              checkInImageUrl: existingAttendance.checkInImageUrl ?? imageUrl,
            },
          })
        : await tx.attendance.create({
            data: {
              companyId: employee.companyId as string,
              branchId: employee.branchId,
              employeeId: employee.id,
              date: attendanceDate,
              checkIn: nextTimes.checkIn,
              checkOut: nextTimes.checkOut,
              status: metrics.status,
              source: AttendanceSource.mobile,
              workStartTime: metrics.workStartTime,
              workEndTime: metrics.workEndTime,
              workedMinutes: metrics.workedMinutes,
              lateMinutes: metrics.lateMinutes,
              earlyLeaveMinutes: metrics.earlyLeaveMinutes,
              overtimeMinutes: metrics.overtimeMinutes,
              checkInImageUrl: imageUrl,
            },
          });

      const session = await tx.attendanceSession.create({
        data: {
          companyId: employee.companyId as string,
          branchId: employee.branchId,
          employeeId: employee.id,
          attendanceId: attendance.id,
          date: attendanceDate,
          checkIn: eventTime,
          checkInImageUrl: imageUrl,
          checkInSimilarity: similarity,
          notes: trimToNull(dto.notes),
        },
      });

      const adjustments = await this.syncAttendanceAdjustments(
        tx,
        attendance,
        template,
        actor.sub,
      );

      return { attendance, session, adjustments };
    });

    if (
      result.attendance.lateMinutes > 0 &&
      !(await this.hasApprovedLeave(employee.id, attendanceDate))
    ) {
      await this.notifyLate(employee, result.attendance.lateMinutes);
    }

    return this.toSessionResponse(result.session);
  }

  /**
   * Employee self-service check-out from the app. Closes the employee's
   * currently open AttendanceSession and extends the day's Attendance
   * checkOut to the latest event, same as selfCheckIn().
   */
  async selfCheckOut(
    dto: SelfAttendanceCheckOutDto,
    file: Express.Multer.File,
    actor: AccessTokenPayload,
  ) {
    const uploadedFile = assertFileProvided(file);
    const employee = await this.findEmployeeOrThrow(actor.sub);
    const template = await this.getKpiTemplateOrDefault(
      employee.companyId as string,
    );

    const eventTime = new Date();
    const attendanceDate = toZonedDateOnly(eventTime, employee.timezone);

    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        employeeId: employee.id,
        date: attendanceDate,
        checkOut: null,
      },
      orderBy: { checkIn: 'desc' },
    });

    if (!openSession) {
      throw new ConflictException('You must check in before check out');
    }

    const { imageUrl, similarity } = await this.verifyAndUploadAttendanceImage({
      employee,
      file: uploadedFile,
      similarityThreshold: template.faceSimilarityThreshold,
    });

    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employee.id,
          date: attendanceDate,
        },
      },
    });

    if (!existingAttendance) {
      throw new NotFoundException('Attendance record not found for this session');
    }

    const approvedLeaveHours = await this.getApprovedLeaveHours(
      employee.id,
      attendanceDate,
    );

    const result = await this.prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.update({
        where: { id: openSession.id },
        data: {
          checkOut: eventTime,
          checkOutImageUrl: imageUrl,
          checkOutSimilarity: similarity,
          workedMinutes: calculateMinutesDifference(
            openSession.checkIn,
            eventTime,
          ),
          notes: this.mergeNotes(openSession.notes, dto.notes),
        },
      });

      const nextTimes = this.collapseAttendanceTimes(
        existingAttendance,
        'check_out',
        eventTime,
      );
      const metrics = this.calculateAttendanceMetrics(
        employee.workSchedule,
        attendanceDate,
        nextTimes.checkIn,
        nextTimes.checkOut,
        employee.timezone,
        approvedLeaveHours,
      );

      const attendance = await tx.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          checkIn: nextTimes.checkIn,
          checkOut: nextTimes.checkOut,
          status: metrics.status,
          source: AttendanceSource.mobile,
          workStartTime: metrics.workStartTime,
          workEndTime: metrics.workEndTime,
          workedMinutes: metrics.workedMinutes,
          lateMinutes: metrics.lateMinutes,
          earlyLeaveMinutes: metrics.earlyLeaveMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          checkOutImageUrl: imageUrl,
        },
      });

      const adjustments = await this.syncAttendanceAdjustments(
        tx,
        attendance,
        template,
        actor.sub,
      );

      return { attendance, session, adjustments };
    });

    await this.notifyAdjustments(employee, result.adjustments);

    return this.toSessionResponse(result.session);
  }

  async selfListSessions(
    query: AttendanceSessionQueryDto,
    actor: AccessTokenPayload,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.AttendanceSessionWhereInput = {
      employeeId: actor.sub,
      ...(query.dateFrom || query.dateTo
        ? {
            date: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendanceSession.findMany({
        where,
        orderBy: [{ date: 'desc' }, { checkIn: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toSessionResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findAll(query: AttendanceQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const search = trimToNull(query.search);

    const where: Prisma.AttendanceWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.terminalId ? { terminalId: query.terminalId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.buildDateRangeFilter(query.dateFrom, query.dateTo),
      ...(search
        ? {
            employee: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { login: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { employeeNo: { contains: search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeNo: true,
              phone: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    const responses = await Promise.all(
      items.map(async (item) =>
        this.toResponse(
          item,
          await this.loadAdjustmentsForAttendance(item),
          undefined,
          item.employee,
        ),
      ),
    );

    return {
      items: responses,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNo: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }

    assertWithinScope(actor, attendance);

    return this.toResponse(
      attendance,
      await this.loadAdjustmentsForAttendance(attendance),
      undefined,
      attendance.employee,
    );
  }

  /**
   * Verifies the uploaded selfie (saved to disk by multer under
   * uploads/attendance/) against the employee's reference face image via AWS
   * Rekognition, then returns the local URL to persist on
   * Attendance/AttendanceSession. No S3 involved — Rekognition only reads the
   * file bytes for comparison, it never stores them.
   */
  private async verifyAndUploadAttendanceImage(input: {
    employee: UserWithSchedule;
    file: Express.Multer.File;
    similarityThreshold: number;
  }): Promise<{ imageUrl: string; similarity: number }> {
    const referenceImageUrl = trimToNull(input.employee.faceImageUrl);

    if (!referenceImageUrl) {
      throw new ConflictException(
        'Employee does not have a reference face image',
      );
    }

    const buffer = await readFile(input.file.path);

    const similarity =
      await this.awsFaceVerificationService.verifyAttendanceFace({
        sourceImageBuffer: buffer,
        referenceImageUrl,
        similarityThreshold: input.similarityThreshold,
      });

    return {
      imageUrl: buildUploadUrl('attendance', input.file.filename),
      similarity,
    };
  }

  private calculateAttendanceMetrics(
    workSchedule: WorkSchedule | null,
    attendanceDate: Date,
    checkIn: Date | null,
    checkOut: Date | null,
    timezone: string,
    approvedLeaveHours = 0,
  ): AttendanceMetrics {
    const workedMinutes = calculateMinutesDifference(checkIn, checkOut);

    if (!workSchedule?.isActive) {
      return {
        workStartTime: null,
        workEndTime: null,
        workedMinutes,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        status: this.resolveAttendanceStatus(0, 0, checkIn, checkOut),
      };
    }

    const workDays = this.extractWorkDays(workSchedule.workDays);

    if (!workDays.includes(getWorkDayNumber(attendanceDate))) {
      return {
        workStartTime: workSchedule.startTime,
        workEndTime: workSchedule.endTime,
        workedMinutes,
        lateMinutes: 0,
        earlyLeaveMinutes: 0,
        overtimeMinutes: 0,
        status: this.resolveAttendanceStatus(0, 0, checkIn, checkOut),
      };
    }

    const scheduledStart = parseTimeToZonedDate(
      attendanceDate,
      workSchedule.startTime,
      timezone,
    );
    const scheduledEnd = parseTimeToZonedDate(
      attendanceDate,
      workSchedule.endTime,
      timezone,
    );
    const graceMinutes = workSchedule.graceMinutes ?? 0;
    // Approved hourly leave at the start of the shift pushes the
    // "must be here by" line forward — lateness only counts beyond it.
    const effectiveStart = new Date(
      scheduledStart.getTime() + approvedLeaveHours * 60 * 60 * 1000,
    );

    const lateMinutes = checkIn
      ? Math.max(
          0,
          calculateMinutesDifference(effectiveStart, checkIn) - graceMinutes,
        )
      : 0;
    const earlyLeaveMinutes =
      checkOut && checkOut.getTime() < scheduledEnd.getTime()
        ? calculateMinutesDifference(checkOut, scheduledEnd)
        : 0;
    const overtimeMinutes =
      checkOut && checkOut.getTime() > scheduledEnd.getTime()
        ? calculateMinutesDifference(scheduledEnd, checkOut)
        : 0;

    return {
      workStartTime: workSchedule.startTime,
      workEndTime: workSchedule.endTime,
      workedMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      overtimeMinutes,
      status: this.resolveAttendanceStatus(
        lateMinutes,
        earlyLeaveMinutes,
        checkIn,
        checkOut,
      ),
    };
  }

  private resolveAttendanceStatus(
    lateMinutes: number,
    earlyLeaveMinutes: number,
    checkIn: Date | null,
    checkOut: Date | null,
  ): AttendanceStatus {
    if (!checkIn && !checkOut) {
      return AttendanceStatus.absent;
    }

    if (lateMinutes > 0) {
      return AttendanceStatus.late;
    }

    if (earlyLeaveMinutes > 0) {
      return AttendanceStatus.early_leave;
    }

    return AttendanceStatus.present;
  }

  private async syncAttendanceAdjustments(
    tx: Prisma.TransactionClient,
    attendance: Attendance,
    template: AttendanceKpiTemplate,
    actorId: string,
  ): Promise<AttendanceAdjustmentDto[]> {
    const reasonPrefix = `${AUTO_ATTENDANCE_REASON_PREFIX}:${attendance.id}:`;

    await tx.salaryAdjustment.deleteMany({
      where: {
        companyId: attendance.companyId,
        employeeId: attendance.employeeId,
        date: attendance.date,
        reason: {
          startsWith: reasonPrefix,
        },
      },
    });

    const adjustmentPayloads = [
      {
        shouldCreate:
          attendance.lateMinutes > 0 && template.latePenaltyPerMinute > 0,
        type: AdjustmentType.penalty,
        category: AdjustmentCategory.late,
        amount: attendance.lateMinutes * template.latePenaltyPerMinute,
        reason: `${reasonPrefix}late`,
      },
      {
        shouldCreate:
          attendance.earlyLeaveMinutes > 0 &&
          template.earlyLeavePenaltyPerMinute > 0,
        type: AdjustmentType.penalty,
        category: AdjustmentCategory.early_leave,
        amount:
          attendance.earlyLeaveMinutes * template.earlyLeavePenaltyPerMinute,
        reason: `${reasonPrefix}early_leave`,
      },
      {
        shouldCreate:
          attendance.overtimeMinutes > 0 && template.overtimeBonusPerMinute > 0,
        type: AdjustmentType.bonus,
        category: AdjustmentCategory.overtime,
        amount: attendance.overtimeMinutes * template.overtimeBonusPerMinute,
        reason: `${reasonPrefix}overtime`,
      },
    ].filter((item) => item.shouldCreate);

    const createdAdjustments = await Promise.all(
      adjustmentPayloads.map((item) =>
        tx.salaryAdjustment.create({
          data: {
            companyId: attendance.companyId,
            employeeId: attendance.employeeId,
            type: item.type,
            category: item.category,
            amount: item.amount,
            date: attendance.date,
            month: getMonthKey(attendance.date),
            reason: item.reason,
            createdById: actorId,
            updatedById: actorId,
          },
        }),
      ),
    );

    return createdAdjustments.map((item) => this.toAdjustmentDto(item));
  }

  private async loadAdjustmentsForAttendance(
    attendance: Attendance,
  ): Promise<AttendanceAdjustmentDto[]> {
    const adjustments = await this.prisma.salaryAdjustment.findMany({
      where: {
        companyId: attendance.companyId,
        employeeId: attendance.employeeId,
        date: attendance.date,
        reason: {
          startsWith: `${AUTO_ATTENDANCE_REASON_PREFIX}:${attendance.id}:`,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return adjustments.map((item) => this.toAdjustmentDto(item));
  }

  private toAdjustmentDto(item: SalaryAdjustment): AttendanceAdjustmentDto {
    return {
      id: item.id,
      type: item.type,
      category: item.category,
      amount: Number(item.amount),
      date: item.date,
      month: item.month,
      reason: item.reason,
    };
  }

  private toResponse(
    attendance: Attendance,
    appliedAdjustments: AttendanceAdjustmentDto[],
    faceSimilarity?: number,
    employee?: Pick<
      User,
      'id' | 'firstName' | 'lastName' | 'employeeNo' | 'phone' | 'avatarUrl'
    > | null,
  ) {
    return {
      id: attendance.id,
      companyId: attendance.companyId,
      branchId: attendance.branchId,
      employeeId: attendance.employeeId,
      employee: employee
        ? {
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeNo: employee.employeeNo,
            phone: employee.phone,
            avatarUrl: employee.avatarUrl,
          }
        : undefined,
      terminalId: attendance.terminalId,
      date: attendance.date,
      checkIn: attendance.checkIn,
      checkOut: attendance.checkOut,
      status: attendance.status,
      source: attendance.source,
      workStartTime: attendance.workStartTime,
      workEndTime: attendance.workEndTime,
      workedMinutes: attendance.workedMinutes,
      lateMinutes: attendance.lateMinutes,
      earlyLeaveMinutes: attendance.earlyLeaveMinutes,
      overtimeMinutes: attendance.overtimeMinutes,
      checkInImageUrl: attendance.checkInImageUrl,
      checkOutImageUrl: attendance.checkOutImageUrl,
      notes: attendance.notes,
      faceSimilarity,
      appliedAdjustments,
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
    };
  }

  /**
   * First-in/last-out collapse rule for a day's Attendance summary when it's
   * fed by discrete session events (mirrors TurnstileService's
   * getNextAttendanceTimes, applied here to the mobile self-check-in path).
   */
  private collapseAttendanceTimes(
    attendance: Attendance | null,
    eventType: 'check_in' | 'check_out',
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

    return {
      checkIn: currentCheckIn,
      checkOut:
        !currentCheckOut || eventTime.getTime() > currentCheckOut.getTime()
          ? eventTime
          : currentCheckOut,
    };
  }

  private toSessionResponse(session: AttendanceSession) {
    return {
      id: session.id,
      companyId: session.companyId,
      branchId: session.branchId,
      employeeId: session.employeeId,
      attendanceId: session.attendanceId,
      date: session.date,
      checkIn: session.checkIn,
      checkOut: session.checkOut,
      checkInImageUrl: session.checkInImageUrl,
      checkOutImageUrl: session.checkOutImageUrl,
      checkInSimilarity: session.checkInSimilarity,
      checkOutSimilarity: session.checkOutSimilarity,
      workedMinutes: session.workedMinutes,
      notes: session.notes,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private async findEmployeeOrThrow(
    employeeId: string,
  ): Promise<UserWithSchedule> {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      include: {
        workSchedule: true,
        company: { select: { timezone: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (!employee.companyId) {
      throw new ConflictException('Employee is not assigned to a company');
    }

    if (!employee.isActive || employee.isBlocked) {
      throw new ForbiddenException('Employee is inactive or blocked');
    }

    const workSchedule =
      employee.workSchedule ??
      (await this.findDefaultWorkSchedule(employee.companyId));

    return {
      ...employee,
      workSchedule,
      timezone: employee.company?.timezone ?? DEFAULT_TIMEZONE,
    };
  }

  private async findDefaultWorkSchedule(
    companyId: string,
  ): Promise<WorkSchedule | null> {
    const link = await this.prisma.workScheduleCompany.findFirst({
      where: { companyId, isDefault: true, workSchedule: { isActive: true } },
      include: { workSchedule: true },
    });
    return link?.workSchedule ?? null;
  }

  private async ensureTerminalBelongsToCompany(
    terminalId: string | undefined,
    companyId: string,
  ): Promise<string | null> {
    if (!terminalId) {
      return null;
    }

    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
      select: { id: true, companyId: true },
    });

    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }

    if (terminal.companyId !== companyId) {
      throw new ConflictException(
        'Terminal does not belong to the selected company',
      );
    }

    return terminal.id;
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private async getKpiTemplateOrDefault(
    companyId: string,
  ): Promise<AttendanceKpiTemplate> {
    await this.ensureCompanyExists(companyId);

    const setting = await this.prisma.setting.findUnique({
      where: {
        companyId_key: {
          companyId,
          key: ATTENDANCE_KPI_SETTING_KEY,
        },
      },
    });

    const value =
      setting?.value &&
      typeof setting.value === 'object' &&
      !Array.isArray(setting.value)
        ? (setting.value as Record<string, unknown>)
        : {};

    return {
      companyId,
      latePenaltyPerMinute: this.toNonNegativeNumber(
        value.latePenaltyPerMinute,
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.latePenaltyPerMinute,
      ),
      earlyLeavePenaltyPerMinute: this.toNonNegativeNumber(
        value.earlyLeavePenaltyPerMinute,
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.earlyLeavePenaltyPerMinute,
      ),
      overtimeBonusPerMinute: this.toNonNegativeNumber(
        value.overtimeBonusPerMinute,
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.overtimeBonusPerMinute,
      ),
      faceSimilarityThreshold: this.toNonNegativeNumber(
        value.faceSimilarityThreshold,
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.faceSimilarityThreshold,
      ),
    };
  }

  private normalizeKpiTemplate(
    dto: AttendanceKpiTemplateDto,
  ): Omit<AttendanceKpiTemplate, 'companyId'> {
    return {
      latePenaltyPerMinute:
        dto.latePenaltyPerMinute ??
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.latePenaltyPerMinute,
      earlyLeavePenaltyPerMinute:
        dto.earlyLeavePenaltyPerMinute ??
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.earlyLeavePenaltyPerMinute,
      overtimeBonusPerMinute:
        dto.overtimeBonusPerMinute ??
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.overtimeBonusPerMinute,
      faceSimilarityThreshold:
        dto.faceSimilarityThreshold ??
        DEFAULT_ATTENDANCE_KPI_TEMPLATE.faceSimilarityThreshold,
    };
  }

  private toNonNegativeNumber(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      return fallback;
    }

    return value;
  }

  private parseEventTime(value?: string): Date {
    const eventTime = value ? new Date(value) : new Date();

    if (Number.isNaN(eventTime.getTime())) {
      throw new BadRequestException(
        'eventTime must be a valid ISO date string',
      );
    }

    return eventTime;
  }

  private extractWorkDays(value: Prisma.JsonValue): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is number => typeof item === 'number');
  }

  private buildDateRangeFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.AttendanceWhereInput {
    if (!dateFrom && !dateTo) {
      return {};
    }

    return {
      date: {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      },
    };
  }

  private mergeNotes(
    existingNotes: string | null,
    incomingNotes?: string,
  ): string | null {
    const normalizedIncomingNotes = trimToNull(incomingNotes);

    if (!existingNotes) {
      return normalizedIncomingNotes;
    }

    if (!normalizedIncomingNotes) {
      return existingNotes;
    }

    return `${existingNotes}\n${normalizedIncomingNotes}`;
  }
}
