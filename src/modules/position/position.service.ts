import {
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
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { TogglePositionStatusDto } from './dto/toggle-position-status.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePositionDto, actor: AccessTokenPayload) {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    await this.ensureCompanyExists(companyId);

    if (actor.role === 'manager' && !dto.departmentId) {
      throw new ForbiddenException(
        'departmentId is required to create a position within your branch',
      );
    }

    const departmentId = await this.resolveDepartmentId(
      companyId,
      dto.departmentId,
      actor,
    );
    const normalizedName = this.normalizeRequiredName(dto.name);
    await this.ensureNameIsUnique(companyId, departmentId, normalizedName);

    return this.prisma.position.create({
      data: {
        companyId,
        departmentId,
        name: normalizedName,
      },
    });
  }

  async findAll(query: PositionQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
    });

    const where: Prisma.PositionWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(scope.branchId ? { department: { branchId: scope.branchId } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.position.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.position.count({ where }),
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
    const position = await this.findPositionByIdOrThrow(id);
    assertWithinScope(actor, position);
    await this.assertManagerBranchAccess(actor, position.departmentId);
    return position;
  }

  async update(id: string, dto: UpdatePositionDto, actor: AccessTokenPayload) {
    const existing = await this.findPositionByIdOrThrow(id);
    assertWithinScope(actor, existing);
    await this.assertManagerBranchAccess(actor, existing.departmentId);

    let companyId = existing.companyId;
    if (dto.companyId) {
      companyId = resolveScopedCompanyId(actor, dto.companyId);
      await this.ensureCompanyExists(companyId);
    }

    if (actor.role === 'manager' && dto.departmentId === null) {
      throw new ForbiddenException(
        'departmentId is required to keep a position within your branch',
      );
    }

    const departmentId =
      dto.departmentId !== undefined
        ? await this.resolveDepartmentId(companyId, dto.departmentId, actor)
        : existing.departmentId;

    const normalizedName = dto.name
      ? this.normalizeRequiredName(dto.name)
      : existing.name;

    await this.ensureNameIsUnique(companyId, departmentId, normalizedName, id);

    return this.prisma.position.update({
      where: { id },
      data: { companyId, departmentId, name: normalizedName },
    });
  }

  async toggleStatus(
    id: string,
    dto: TogglePositionStatusDto,
    actor: AccessTokenPayload,
  ) {
    const position = await this.findPositionByIdOrThrow(id);
    assertWithinScope(actor, position);
    await this.assertManagerBranchAccess(actor, position.departmentId);
    const nextIsActive = dto.isActive ?? !position.isActive;

    return this.prisma.position.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const position = await this.findPositionByIdOrThrow(id);
    assertWithinScope(actor, position);
    await this.assertManagerBranchAccess(actor, position.departmentId);
    await this.prisma.position.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findPositionByIdOrThrow(id: string) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
  }

  private async resolveDepartmentId(
    companyId: string,
    departmentId: string | null | undefined,
    actor: AccessTokenPayload,
  ): Promise<string | null> {
    if (departmentId == null) return null;

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!department) throw new NotFoundException('Department not found');
    if (department.companyId !== companyId) {
      throw new ConflictException(
        'Department does not belong to the selected company',
      );
    }
    if (actor.role === 'manager' && department.branchId !== actor.branchId) {
      throw new ForbiddenException(
        "You cannot access another branch's department",
      );
    }
    return department.id;
  }

  private async assertManagerBranchAccess(
    actor: AccessTokenPayload,
    departmentId: string | null,
  ): Promise<void> {
    if (actor.role !== 'manager') return;

    if (!departmentId) {
      throw new ForbiddenException(
        "You cannot access a position outside your branch",
      );
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { branchId: true },
    });
    if (!department || department.branchId !== actor.branchId) {
      throw new ForbiddenException("You cannot access another branch's data");
    }
  }

  private async ensureNameIsUnique(
    companyId: string,
    departmentId: string | null,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.position.findFirst({
      where: {
        companyId,
        departmentId,
        name,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Position name already exists for this company and department',
      );
    }
  }

  private normalizeRequiredName(name: string): string {
    const normalized = trimToNull(name);
    if (!normalized) throw new ConflictException('Position name is required');
    return normalized;
  }
}
