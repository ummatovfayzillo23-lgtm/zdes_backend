import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { AdvanceQueryDto } from './dto/advance-query.dto';
import { CreateAdvanceDto } from './dto/create-advance.dto';
import { UpdateAdvanceDto } from './dto/update-advance.dto';

type AdvanceFilter = {
  companyId?: string;
  employee?: { branchId: string };
  employeeId?: string;
  month?: string;
  date?: { gte?: Date; lte?: Date };
};

type AdvanceData = {
  updatedById: string;
  companyId?: string;
  employeeId?: string;
  amount?: number;
  date?: Date;
  month?: string;
  note?: string | null;
};

type Employee = {
  id: string;
  branchId: string | null;
  firstName: string | null;
  lastName: string | null;
};

@Injectable()
export class AdvanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateAdvanceDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);
    const employee = await this.checkEmployee(dto.employeeId, companyId, actor);

    const date = new Date(dto.date);
    const month = trimToNull(dto.month) ?? getMonthKey(date);

    const advance = await this.prisma.advance.create({
      data: {
        companyId,
        employeeId: employee.id,
        amount: dto.amount,
        date,
        month,
        note: trimToNull(dto.note),
        createdById: actor.sub,
        updatedById: actor.sub,
      },
    });

    await this.notification.notifyUserWithTemplate(
      employee.id,
      notificationTemplates.advanceCreated(dto.amount),
    );

    await this.notification.notifyOversight(
      companyId,
      employee.branchId,
      actor.sub,
      notificationTemplates.advanceCreatedForOversight(
        this.formatEmployeeName(employee),
        dto.amount,
      ),
    );

    return advance;
  }

  async findAll(query: AdvanceQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: AdvanceFilter = {};
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

    const dateFilter = this.buildDateFilter(query.dateFrom, query.dateTo);
    if (dateFilter) {
      where.date = dateFilter;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.advance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.advance.count({ where }),
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
    const advance = await this.getAdvanceById(id);
    await this.checkRecordAccess(actor, advance);
    return advance;
  }

  async update(id: string, dto: UpdateAdvanceDto, actor: AccessTokenPayload) {
    const existing = await this.getAdvanceById(id);
    await this.checkRecordAccess(actor, existing);

    const data: AdvanceData = { updatedById: actor.sub };

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (dto.employeeId !== undefined) {
      const employee = await this.checkEmployee(
        dto.employeeId,
        companyId,
        actor,
      );
      data.employeeId = employee.id;
    } else if (dto.companyId !== undefined) {
      const employee = await this.checkEmployee(
        existing.employeeId,
        companyId,
        actor,
      );
      data.employeeId = employee.id;
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

    if (dto.amount !== undefined) {
      data.amount = dto.amount;
    }
    if (dto.note !== undefined) {
      data.note = trimToNull(dto.note);
    }

    return this.prisma.advance.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const advance = await this.getAdvanceById(id);
    await this.checkRecordAccess(actor, advance);

    await this.prisma.advance.delete({ where: { id } });

    return { success: true as const, id };
  }

  private async getAdvanceById(id: string) {
    const advance = await this.prisma.advance.findUnique({ where: { id } });
    if (!advance) {
      throw new NotFoundException('Advance not found');
    }
    return advance;
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
    checkAccess(actor, employee);

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
