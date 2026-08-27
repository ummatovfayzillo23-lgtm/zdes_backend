import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AdjustmentCategory, AdjustmentType } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { getMonthKey, trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { NotificationService } from '../notification/notification.service';
import { notificationTemplates } from '../notification/notification.templates';
import { CreateSalaryAdjustmentDto } from './dto/create-salary-adjustment.dto';
import { SalaryAdjustmentQueryDto } from './dto/salary-adjustment-query.dto';
import { UpdateSalaryAdjustmentDto } from './dto/update-salary-adjustment.dto';

type Search = { contains: string; mode: 'insensitive' };

type AdjustmentFilter = {
  companyId?: string;
  employee?: { branchId: string };
  employeeId?: string;
  type?: AdjustmentType;
  category?: AdjustmentCategory;
  month?: string;
  reason?: Search;
  date?: { gte?: Date; lte?: Date };
};

type AdjustmentData = {
  updatedById: string;
  companyId?: string;
  employeeId?: string;
  type?: AdjustmentType;
  category?: AdjustmentCategory;
  amount?: number;
  date?: Date;
  month?: string;
  reason?: string | null;
};

@Injectable()
export class SalaryAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateSalaryAdjustmentDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);
    const employeeId = await this.checkEmployee(
      dto.employeeId,
      companyId,
      actor,
    );

    const date = new Date(dto.date);

    const adjustment = await this.prisma.salaryAdjustment.create({
      data: {
        companyId,
        employeeId,
        type: dto.type,
        category: dto.category,
        amount: dto.amount,
        date,
        month: trimToNull(dto.month) ?? getMonthKey(date),
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

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: AdjustmentFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.employee = { branchId: scope.branchId };
    }
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.category) {
      where.category = query.category;
    }

    const month = trimToNull(query.month);
    if (month) {
      where.month = month;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.reason = { contains: search, mode: 'insensitive' };
    }

    const dateFilter = this.buildDateFilter(query.dateFrom, query.dateTo);
    if (dateFilter) {
      where.date = dateFilter;
    }

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
    const adjustment = await this.getAdjustmentById(id);
    await this.checkRecordAccess(actor, adjustment);
    return adjustment;
  }

  async update(
    id: string,
    dto: UpdateSalaryAdjustmentDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getAdjustmentById(id);
    await this.checkRecordAccess(actor, existing);

    const data: AdjustmentData = { updatedById: actor.sub };

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (dto.employeeId !== undefined) {
      data.employeeId = await this.checkEmployee(
        dto.employeeId,
        companyId,
        actor,
      );
    } else if (dto.companyId !== undefined) {
      data.employeeId = await this.checkEmployee(
        existing.employeeId,
        companyId,
        actor,
      );
    }

    const date = dto.date ? new Date(dto.date) : existing.date;
    if (dto.date) {
      data.date = date;
    }

    if (dto.month !== undefined) {
      data.month = trimToNull(dto.month) ?? getMonthKey(date);
    } else if (dto.date) {
      data.month = getMonthKey(date);
    }

    if (dto.type !== undefined) {
      data.type = dto.type;
    }
    if (dto.category !== undefined) {
      data.category = dto.category;
    }
    if (dto.amount !== undefined) {
      data.amount = dto.amount;
    }
    if (dto.reason !== undefined) {
      data.reason = trimToNull(dto.reason);
    }

    return this.prisma.salaryAdjustment.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const adjustment = await this.getAdjustmentById(id);
    await this.checkRecordAccess(actor, adjustment);
    await this.prisma.salaryAdjustment.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getAdjustmentById(id: string) {
    const adjustment = await this.prisma.salaryAdjustment.findUnique({
      where: { id },
    });
    if (!adjustment) {
      throw new NotFoundException('Salary adjustment not found');
    }
    return adjustment;
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

  private buildDateFilter(
    dateFrom?: string,
    dateTo?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!dateFrom && !dateTo) {
      return undefined;
    }

    const range: { gte?: Date; lte?: Date } = {};
    if (dateFrom) {
      range.gte = new Date(dateFrom);
    }
    if (dateTo) {
      range.lte = new Date(dateTo);
    }
    return range;
  }
}
