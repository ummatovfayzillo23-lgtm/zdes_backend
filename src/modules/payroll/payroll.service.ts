import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PayrollStatus } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { PayrollQueryDto } from './dto/payroll-query.dto';
import { PayrollStatsQueryDto } from './dto/payroll-stats-query.dto';
import { RecordPayrollPaymentDto } from './dto/record-payroll-payment.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';

type PayrollFilter = {
  companyId?: string;
  employee?: { branchId: string };
  employeeId?: string;
  month?: string;
  status?: PayrollStatus;
};

type AdvanceFilter = {
  companyId?: string;
  employee?: { branchId: string };
  employeeId?: string;
  month?: string;
};

type PayrollData = {
  updatedById: string;
  companyId?: string;
  employeeId?: string;
  month?: string;
  baseSalary?: number;
  totalBonus?: number;
  totalPenalty?: number;
  totalAdvance?: number;
  netSalary?: number;
  status?: PayrollStatus;
  paidAt?: Date | null;
  paidById?: string | null;
};

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePayrollDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);
    const employeeId = await this.checkEmployee(
      dto.employeeId,
      companyId,
      actor,
    );

    const month = trimToNull(dto.month);
    if (!month) {
      throw new ConflictException('Month is required');
    }
    const paidById = await this.checkPaidBy(dto.paidById);

    await this.checkPayrollUnique(employeeId, month);

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

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: PayrollFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.employee = { branchId: scope.branchId };
    }
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }

    const month = trimToNull(query.month);
    if (month) {
      where.month = month;
    }
    if (query.status) {
      where.status = query.status;
    }

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
    const payroll = await this.getPayrollById(id);
    await this.checkRecordAccess(actor, payroll);
    return payroll;
  }

  async update(id: string, dto: UpdatePayrollDto, actor: AccessTokenPayload) {
    const existing = await this.getPayrollById(id);
    await this.checkRecordAccess(actor, existing);

    const data: PayrollData = { updatedById: actor.sub };

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    let employeeId = existing.employeeId;
    if (dto.employeeId !== undefined) {
      employeeId = await this.checkEmployee(dto.employeeId, companyId, actor);
      data.employeeId = employeeId;
    } else if (dto.companyId !== undefined) {
      employeeId = await this.checkEmployee(
        existing.employeeId,
        companyId,
        actor,
      );
      data.employeeId = employeeId;
    }

    let month = existing.month;
    if (dto.month !== undefined) {
      const trimmed = trimToNull(dto.month);
      if (!trimmed) {
        throw new ConflictException('Month is required');
      }
      month = trimmed;
      data.month = trimmed;
    }

    if (dto.employeeId !== undefined || dto.month !== undefined) {
      await this.checkPayrollUnique(employeeId, month, id);
    }

    if (dto.paidById !== undefined) {
      data.paidById = await this.checkPaidBy(dto.paidById);
    }
    if (dto.baseSalary !== undefined) {
      data.baseSalary = dto.baseSalary;
    }
    if (dto.totalBonus !== undefined) {
      data.totalBonus = dto.totalBonus;
    }
    if (dto.totalPenalty !== undefined) {
      data.totalPenalty = dto.totalPenalty;
    }
    if (dto.totalAdvance !== undefined) {
      data.totalAdvance = dto.totalAdvance;
    }
    if (dto.netSalary !== undefined) {
      data.netSalary = dto.netSalary;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.paidAt !== undefined) {
      data.paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    }

    return this.prisma.payroll.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const payroll = await this.getPayrollById(id);
    await this.checkRecordAccess(actor, payroll);
    await this.prisma.payroll.delete({ where: { id } });
    return { success: true as const, id };
  }

  async recordPayment(
    id: string,
    dto: RecordPayrollPaymentDto,
    actor: AccessTokenPayload,
  ) {
    const payroll = await this.getPayrollById(id);
    await this.checkRecordAccess(actor, payroll);

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
    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });
    const month = trimToNull(query.month);

    const payrollWhere: PayrollFilter = {};
    const advanceWhere: AdvanceFilter = {};
    if (scope.companyId) {
      payrollWhere.companyId = scope.companyId;
      advanceWhere.companyId = scope.companyId;
    }
    if (scope.branchId) {
      payrollWhere.employee = { branchId: scope.branchId };
      advanceWhere.employee = { branchId: scope.branchId };
    }
    if (query.employeeId) {
      payrollWhere.employeeId = query.employeeId;
      advanceWhere.employeeId = query.employeeId;
    }
    if (month) {
      payrollWhere.month = month;
      advanceWhere.month = month;
    }

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

  private async getPayrollById(id: string) {
    const payroll = await this.prisma.payroll.findUnique({ where: { id } });
    if (!payroll) {
      throw new NotFoundException('Payroll not found');
    }
    return payroll;
  }

  private async checkRecordAccess(
    actor: AccessTokenPayload,
    record: { companyId: string; employeeId: string },
  ): Promise<void> {
    if (actor.role === 'superadmin' || actor.role === 'admin') {
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

  private async checkPaidBy(paidById?: string | null): Promise<string | null> {
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

  private async checkPayrollUnique(
    employeeId: string,
    month: string,
    excludedId?: string,
  ): Promise<void> {
    const payroll = await this.prisma.payroll.findFirst({
      where: excludedId
        ? { employeeId, month, id: { not: excludedId } }
        : { employeeId, month },
      select: { id: true },
    });
    if (payroll) {
      throw new ConflictException(
        'Payroll already exists for this employee and month',
      );
    }
  }
}
