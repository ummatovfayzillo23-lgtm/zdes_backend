import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { NotificationService } from '../notification/notification.service';
import { notificationTemplates } from '../notification/notification.templates';
import { CreateEmployeeLeaveDto } from './dto/create-employee-leave.dto';
import { EmployeeLeaveQueryDto } from './dto/employee-leave-query.dto';
import { RequestEmployeeLeaveDto } from './dto/request-employee-leave.dto';
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';

@Injectable()
export class EmployeeLeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  /** Direct grant by superadmin/admin — immediately approved, no request cycle. */
  async create(dto: CreateEmployeeLeaveDto, actor: AccessTokenPayload) {
    const scopedCompanyId = resolveScopedCompanyId(actor, dto.companyId);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: scopedCompanyId,
      branchId: dto.branchId,
    });
    const companyId = await this.ensureCompanyExists(scopedCompanyId);
    const branchId = await this.resolveBranchId(companyId, scope.branchId);
    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);

    this.ensureDateRange(
      fromDate,
      toDate,
      'Leave end date must be after start date',
    );

    const days = this.resolveDays(dto.days, fromDate, toDate);

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

    const employee = await this.ensureEmployeeBelongsToCompany(
      dto.employeeId,
      companyId,
    );

    if (branchId && employee.branchId && employee.branchId !== branchId) {
      throw new ConflictException(
        'Employee does not belong to the selected branch',
      );
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

  /** Employee self-service — creates a pending request awaiting approval. */
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
      this.ensureDateRange(
        fromDate,
        toDate,
        'Leave end date must be after start date',
      );
      days = this.resolveDays(undefined, fromDate, toDate);
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
    const existing = await this.findEmployeeLeaveByIdOrThrow(id);
    assertWithinScope(actor, existing);

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
    const existing = await this.findEmployeeLeaveByIdOrThrow(id);
    assertWithinScope(actor, existing);

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
    const search = trimToNull(query.search);
    const scope =
      actor.role === 'employee'
        ? {}
        : resolveCompanyBranchScope(actor, {
            companyId: query.companyId,
            branchId: query.branchId,
          });

    const where: Prisma.EmployeeLeaveWhereInput = {
      ...('companyId' in scope && scope.companyId
        ? { companyId: scope.companyId }
        : {}),
      ...('branchId' in scope && scope.branchId
        ? { branchId: scope.branchId }
        : {}),
      ...(actor.role === 'employee'
        ? { employeeId: actor.sub }
        : query.employeeId
          ? { employeeId: query.employeeId }
          : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.affectsSalary !== undefined
        ? { affectsSalary: query.affectsSalary }
        : {}),
      ...(search ? { reason: { contains: search, mode: 'insensitive' } } : {}),
      ...this.buildDateOverlapFilter(query.dateFrom, query.dateTo),
    };

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
    const employeeLeave = await this.findEmployeeLeaveByIdOrThrow(id);
    this.assertEmployeeLeaveAccessible(actor, employeeLeave);
    return employeeLeave;
  }

  async update(
    id: string,
    dto: UpdateEmployeeLeaveDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findEmployeeLeaveByIdOrThrow(id);
    assertWithinScope(actor, existing);

    const companyId =
      dto.companyId !== undefined
        ? await this.ensureCompanyExists(
            resolveScopedCompanyId(actor, dto.companyId),
          )
        : existing.companyId;
    const scope = resolveCompanyBranchScope(actor, {
      companyId,
      branchId:
        dto.branchId !== undefined
          ? dto.branchId
          : (existing.branchId ?? undefined),
    });
    const branchId =
      dto.branchId !== undefined
        ? await this.resolveBranchId(companyId, scope.branchId)
        : await this.resolveBranchId(companyId, existing.branchId);
    const employee =
      dto.employeeId !== undefined
        ? await this.ensureEmployeeBelongsToCompany(dto.employeeId, companyId)
        : await this.ensureEmployeeBelongsToCompany(
            existing.employeeId,
            companyId,
          );
    const fromDate = dto.fromDate ? new Date(dto.fromDate) : existing.fromDate;
    const toDate = dto.toDate ? new Date(dto.toDate) : existing.toDate;

    this.ensureDateRange(
      fromDate,
      toDate,
      'Leave end date must be after start date',
    );

    if (branchId && employee.branchId && employee.branchId !== branchId) {
      throw new ConflictException(
        'Employee does not belong to the selected branch',
      );
    }

    const days =
      dto.days !== undefined
        ? this.resolveDays(dto.days, fromDate, toDate)
        : dto.fromDate || dto.toDate
          ? this.resolveDays(undefined, fromDate, toDate)
          : existing.days;

    return this.prisma.employeeLeave.update({
      where: { id },
      data: {
        companyId,
        branchId,
        employeeId: employee.id,
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        fromDate,
        toDate,
        days,
        ...(dto.affectsSalary !== undefined
          ? { affectsSalary: dto.affectsSalary }
          : {}),
        ...(dto.reason !== undefined ? { reason: trimToNull(dto.reason) } : {}),
        updatedById: actor.sub,
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const employeeLeave = await this.findEmployeeLeaveByIdOrThrow(id);
    assertWithinScope(actor, employeeLeave);

    await this.prisma.employeeLeave.delete({
      where: { id },
    });

    return {
      success: true as const,
      id,
    };
  }

  private async findEmployeeLeaveByIdOrThrow(id: string) {
    const employeeLeave = await this.prisma.employeeLeave.findUnique({
      where: { id },
    });

    if (!employeeLeave) {
      throw new NotFoundException('Employee leave not found');
    }

    return employeeLeave;
  }

  private assertEmployeeLeaveAccessible(
    actor: AccessTokenPayload,
    employeeLeave: { employeeId: string; companyId: string; branchId: string | null },
  ): void {
    if (actor.role === 'employee') {
      if (employeeLeave.employeeId !== actor.sub) {
        throw new ForbiddenException(
          'You can only access your own leave records',
        );
      }
      return;
    }

    assertWithinScope(actor, employeeLeave);
  }

  private async ensureCompanyExists(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company.id;
  }

  private async resolveBranchId(
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
      throw new ConflictException(
        'Branch does not belong to the selected company',
      );
    }

    return branch.id;
  }

  private async ensureEmployeeBelongsToCompany(
    employeeId: string,
    companyId: string,
  ) {
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
      throw new ConflictException(
        'Employee does not belong to the selected company',
      );
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

  private ensureDateRange(
    startDate: Date,
    endDate: Date,
    message: string,
  ): void {
    if (endDate < startDate) {
      throw new BadRequestException(message);
    }
  }

  private resolveDays(
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

  private buildDateOverlapFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.EmployeeLeaveWhereInput {
    if (!dateFrom && !dateTo) {
      return {};
    }

    const fromDate = dateFrom ? new Date(dateFrom) : undefined;
    const toDate = dateTo ? new Date(dateTo) : undefined;

    return {
      AND: [
        ...(toDate ? [{ fromDate: { lte: toDate } }] : []),
        ...(fromDate ? [{ toDate: { gte: fromDate } }] : []),
      ],
    };
  }
}
