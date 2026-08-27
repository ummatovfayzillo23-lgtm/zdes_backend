import {
  ConflictException,
  ForbiddenException,
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
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { TogglePositionStatusDto } from './dto/toggle-position-status.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

type Search = { contains: string; mode: 'insensitive' };

type PositionFilter = {
  companyId?: string;
  departmentId?: string;
  department?: { branchId: string };
  isActive?: boolean;
  OR?: { name?: Search }[];
};

type PositionData = {
  companyId?: string;
  departmentId?: string | null;
  name?: string;
};

@Injectable()
export class PositionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePositionDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);

    if (actor.role === 'manager' && !dto.departmentId) {
      throw new ForbiddenException(
        'departmentId is required to create a position within your branch',
      );
    }

    const departmentId = await this.checkDepartment(
      companyId,
      dto.departmentId,
      actor,
    );

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    await this.checkNameUnique(companyId, departmentId, name);

    return this.prisma.position.create({
      data: { companyId, departmentId, name },
    });
  }

  async findAll(query: PositionQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, { companyId: query.companyId });

    const where: PositionFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (scope.branchId) {
      where.department = { branchId: scope.branchId };
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [{ name: { contains: search, mode: 'insensitive' } }];
    }

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
    const position = await this.getPositionById(id);
    checkAccess(actor, position);
    await this.checkManagerBranch(actor, position.departmentId);
    return position;
  }

  async update(id: string, dto: UpdatePositionDto, actor: AccessTokenPayload) {
    const existing = await this.getPositionById(id);
    checkAccess(actor, existing);
    await this.checkManagerBranch(actor, existing.departmentId);

    const data: PositionData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    if (actor.role === 'manager' && dto.departmentId === null) {
      throw new ForbiddenException(
        'departmentId is required to keep a position within your branch',
      );
    }

    let departmentId = existing.departmentId;
    if (dto.departmentId !== undefined) {
      departmentId = await this.checkDepartment(
        companyId,
        dto.departmentId,
        actor,
      );
      data.departmentId = departmentId;
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
      dto.departmentId !== undefined ||
      dto.name !== undefined
    ) {
      await this.checkNameUnique(companyId, departmentId, name, id);
    }

    return this.prisma.position.update({ where: { id }, data });
  }

  async toggleStatus(
    id: string,
    dto: TogglePositionStatusDto,
    actor: AccessTokenPayload,
  ) {
    const position = await this.getPositionById(id);
    checkAccess(actor, position);
    await this.checkManagerBranch(actor, position.departmentId);
    const nextIsActive = dto.isActive ?? !position.isActive;

    return this.prisma.position.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const position = await this.getPositionById(id);
    checkAccess(actor, position);
    await this.checkManagerBranch(actor, position.departmentId);
    await this.prisma.position.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getPositionById(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, branches: true } },
        department: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    return position;
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

  private async checkDepartment(
    companyId: string,
    departmentId: string | null | undefined,
    actor: AccessTokenPayload,
  ): Promise<string | null> {
    if (departmentId == null) {
      return null;
    }

    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    if (department.companyId !== companyId) {
      throw new ConflictException('Department is not in this company');
    }
    if (actor.role === 'manager' && department.branchId !== actor.branchId) {
      throw new ForbiddenException(
        "You cannot access another branch's department",
      );
    }
    return department.id;
  }

  private async checkManagerBranch(
    actor: AccessTokenPayload,
    departmentId: string | null,
  ): Promise<void> {
    if (actor.role !== 'manager') {
      return;
    }

    if (!departmentId) {
      throw new ForbiddenException(
        'You cannot access a position outside your branch',
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

  private async checkNameUnique(
    companyId: string,
    departmentId: string | null,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.position.findFirst({
      where: excludedId
        ? { companyId, departmentId, name, id: { not: excludedId } }
        : { companyId, departmentId, name },
    });
    if (existing) {
      throw new ConflictException(
        'Name already exists in this company/department',
      );
    }
  }
}
