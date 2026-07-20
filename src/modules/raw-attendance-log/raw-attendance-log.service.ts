import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateRawAttendanceLogDto } from './dto/create-raw-attendance-log.dto';
import { RawAttendanceLogQueryDto } from './dto/raw-attendance-log-query.dto';
import { UpdateRawAttendanceLogDto } from './dto/update-raw-attendance-log.dto';

@Injectable()
export class RawAttendanceLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRawAttendanceLogDto, actor: AccessTokenPayload) {
    const companyId = await this.ensureCompanyExists(
      resolveScopedCompanyId(actor, dto.companyId),
    );
    const terminalId = await this.ensureTerminalBelongsToCompany(
      dto.terminalId,
      companyId,
    );
    const employeeId = dto.employeeId
      ? await this.ensureEmployeeInScope(dto.employeeId, companyId, actor)
      : null;
    const attendanceId = dto.attendanceId
      ? await this.ensureAttendanceBelongsToCompany(
          dto.attendanceId,
          companyId,
          employeeId,
        )
      : null;

    return this.prisma.rawAttendanceLog.create({
      data: {
        companyId,
        terminalId,
        employeeId,
        attendanceId,
        deviceUserId: this.normalizeRequired(
          dto.deviceUserId,
          'Device user id is required',
        ),
        eventTime: new Date(dto.eventTime),
        eventType: dto.eventType,
        rawPayload: dto.rawPayload as Prisma.InputJsonValue | undefined,
        processed: dto.processed,
        error: trimToNull(dto.error),
      },
    });
  }

  async findAll(query: RawAttendanceLogQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
    });

    const where: Prisma.RawAttendanceLogWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.terminalId ? { terminalId: query.terminalId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.attendanceId ? { attendanceId: query.attendanceId } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
      ...(query.processed !== undefined ? { processed: query.processed } : {}),
      ...(trimToNull(query.deviceUserId)
        ? {
            deviceUserId: {
              contains: trimToNull(query.deviceUserId) as string,
              mode: 'insensitive',
            },
          }
        : {}),
      ...this.buildEventRangeFilter(query.eventFrom, query.eventTo),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.rawAttendanceLog.findMany({
        where,
        orderBy: [{ eventTime: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.rawAttendanceLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    const log = await this.findRawAttendanceLogByIdOrThrow(id);
    await this.assertRecordInScope(actor, log);
    return log;
  }

  async update(
    id: string,
    dto: UpdateRawAttendanceLogDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findRawAttendanceLogByIdOrThrow(id);
    await this.assertRecordInScope(actor, existing);

    const companyId =
      dto.companyId !== undefined
        ? await this.ensureCompanyExists(
            resolveScopedCompanyId(actor, dto.companyId),
          )
        : existing.companyId;
    const terminalId =
      dto.terminalId !== undefined
        ? await this.ensureTerminalBelongsToCompany(dto.terminalId, companyId)
        : await this.ensureTerminalBelongsToCompany(
            existing.terminalId,
            companyId,
          );
    const employeeId =
      dto.employeeId !== undefined
        ? dto.employeeId
          ? await this.ensureEmployeeInScope(dto.employeeId, companyId, actor)
          : null
        : existing.employeeId;
    const attendanceId =
      dto.attendanceId !== undefined
        ? dto.attendanceId
          ? await this.ensureAttendanceBelongsToCompany(
              dto.attendanceId,
              companyId,
              employeeId,
            )
          : null
        : existing.attendanceId;

    return this.prisma.rawAttendanceLog.update({
      where: { id },
      data: {
        companyId,
        terminalId,
        employeeId,
        attendanceId,
        ...(dto.deviceUserId !== undefined
          ? {
              deviceUserId: this.normalizeRequired(
                dto.deviceUserId,
                'Device user id is required',
              ),
            }
          : {}),
        ...(dto.eventTime !== undefined
          ? { eventTime: new Date(dto.eventTime) }
          : {}),
        ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
        ...(dto.rawPayload !== undefined
          ? { rawPayload: dto.rawPayload as Prisma.InputJsonValue }
          : {}),
        ...(dto.processed !== undefined ? { processed: dto.processed } : {}),
        ...(dto.error !== undefined ? { error: trimToNull(dto.error) } : {}),
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const log = await this.findRawAttendanceLogByIdOrThrow(id);
    await this.assertRecordInScope(actor, log);
    await this.prisma.rawAttendanceLog.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findRawAttendanceLogByIdOrThrow(id: string) {
    const log = await this.prisma.rawAttendanceLog.findUnique({
      where: { id },
    });
    if (!log) {
      throw new NotFoundException('Raw attendance log not found');
    }
    return log;
  }

  private async assertRecordInScope(
    actor: AccessTokenPayload,
    record: { companyId: string; employeeId: string | null },
  ): Promise<void> {
    if (
      actor.role === 'superadmin' ||
      actor.role === 'admin' ||
      !record.employeeId
    ) {
      assertWithinScope(actor, record);
      return;
    }

    const employee = await this.prisma.user.findUnique({
      where: { id: record.employeeId },
      select: { branchId: true },
    });
    assertWithinScope(actor, {
      companyId: record.companyId,
      branchId: employee?.branchId,
    });
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company.id;
  }

  private async ensureTerminalBelongsToCompany(
    terminalId: string,
    companyId: string,
  ) {
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

  private async ensureEmployeeInScope(
    employeeId: string,
    companyId: string,
    actor: AccessTokenPayload,
  ) {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.companyId !== companyId) {
      throw new ConflictException(
        'Employee does not belong to the selected company',
      );
    }
    assertWithinScope(actor, employee);
    return employee.id;
  }

  private async ensureAttendanceBelongsToCompany(
    attendanceId: string,
    companyId: string,
    employeeId: string | null,
  ) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }
    if (attendance.companyId !== companyId) {
      throw new ConflictException(
        'Attendance does not belong to the selected company',
      );
    }
    if (employeeId && attendance.employeeId !== employeeId) {
      throw new ConflictException(
        'Attendance does not belong to the selected employee',
      );
    }
    return attendance.id;
  }

  private buildEventRangeFilter(
    eventFrom?: string,
    eventTo?: string,
  ): Prisma.RawAttendanceLogWhereInput {
    if (!eventFrom && !eventTo) {
      return {};
    }

    return {
      eventTime: {
        ...(eventFrom ? { gte: new Date(eventFrom) } : {}),
        ...(eventTo ? { lte: new Date(eventTo) } : {}),
      },
    };
  }

  private normalizeRequired(value: string, message: string) {
    const normalized = trimToNull(value);
    if (!normalized) {
      throw new ConflictException(message);
    }
    return normalized;
  }
}
