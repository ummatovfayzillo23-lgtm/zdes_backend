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
import { AdvanceQueryDto } from './dto/advance-query.dto';
import { CreateAdvanceDto } from './dto/create-advance.dto';
import { UpdateAdvanceDto } from './dto/update-advance.dto';

@Injectable()
export class AdvanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async create(dto: CreateAdvanceDto, actor: AccessTokenPayload) {
    const companyId = await this.ensureCompanyExists(
      resolveScopedCompanyId(actor, dto.companyId),
    );
    const employee = await this.ensureEmployeeInScope(
      dto.employeeId,
      companyId,
      actor,
    );

    const advanceDate = new Date(dto.date);
    const month = this.resolveMonth(dto.month, advanceDate);

    const advance = await this.prisma.advance.create({
      data: {
        companyId,
        employeeId: employee.id,
        amount: dto.amount,
        date: advanceDate,
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
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: Prisma.AdvanceWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { employee: { branchId: scope.branchId } } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(trimToNull(query.month)
        ? { month: trimToNull(query.month) as string }
        : {}),
      ...this.buildDateRangeFilter(query.dateFrom, query.dateTo),
    };

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
    const advance = await this.findAdvanceByIdOrThrow(id);
    await this.assertRecordInScope(actor, advance);
    return advance;
  }

  async update(id: string, dto: UpdateAdvanceDto, actor: AccessTokenPayload) {
    const existingAdvance = await this.findAdvanceByIdOrThrow(id);
    await this.assertRecordInScope(actor, existingAdvance);

    const nextCompanyId =
      dto.companyId !== undefined
        ? await this.ensureCompanyExists(
            resolveScopedCompanyId(actor, dto.companyId),
          )
        : existingAdvance.companyId;
    const nextEmployeeId = (
      dto.employeeId !== undefined
        ? await this.ensureEmployeeInScope(dto.employeeId, nextCompanyId, actor)
        : await this.ensureEmployeeInScope(
            existingAdvance.employeeId,
            nextCompanyId,
            actor,
          )
    ).id;
    const nextDate = dto.date ? new Date(dto.date) : existingAdvance.date;
    const nextMonth =
      dto.month !== undefined
        ? this.resolveMonth(dto.month, nextDate)
        : dto.date
          ? getMonthKey(nextDate)
          : existingAdvance.month;

    return this.prisma.advance.update({
      where: { id },
      data: {
        companyId: nextCompanyId,
        employeeId: nextEmployeeId,
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.date ? { date: nextDate } : {}),
        month: nextMonth,
        ...(dto.note !== undefined ? { note: trimToNull(dto.note) } : {}),
        updatedById: actor.sub,
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const advance = await this.findAdvanceByIdOrThrow(id);
    await this.assertRecordInScope(actor, advance);

    await this.prisma.advance.delete({
      where: { id },
    });

    return {
      success: true as const,
      id,
    };
  }

  private async findAdvanceByIdOrThrow(id: string) {
    const advance = await this.prisma.advance.findUnique({
      where: { id },
    });

    if (!advance) {
      throw new NotFoundException('Advance not found');
    }

    return advance;
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

  private async ensureEmployeeInScope(
    employeeId: string,
    companyId: string,
    actor: AccessTokenPayload,
  ): Promise<{
    id: string;
    branchId: string | null;
    firstName: string | null;
    lastName: string | null;
  }> {
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

    assertWithinScope(actor, employee);

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

  private resolveMonth(month: string | undefined, date: Date): string {
    return trimToNull(month) ?? getMonthKey(date);
  }

  private buildDateRangeFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.AdvanceWhereInput {
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
