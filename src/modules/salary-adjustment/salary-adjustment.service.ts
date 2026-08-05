import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { getMonthKey, trimToNull } from '../../common/utils/helpers';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { NotificationService } from '../notification/notification.service';
import { notificationTemplates } from '../notification/notification.templates';
import { CreateSalaryAdjustmentDto } from './dto/create-salary-adjustment.dto';
import { SalaryAdjustmentQueryDto } from './dto/salary-adjustment-query.dto';
import { UpdateSalaryAdjustmentDto } from './dto/update-salary-adjustment.dto';

@Injectable()
export class SalaryAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateSalaryAdjustmentDto, actor: AccessTokenPayload) {
    const companyId = await this.ensureCompanyExists(
      resolveScopedCompanyId(actor, dto.companyId),
    );
    const employeeId = await this.ensureEmployeeInScope(
      dto.employeeId,
      companyId,
      actor,
    );
    const adjustmentDate = new Date(dto.date);

    const adjustment = await this.prisma.salaryAdjustment.create({
      data: {
        companyId,
        employeeId,
        type: dto.type,
        category: dto.category,
        amount: dto.amount,
        date: adjustmentDate,
        month: trimToNull(dto.month) ?? getMonthKey(adjustmentDate),
        reason: trimToNull(dto.reason),
        createdById: actor.sub,
        updatedById: actor.sub,
      },
    });

    await this.notification.notifyUserWithTemplate(
      employeeId,
      notificationTemplates.adjustmentApplied(
        dto.type,
        Number(dto.amount),
        dto.category ?? 'manual',
      ),
    );

    return adjustment;
  }

  async findAll(query: SalaryAdjustmentQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
    });

    const where: Prisma.SalaryAdjustmentWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(trimToNull(query.month)
        ? { month: trimToNull(query.month) as string }
        : {}),
      ...(search ? { reason: { contains: search, mode: 'insensitive' } } : {}),
      ...this.buildDateRangeFilter(query.dateFrom, query.dateTo),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.salaryAdjustment.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.salaryAdjustment.count({ where }),
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
    const adjustment = await this.findSalaryAdjustmentByIdOrThrow(id);
    await this.assertRecordInScope(actor, adjustment);
    return adjustment;
  }

  async update(
    id: string,
    dto: UpdateSalaryAdjustmentDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findSalaryAdjustmentByIdOrThrow(id);
    await this.assertRecordInScope(actor, existing);

    const companyId =
      dto.companyId !== undefined
        ? await this.ensureCompanyExists(
            resolveScopedCompanyId(actor, dto.companyId),
          )
        : existing.companyId;
    const employeeId =
      dto.employeeId !== undefined
        ? await this.ensureEmployeeInScope(dto.employeeId, companyId, actor)
        : await this.ensureEmployeeInScope(
            existing.employeeId,
            companyId,
            actor,
          );
    const date = dto.date ? new Date(dto.date) : existing.date;
    const month =
      dto.month !== undefined
        ? (trimToNull(dto.month) ?? getMonthKey(date))
        : dto.date
          ? getMonthKey(date)
          : existing.month;

    return this.prisma.salaryAdjustment.update({
      where: { id },
      data: {
        companyId,
        employeeId,
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date ? { date } : {}),
        month,
        ...(dto.reason !== undefined ? { reason: trimToNull(dto.reason) } : {}),
        updatedById: actor.sub,
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const adjustment = await this.findSalaryAdjustmentByIdOrThrow(id);
    await this.assertRecordInScope(actor, adjustment);
    await this.prisma.salaryAdjustment.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findSalaryAdjustmentByIdOrThrow(id: string) {
    const adjustment = await this.prisma.salaryAdjustment.findUnique({
      where: { id },
    });
    if (!adjustment) {
      throw new NotFoundException('Salary adjustment not found');
    }
    return adjustment;
  }

  private async assertRecordInScope(
    actor: AccessTokenPayload,
    record: { companyId: string; employeeId: string },
  ): Promise<void> {
    if (actor.role === 'superadmin' || actor.role === 'admin') {
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

  private buildDateRangeFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.SalaryAdjustmentWhereInput {
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
}
