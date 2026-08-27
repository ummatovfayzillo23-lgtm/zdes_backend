import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  getCompanyId,
  getScope,
  checkAccess,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';

type DateFilter = { startDate: { lte: Date } } | { endDate: { gte: Date } };

type HolidayFilter = {
  companyId?: string;
  branchId?: string;
  affectsSalary?: boolean;
  name?: { contains: string; mode: 'insensitive' };
  AND?: DateFilter[];
};

type HolidayData = {
  updatedById: string;
  companyId?: string;
  branchId?: string | null;
  name?: string;
  startDate?: Date;
  endDate?: Date;
  affectsSalary?: boolean;
  note?: string | null;
};

@Injectable()
export class HolidayService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHolidayDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    const scope = getScope(actor, { companyId, branchId: dto.branchId });

    await this.checkCompany(companyId);
    const branchId = await this.checkBranch(companyId, scope.branchId);

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.holiday.create({
      data: {
        companyId,
        branchId,
        name,
        startDate,
        endDate,
        affectsSalary: dto.affectsSalary ?? false,
        note: trimToNull(dto.note),
        createdById: actor.sub,
        updatedById: actor.sub,
      },
    });
  }

  async findAll(query: HolidayQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: HolidayFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.branchId = scope.branchId;
    }
    if (query.affectsSalary !== undefined) {
      where.affectsSalary = query.affectsSalary;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const dateRange = this.buildDateFilter(query.dateFrom, query.dateTo);
    if (dateRange.length > 0) {
      where.AND = dateRange;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.holiday.findMany({
        where,
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.holiday.count({ where }),
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
    const holiday = await this.getHolidayById(id);
    checkAccess(actor, holiday);
    return holiday;
  }

  async update(id: string, dto: UpdateHolidayDto, actor: AccessTokenPayload) {
    const existing = await this.getHolidayById(id);
    checkAccess(actor, existing);

    const data: HolidayData = { updatedById: actor.sub };

    if (dto.companyId !== undefined) {
      const companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (dto.branchId !== undefined) {
      const companyId = data.companyId ?? existing.companyId;
      const scope = getScope(actor, { companyId, branchId: dto.branchId });
      data.branchId = await this.checkBranch(companyId, scope.branchId);
    }

    if (dto.name !== undefined) {
      const name = trimToNull(dto.name);
      if (!name) {
        throw new ConflictException('Name is required');
      }
      data.name = name;
    }

    if (dto.startDate !== undefined) {
      data.startDate = new Date(dto.startDate);
    }
    if (dto.endDate !== undefined) {
      data.endDate = new Date(dto.endDate);
    }

    const startDate = data.startDate ?? existing.startDate;
    const endDate = data.endDate ?? existing.endDate;
    if (endDate < startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    if (dto.affectsSalary !== undefined) {
      data.affectsSalary = dto.affectsSalary;
    }
    if (dto.note !== undefined) {
      data.note = trimToNull(dto.note);
    }

    return this.prisma.holiday.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const holiday = await this.getHolidayById(id);
    checkAccess(actor, holiday);

    await this.prisma.holiday.delete({ where: { id } });

    return { success: true as const, id };
  }

  private async getHolidayById(id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      throw new NotFoundException('Holiday not found');
    }
    return holiday;
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

  private buildDateFilter(dateFrom?: string, dateTo?: string): DateFilter[] {
    const filters: DateFilter[] = [];
    if (dateTo) {
      filters.push({ startDate: { lte: new Date(dateTo) } });
    }
    if (dateFrom) {
      filters.push({ endDate: { gte: new Date(dateFrom) } });
    }
    return filters;
  }
}
