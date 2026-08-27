import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TerminalEventType } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateRawAttendanceLogDto } from './dto/create-raw-attendance-log.dto';
import { RawAttendanceLogQueryDto } from './dto/raw-attendance-log-query.dto';
import { UpdateRawAttendanceLogDto } from './dto/update-raw-attendance-log.dto';

type RawLogFilter = {
  companyId?: string;
  employee?: { branchId: string };
  terminalId?: string;
  employeeId?: string;
  attendanceId?: string;
  eventType?: TerminalEventType;
  processed?: boolean;
  deviceUserId?: { contains: string; mode: 'insensitive' };
  eventTime?: { gte?: Date; lte?: Date };
};

type RawLogData = {
  companyId?: string;
  terminalId?: string;
  employeeId?: string | null;
  attendanceId?: string | null;
  deviceUserId?: string;
  eventTime?: Date;
  eventType?: TerminalEventType;
  rawPayload?: Prisma.InputJsonValue;
  processed?: boolean;
  error?: string | null;
};

@Injectable()
export class RawAttendanceLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRawAttendanceLogDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);

    const terminalId = await this.checkTerminal(dto.terminalId, companyId);
    const employeeId = dto.employeeId
      ? await this.checkEmployee(dto.employeeId, companyId, actor)
      : null;
    const attendanceId = dto.attendanceId
      ? await this.checkAttendance(dto.attendanceId, companyId, employeeId)
      : null;

    const deviceUserId = trimToNull(dto.deviceUserId);
    if (!deviceUserId) {
      throw new ConflictException('Device user id is required');
    }

    return this.prisma.rawAttendanceLog.create({
      data: {
        companyId,
        terminalId,
        employeeId,
        attendanceId,
        deviceUserId,
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

    const scope = getScope(actor, { companyId: query.companyId });

    const where: RawLogFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.employee = { branchId: scope.branchId };
    }
    if (query.terminalId) {
      where.terminalId = query.terminalId;
    }
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }
    if (query.attendanceId) {
      where.attendanceId = query.attendanceId;
    }
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.processed !== undefined) {
      where.processed = query.processed;
    }

    const deviceUserId = trimToNull(query.deviceUserId);
    if (deviceUserId) {
      where.deviceUserId = { contains: deviceUserId, mode: 'insensitive' };
    }

    const eventFilter = this.buildEventFilter(query.eventFrom, query.eventTo);
    if (eventFilter) {
      where.eventTime = eventFilter;
    }

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
    const log = await this.getLogById(id);
    await this.checkRecordAccess(actor, log);
    return log;
  }

  async update(
    id: string,
    dto: UpdateRawAttendanceLogDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getLogById(id);
    await this.checkRecordAccess(actor, existing);

    const data: RawLogData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (dto.terminalId !== undefined) {
      data.terminalId = await this.checkTerminal(dto.terminalId, companyId);
    } else if (dto.companyId !== undefined) {
      data.terminalId = await this.checkTerminal(
        existing.terminalId,
        companyId,
      );
    }

    let employeeId = existing.employeeId;
    if (dto.employeeId !== undefined) {
      employeeId = dto.employeeId
        ? await this.checkEmployee(dto.employeeId, companyId, actor)
        : null;
      data.employeeId = employeeId;
    }

    if (dto.attendanceId !== undefined) {
      data.attendanceId = dto.attendanceId
        ? await this.checkAttendance(dto.attendanceId, companyId, employeeId)
        : null;
    }

    if (dto.deviceUserId !== undefined) {
      const deviceUserId = trimToNull(dto.deviceUserId);
      if (!deviceUserId) {
        throw new ConflictException('Device user id is required');
      }
      data.deviceUserId = deviceUserId;
    }
    if (dto.eventTime !== undefined) {
      data.eventTime = new Date(dto.eventTime);
    }
    if (dto.eventType !== undefined) {
      data.eventType = dto.eventType;
    }
    if (dto.rawPayload !== undefined) {
      data.rawPayload = dto.rawPayload as Prisma.InputJsonValue;
    }
    if (dto.processed !== undefined) {
      data.processed = dto.processed;
    }
    if (dto.error !== undefined) {
      data.error = trimToNull(dto.error);
    }

    return this.prisma.rawAttendanceLog.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const log = await this.getLogById(id);
    await this.checkRecordAccess(actor, log);
    await this.prisma.rawAttendanceLog.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getLogById(id: string) {
    const log = await this.prisma.rawAttendanceLog.findUnique({
      where: { id },
    });
    if (!log) {
      throw new NotFoundException('Raw attendance log not found');
    }
    return log;
  }

  private async checkRecordAccess(
    actor: AccessTokenPayload,
    record: { companyId: string; employeeId: string | null },
  ): Promise<void> {
    if (
      actor.role === 'superadmin' ||
      actor.role === 'admin' ||
      !record.employeeId
    ) {
      checkAccess(actor, record);
      return;
    }

    const employee = await this.prisma.user.findUnique({
      where: { id: record.employeeId },
      select: { branchId: true },
    });
    checkAccess(actor, {
      companyId: record.companyId,
      branchId: employee?.branchId,
    });
  }

  private async checkCompany(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private async checkTerminal(
    terminalId: string,
    companyId: string,
  ): Promise<string> {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
      select: { id: true, companyId: true },
    });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }
    if (terminal.companyId !== companyId) {
      throw new ConflictException('Terminal is not in this company');
    }
    return terminal.id;
  }

  private async checkEmployee(
    employeeId: string,
    companyId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.companyId !== companyId) {
      throw new ConflictException('Employee is not in this company');
    }
    checkAccess(actor, employee);
    return employee.id;
  }

  private async checkAttendance(
    attendanceId: string,
    companyId: string,
    employeeId: string | null,
  ): Promise<string> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      select: { id: true, companyId: true, employeeId: true },
    });
    if (!attendance) {
      throw new NotFoundException('Attendance not found');
    }
    if (attendance.companyId !== companyId) {
      throw new ConflictException('Attendance is not in this company');
    }
    if (employeeId && attendance.employeeId !== employeeId) {
      throw new ConflictException('Attendance is not for this employee');
    }
    return attendance.id;
  }

  private buildEventFilter(
    eventFrom?: string,
    eventTo?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!eventFrom && !eventTo) {
      return undefined;
    }

    const range: { gte?: Date; lte?: Date } = {};
    if (eventFrom) {
      range.gte = new Date(eventFrom);
    }
    if (eventTo) {
      range.lte = new Date(eventTo);
    }
    return range;
  }
}
