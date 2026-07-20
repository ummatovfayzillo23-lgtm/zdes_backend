import {
  ConflictException,
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
import { CreateDepartmentDto } from './dto/create-department.dto';
import { DepartmentQueryDto } from './dto/department-query.dto';
import { ToggleDepartmentStatusDto } from './dto/toggle-department-status.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateDepartmentDto, actor: AccessTokenPayload) {
    const scopedCompanyId = resolveScopedCompanyId(actor, dto.companyId);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: scopedCompanyId,
      branchId: dto.branchId ?? undefined,
    });
    const companyId = await this.ensureCompanyExists(scopedCompanyId);
    const branchId = await this.resolveBranchId(companyId, scope.branchId);
    const normalizedName = this.normalizeRequiredName(dto.name);
    await this.ensureNameIsUnique(companyId, branchId, normalizedName);

    return this.prisma.department.create({
      data: { companyId, branchId, name: normalizedName },
    });
  }

  async findAll(query: DepartmentQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: Prisma.DepartmentWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };

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
    const department = await this.findDepartmentByIdOrThrow(id);
    assertWithinScope(actor, department);
    return department;
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findDepartmentByIdOrThrow(id);
    assertWithinScope(actor, existing);

    const companyId = dto.companyId
      ? await this.ensureCompanyExists(
          resolveScopedCompanyId(actor, dto.companyId),
        )
      : existing.companyId;
    const scope = resolveCompanyBranchScope(actor, {
      companyId,
      branchId:
        dto.branchId !== undefined
          ? (dto.branchId ?? undefined)
          : (existing.branchId ?? undefined),
    });
    const nextBranchId =
      dto.branchId !== undefined
        ? await this.resolveBranchId(companyId, scope.branchId)
        : await this.resolveBranchId(companyId, existing.branchId);
    const normalizedName = dto.name
      ? this.normalizeRequiredName(dto.name)
      : existing.name;

    await this.ensureNameIsUnique(companyId, nextBranchId, normalizedName, id);

    return this.prisma.department.update({
      where: { id },
      data: { companyId, branchId: nextBranchId, name: normalizedName },
    });
  }

  async toggleStatus(
    id: string,
    dto: ToggleDepartmentStatusDto,
    actor: AccessTokenPayload,
  ) {
    const department = await this.findDepartmentByIdOrThrow(id);
    assertWithinScope(actor, department);
    const nextIsActive = dto.isActive ?? !department.isActive;

    return this.prisma.department.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const department = await this.findDepartmentByIdOrThrow(id);
    assertWithinScope(actor, department);
    await this.prisma.department.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findDepartmentByIdOrThrow(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  private async ensureCompanyExists(companyId: string): Promise<string> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company.id;
  }

  private async resolveBranchId(
    companyId: string,
    branchId?: string | null,
  ): Promise<string | null> {
    if (branchId == null) return null;

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.companyId !== companyId) {
      throw new ConflictException(
        'Branch does not belong to the selected company',
      );
    }
    return branch.id;
  }

  private async ensureNameIsUnique(
    companyId: string,
    branchId: string | null,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.department.findFirst({
      where: {
        companyId,
        branchId,
        name,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Department name already exists for this company and branch',
      );
    }
  }

  private normalizeRequiredName(name: string): string {
    const normalized = trimToNull(name);
    if (!normalized) throw new ConflictException('Department name is required');
    return normalized;
  }
}
