import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LeaveRequestStatus, LeaveType } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { NotificationService } from '../notification/notification.service';
import { notificationTemplates } from '../notification/notification.templates';
import { CreateEmployeeLeaveDto } from './dto/create-employee-leave.dto';
import { EmployeeLeaveQueryDto } from './dto/employee-leave-query.dto';
import { RequestEmployeeLeaveDto } from './dto/request-employee-leave.dto';
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';

type LeaveDateFilter = { fromDate: { lte: Date } } | { toDate: { gte: Date } };

type LeaveFilter = {
  companyId?: string;
  branchId?: string;
  employeeId?: string;
  type?: LeaveType;
  status?: LeaveRequestStatus;
  affectsSalary?: boolean;
  reason?: { contains: string; mode: 'insensitive' };
  AND?: LeaveDateFilter[];
};

type LeaveData = {
  companyId: string;
  branchId: string | null;
  employeeId: string;
  fromDate: Date;
  toDate: Date;
  days: number;
  updatedById: string;
  type?: LeaveType;
  affectsSalary?: boolean;
  reason?: string | null;
};

type Employee = {
  id: string;
  companyId: string | null;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
};

@Injectable()
export class EmployeeLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateEmployeeLeaveDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    const scope = getScope(actor, {
      companyId,
      branchId: dto.branchId,
    });
    await this.checkCompany(companyId);
    const branchId = await this.checkBranch(companyId, scope.branchId);

    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);
    if (toDate < fromDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const days = this.getDays(dto.days, fromDate, toDate);

    if (dto.applyToAllEmployees) {
      return this.createForAllEmployees(
        companyId,
        branchId,
        dto,
        fromDate,
        toDate,
        days,
        actor,
      );
    }

    if (!dto.employeeId) {
      throw new BadRequestException(
        'employeeId is required unless applyToAllEmployees is true',
      );
    }

    const employee = await this.checkEmployee(dto.employeeId, companyId);

    if (branchId && employee.branchId && employee.branchId !== branchId) {
      throw new ConflictException('Employee is not in the selected branch');
    }

    const employeeLeave = await this.prisma.employeeLeave.create({
      data: {
        companyId,
        branchId,
        employeeId: employee.id,
        type: dto.type,
        durationType: 'daily',
        fromDate,
        toDate,
        days,
        status: 'approved',
        affectsSalary: dto.affectsSalary ?? false,
        reason: trimToNull(dto.reason),
        createdById: actor.sub,
        updatedById: actor.sub,
      },
    });

    await this.notification.notifyUserWithTemplate(
      employee.id,
      notificationTemplates.employeeLeaveCreated(days, fromDate, toDate),
    );

    await this.notification.notifyOversight(
      companyId,
      employee.branchId ?? branchId,
      actor.sub,
      notificationTemplates.employeeLeaveCreatedForOversight(
        this.formatEmployeeName(employee),
        days,
        fromDate,
        toDate,
      ),
    );

    return employeeLeave;
  }

  private async createForAllEmployees(
    companyId: string,
    branchId: string | null,
    dto: CreateEmployeeLeaveDto,
    fromDate: Date,
    toDate: Date,
    days: number,
    actor: AccessTokenPayload,
  ) {
    const employees = await this.prisma.user.findMany({
      where: {
        companyId,
        role: 'employee',
        isActive: true,
        isBlocked: false,
        ...(branchId ? { branchId } : {}),
      },
      select: { id: true, branchId: true },
    });

    const items = await this.prisma.$transaction(
      employees.map((employee) =>
        this.prisma.employeeLeave.create({
          data: {
            companyId,
            branchId: branchId ?? employee.branchId,
            employeeId: employee.id,
            type: dto.type,
            durationType: 'daily',
            fromDate,
            toDate,
            days,
            status: 'approved',
            affectsSalary: dto.affectsSalary ?? false,
            reason: trimToNull(dto.reason),
            createdById: actor.sub,
            updatedById: actor.sub,
          },
        }),
      ),
    );

    await Promise.all(
      employees.map((employee) =>
        this.notification.notifyUserWithTemplate(
          employee.id,
          notificationTemplates.employeeLeaveCreated(days, fromDate, toDate),
        ),
      ),
    );

    return { items, total: items.length };
  }

  async request(dto: RequestEmployeeLeaveDto, actor: AccessTokenPayload) {
    const employee = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        firstName: true,
        lastName: true,
        phone: true,
      },
    });

    if (!employee?.companyId) {
      throw new ConflictException(
        'You must be assigned to a company to request leave',
      );
    }

    const fromDate = new Date(dto.fromDate);
    let toDate: Date;
    let days: number;
    let leaveHours: number | null = null;

    if (dto.durationType === 'hourly') {
      if (!dto.leaveHours) {
        throw new BadRequestException(
          'leaveHours is required for hourly leave (max 3)',
        );
      }
      toDate = fromDate;
      days = 0;
      leaveHours = dto.leaveHours;
    } else if (dto.durationType === 'daily') {
      toDate = fromDate;
      days = 1;
    } else {
      if (!dto.toDate) {
        throw new BadRequestException('toDate is required for multi_day leave');
      }
      toDate = new Date(dto.toDate);
      if (toDate < fromDate) {
        throw new BadRequestException('End date must be after start date');
      }
      days = this.getDays(undefined, fromDate, toDate);
    }

    const employeeLeave = await this.prisma.employeeLeave.create({
      data: {
        companyId: employee.companyId,
        branchId: employee.branchId,
        employeeId: employee.id,
        type: dto.type,
        durationType: dto.durationType,
        fromDate,
        toDate,
        days,
        leaveHours,
        status: 'pending',
        requestedById: employee.id,
        reason: trimToNull(dto.reason),
        createdById: employee.id,
        updatedById: employee.id,
      },
    });

    await this.notification.notifyOversight(
      employee.companyId,
      employee.branchId,
      employee.id,
      notificationTemplates.employeeLeaveRequested(
        employeeLeave.id,
        this.formatEmployeeName(employee),
        employee.phone,
        dto.durationType,
        fromDate,
        toDate,
        leaveHours,
      ),
    );

    return employeeLeave;
  }

  async approve(id: string, actor: AccessTokenPayload) {
    const existing = await this.getLeaveById(id);
    checkAccess(actor, existing);

    if (existing.status !== 'pending') {
      throw new ConflictException(
        'This leave request has already been responded to',
      );
    }

    const updated = await this.prisma.employeeLeave.update({
      where: { id },
      data: {
        status: 'approved',
        respondedById: actor.sub,
        respondedAt: new Date(),
        updatedById: actor.sub,
      },
    });

    await this.notification.notifyUserWithTemplate(
      existing.employeeId,
      notificationTemplates.employeeLeaveApproved(
        existing.durationType,
        existing.fromDate,
        existing.toDate,
        existing.leaveHours,
      ),
    );

    return updated;
  }

  async reject(id: string, actor: AccessTokenPayload) {
    const existing = await this.getLeaveById(id);
    checkAccess(actor, existing);

    if (existing.status !== 'pending') {
      throw new ConflictException(
        'This leave request has already been responded to',
      );
    }

    const updated = await this.prisma.employeeLeave.update({
      where: { id },
      data: {
        status: 'rejected',
        respondedById: actor.sub,
        respondedAt: new Date(),
        updatedById: actor.sub,
      },
    });

    await this.notification.notifyUserWithTemplate(
      existing.employeeId,
      notificationTemplates.employeeLeaveRejected(
        existing.durationType,
        existing.fromDate,
        existing.toDate,
        existing.leaveHours,
      ),
    );

    return updated;
  }

  async findAll(query: EmployeeLeaveQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: LeaveFilter = {};

    if (actor.role === 'employee') {
      where.employeeId = actor.sub;
    } else {
      const scope = getScope(actor, {
        companyId: query.companyId,
        branchId: query.branchId,
      });
      if (scope.companyId) {
        where.companyId = scope.companyId;
      }
      if (scope.branchId) {
        where.branchId = scope.branchId;
      }
      if (query.employeeId) {
        where.employeeId = query.employeeId;
      }
    }

    if (query.type) {
      where.type = query.type;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.affectsSalary !== undefined) {
      where.affectsSalary = query.affectsSalary;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.reason = { contains: search, mode: 'insensitive' };
    }

    const dateFilter = this.buildDateFilter(query.dateFrom, query.dateTo);
    if (dateFilter.length > 0) {
      where.AND = dateFilter;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employeeLeave.findMany({
        where,
        orderBy: [{ fromDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.employeeLeave.count({ where }),
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
    const employeeLeave = await this.getLeaveById(id);
    this.checkLeaveAccess(actor, employeeLeave);
    return employeeLeave;
  }

  async update(
    id: string,
    dto: UpdateEmployeeLeaveDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getLeaveById(id);
    checkAccess(actor, existing);

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
    }

    const requestedBranchId =
      dto.branchId !== undefined
        ? dto.branchId
        : (existing.branchId ?? undefined);
    const scope = getScope(actor, {
      companyId,
      branchId: requestedBranchId,
    });
    const branchId = await this.checkBranch(companyId, scope.branchId);

    const employee =
      dto.employeeId !== undefined
        ? await this.checkEmployee(dto.employeeId, companyId)
        : await this.checkEmployee(existing.employeeId, companyId);

    const fromDate = dto.fromDate ? new Date(dto.fromDate) : existing.fromDate;
    const toDate = dto.toDate ? new Date(dto.toDate) : existing.toDate;
    if (toDate < fromDate) {
      throw new BadRequestException('End date must be after start date');
    }

    if (branchId && employee.branchId && employee.branchId !== branchId) {
      throw new ConflictException('Employee is not in the selected branch');
    }

    let days = existing.days;
    if (dto.days !== undefined) {
      days = this.getDays(dto.days, fromDate, toDate);
    } else if (dto.fromDate || dto.toDate) {
      days = this.getDays(undefined, fromDate, toDate);
    }

    const data: LeaveData = {
      companyId,
      branchId,
      employeeId: employee.id,
      fromDate,
      toDate,
      days,
      updatedById: actor.sub,
    };
    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.affectsSalary !== undefined) {
      data.affectsSalary = dto.affectsSalary;
    }
    if (dto.reason !== undefined) {
      data.reason = trimToNull(dto.reason);
    }

    return this.prisma.employeeLeave.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const employeeLeave = await this.getLeaveById(id);
    checkAccess(actor, employeeLeave);

    await this.prisma.employeeLeave.delete({ where: { id } });

    return { success: true as const, id };
  }

  private async getLeaveById(id: string) {
    const employeeLeave = await this.prisma.employeeLeave.findUnique({
      where: { id },
    });
    if (!employeeLeave) {
      throw new NotFoundException('Employee leave not found');
    }
    return employeeLeave;
  }

  private checkLeaveAccess(
    actor: AccessTokenPayload,
    employeeLeave: {
      employeeId: string;
      companyId: string;
      branchId: string | null;
    },
  ): void {
    if (actor.role === 'employee') {
      if (employeeLeave.employeeId !== actor.sub) {
        throw new ForbiddenException(
          'You can only access your own leave records',
        );
      }
      return;
    }

    checkAccess(actor, employeeLeave);
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

  private async checkBranch(
    companyId: string,
    branchId?: string | null,
  ): Promise<string | null> {
    if (branchId == null) {
      return null;
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.companyId !== companyId) {
      throw new ConflictException('Branch is not in this company');
    }
    return branch.id;
  }

  private async checkEmployee(
    employeeId: string,
    companyId: string,
  ): Promise<Employee> {
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (employee.companyId !== companyId) {
      throw new ConflictException('Employee is not in this company');
    }
    return employee;
  }

  private formatEmployeeName(employee: {
    firstName: string | null;
    lastName: string | null;
  }): string {
    return (
      [employee.firstName, employee.lastName].filter(Boolean).join(' ') ||
      'Xodim'
    );
  }

  private getDays(
    days: number | undefined,
    fromDate: Date,
    toDate: Date,
  ): number {
    if (days !== undefined) {
      return days;
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    return (
      Math.floor((toDate.getTime() - fromDate.getTime()) / millisecondsPerDay) +
      1
    );
  }

  private buildDateFilter(
    dateFrom?: string,
    dateTo?: string,
  ): LeaveDateFilter[] {
    const filters: LeaveDateFilter[] = [];
    if (dateTo) {
      filters.push({ fromDate: { lte: new Date(dateTo) } });
    }
    if (dateFrom) {
      filters.push({ toDate: { gte: new Date(dateFrom) } });
    }
    return filters;
  }
}
