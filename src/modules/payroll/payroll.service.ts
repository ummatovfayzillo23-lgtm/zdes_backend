import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { PayrollStatsQueryDto } from './dto/payroll-stats-query.dto';
import { RecordPayrollPaymentDto } from './dto/record-payroll-payment.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePayrollDto, actor: AccessTokenPayload) {
    const companyId = await this.ensureCompanyExists(
      resolveScopedCompanyId(actor, dto.companyId),
    );
    const employeeId = await this.ensureEmployeeInScope(
      dto.employeeId,
      companyId,
      actor,
    );
    const month = this.normalizeRequired(
      dto.month,
      'Payroll month is required',
    );
    const paidById = await this.resolvePaidById(dto.paidById);

    await this.ensureUniquePayroll(employeeId, month);

    return this.prisma.payroll.create({
      data: {
        companyId,
        employeeId,
        month,
        baseSalary: dto.baseSalary,
        totalBonus: dto.totalBonus,
        totalPenalty: dto.totalPenalty,
        totalAdvance: dto.totalAdvance,
        netSalary: dto.netSalary,
        status: dto.status,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        paidById,
        createdById: actor.sub,
        updatedById: actor.sub,
      },
    });
  }

  async findAll(query: PayrollQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: Prisma.PayrollWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(trimToNull(query.month)
        ? { month: trimToNull(query.month) as string }
        : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payroll.findMany({
        where,
        orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.payroll.count({ where }),
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
    const payroll = await this.findPayrollByIdOrThrow(id);
    await this.assertRecordInScope(actor, payroll);
    return payroll;
  }

  async update(id: string, dto: UpdatePayrollDto, actor: AccessTokenPayload) {
    const existing = await this.findPayrollByIdOrThrow(id);
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
    const month =
      dto.month !== undefined
        ? this.normalizeRequired(dto.month, 'Payroll month is required')
        : existing.month;
    const paidById =
      dto.paidById !== undefined
        ? await this.resolvePaidById(dto.paidById)
        : existing.paidById;

    await this.ensureUniquePayroll(employeeId, month, id);

    return this.prisma.payroll.update({
      where: { id },
      data: {
        companyId,
        employeeId,
        month,
        ...(dto.baseSalary !== undefined ? { baseSalary: dto.baseSalary } : {}),
        ...(dto.totalBonus !== undefined ? { totalBonus: dto.totalBonus } : {}),
        ...(dto.totalPenalty !== undefined
          ? { totalPenalty: dto.totalPenalty }
          : {}),
        ...(dto.totalAdvance !== undefined
          ? { totalAdvance: dto.totalAdvance }
          : {}),
        ...(dto.netSalary !== undefined ? { netSalary: dto.netSalary } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.paidAt !== undefined
          ? { paidAt: dto.paidAt ? new Date(dto.paidAt) : null }
          : {}),
        paidById,
        updatedById: actor.sub,
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const payroll = await this.findPayrollByIdOrThrow(id);
    await this.assertRecordInScope(actor, payroll);
    await this.prisma.payroll.delete({ where: { id } });
    return { success: true as const, id };
  }

  async recordPayment(
    id: string,
    dto: RecordPayrollPaymentDto,
    actor: AccessTokenPayload,
  ) {
    const payroll = await this.findPayrollByIdOrThrow(id);
    await this.assertRecordInScope(actor, payroll);

    if (payroll.status === PayrollStatus.cancelled) {
      throw new ConflictException('Cannot pay a cancelled payroll');
    }

    const netSalary = Number(payroll.netSalary);
    if (netSalary <= 0) {
      throw new ConflictException('Payroll has no net salary set');
    }

    const paidSoFar = Number(payroll.paidAmount);
    const newPaidAmount = paidSoFar + dto.amount;

    if (newPaidAmount > netSalary) {
      throw new BadRequestException(
        'Payment amount exceeds the remaining balance',
      );
    }

    const status =
      newPaidAmount >= netSalary
        ? PayrollStatus.paid
        : PayrollStatus.partially_paid;

    return this.prisma.payroll.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        status,
        paidAt: new Date(),
        paidById: actor.sub,
        updatedById: actor.sub,
      },
    });
  }

  async getStatistics(query: PayrollStatsQueryDto, actor: AccessTokenPayload) {
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });
    const month = trimToNull(query.month);

    const payrollWhere: Prisma.PayrollWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(month ? { month } : {}),
    };

    const advanceWhere: Prisma.AdvanceWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(month ? { month } : {}),
    };

    const [aggregate, statusGroups, advanceAggregate] = await Promise.all([
      this.prisma.payroll.aggregate({
        where: payrollWhere,
        _sum: {
          baseSalary: true,
          totalBonus: true,
          totalPenalty: true,
          netSalary: true,
          paidAmount: true,
        },
        _count: true,
      }),
      this.prisma.payroll.groupBy({
        by: ['status'],
        where: payrollWhere,
        _count: true,
      }),
      this.prisma.advance.aggregate({
        where: advanceWhere,
        _sum: { amount: true },
      }),
    ]);

    const totalNetSalary = Number(aggregate._sum.netSalary ?? 0);
    const totalPaid = Number(aggregate._sum.paidAmount ?? 0);

    const statusBreakdown: Record<PayrollStatus, number> = {
      draft: 0,
      confirmed: 0,
      partially_paid: 0,
      paid: 0,
      cancelled: 0,
    };
    for (const group of statusGroups) {
      statusBreakdown[group.status] = group._count;
    }

    return {
      month: month ?? undefined,
      employeeCount: aggregate._count,
      totalBaseSalary: Number(aggregate._sum.baseSalary ?? 0),
      totalBonus: Number(aggregate._sum.totalBonus ?? 0),
      totalPenalty: Number(aggregate._sum.totalPenalty ?? 0),
      totalNetSalary,
      totalPaid,
      totalRemaining: Math.max(0, totalNetSalary - totalPaid),
      totalAdvance: Number(advanceAggregate._sum.amount ?? 0),
      statusBreakdown,
    };
  }

  private async findPayrollByIdOrThrow(id: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) {
      throw new NotFoundException('Payroll not found');
    }
    return payroll;
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

  private async resolvePaidById(paidById?: string | null) {
    if (paidById == null) {
      return null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: paidById },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Paid by user not found');
    }

    return user.id;
  }

  private async ensureUniquePayroll(
    employeeId: string,
    month: string,
    excludedId?: string,
  ) {
    const payroll = await this.prisma.payroll.findFirst({
      where: {
        employeeId,
        month,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });

    if (payroll) {
      throw new ConflictException(
        'Payroll already exists for this employee and month',
      );
    }
  }

  private normalizeRequired(value: string, message: string) {
    const normalized = trimToNull(value);
    if (!normalized) {
      throw new ConflictException(message);
    }
    return normalized;
  }
}
