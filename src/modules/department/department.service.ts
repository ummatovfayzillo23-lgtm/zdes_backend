import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';
import { ToggleDepartmentStatusDto } from './dto/toggle-department-status.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

type Search = { contains: string; mode: 'insensitive' };

type DepartmentFilter = {
  companyId?: string;
  branchId?: string;
  isActive?: boolean;
  OR?: { name?: Search }[];
};

type DepartmentData = {
  companyId?: string;
  branchId?: string | null;
  name?: string;
};

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    const scope = getScope(actor, {
      companyId,
      branchId: dto.branchId ?? undefined,
    });

    await this.checkCompany(companyId);
    const branchId = await this.checkBranch(companyId, scope.branchId);

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    await this.checkNameUnique(companyId, branchId, name);

    return this.prisma.department.create({
      data: { companyId, branchId, name },
    });
  }

  async findAll(query: DepartmentQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: DepartmentFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.branchId = scope.branchId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.department.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.department.count({ where }),
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
    const department = await this.getDepartmentById(id);
    checkAccess(actor, department);
    return department;
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getDepartmentById(id);
    checkAccess(actor, existing);

    const data: DepartmentData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    let branchId = existing.branchId;
    if (dto.branchId !== undefined) {
      const scope = getScope(actor, {
        companyId,
        branchId: dto.branchId ?? undefined,
      });
      branchId = await this.checkBranch(companyId, scope.branchId);
      data.branchId = branchId;
    } else if (dto.companyId !== undefined && existing.branchId) {
      branchId = await this.checkBranch(companyId, existing.branchId);
      data.branchId = branchId;
    }

    let name = existing.name;
    if (dto.name !== undefined) {
      const trimmed = trimToNull(dto.name);
      if (!trimmed) {
        throw new ConflictException('Name is required');
      }
      name = trimmed;
      data.name = trimmed;
    }

    if (
      dto.companyId !== undefined ||
      dto.branchId !== undefined ||
      dto.name !== undefined
    ) {
      await this.checkNameUnique(companyId, branchId, name, id);
    }

    return this.prisma.department.update({ where: { id }, data });
  }

  async toggleStatus(
    id: string,
    dto: ToggleDepartmentStatusDto,
    actor: AccessTokenPayload,
  ) {
    const department = await this.getDepartmentById(id);
    checkAccess(actor, department);
    const nextIsActive = dto.isActive ?? !department.isActive;

    return this.prisma.department.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const department = await this.getDepartmentById(id);
    checkAccess(actor, department);
    await this.prisma.department.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getDepartmentById(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
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

  private async checkNameUnique(
    companyId: string,
    branchId: string | null,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: excludedId
        ? { companyId, branchId, name, id: { not: excludedId } }
        : { companyId, branchId, name },
    });
    if (existing) {
      throw new ConflictException('Name already exists in this company/branch');
    }
  }
}
