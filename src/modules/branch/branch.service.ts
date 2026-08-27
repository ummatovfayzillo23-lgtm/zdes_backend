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
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { ToggleBranchStatusDto } from './dto/toggle-branch-status.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

type Search = { contains: string; mode: 'insensitive' };

type BranchFilter = {
  companyId?: string;
  isActive?: boolean;
  OR?: { name?: Search; address?: Search }[];
};

type BranchData = {
  companyId?: string;
  name?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number;
};

@Injectable()
export class BranchService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBranchDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    await this.checkNameUnique(companyId, name);

    return this.prisma.branch.create({
      data: {
        companyId,
        name,
        address: trimToNull(dto.address),
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        radius: dto.radius ?? 100,
      },
    });
  }

  async findAll(query: BranchQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, { companyId: query.companyId });

    const where: BranchFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.branch.count({ where }),
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
    const branch = await this.getBranchById(id);
    checkAccess(actor, branch);
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actor: AccessTokenPayload) {
    const existing = await this.getBranchById(id);
    checkAccess(actor, existing);

    const data: BranchData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
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

    if (dto.companyId !== undefined || dto.name !== undefined) {
      await this.checkNameUnique(companyId, name, id);
    }

    if (dto.address !== undefined) {
      data.address = trimToNull(dto.address);
    }
    if (dto.latitude !== undefined) {
      data.latitude = dto.latitude;
    }
    if (dto.longitude !== undefined) {
      data.longitude = dto.longitude;
    }
    if (dto.radius !== undefined) {
      data.radius = dto.radius;
    }

    return this.prisma.branch.update({ where: { id }, data });
  }

  async toggleStatus(
    id: string,
    dto: ToggleBranchStatusDto,
    actor: AccessTokenPayload,
  ) {
    const branch = await this.getBranchById(id);
    checkAccess(actor, branch);
    const nextIsActive = dto.isActive ?? !branch.isActive;

    return this.prisma.branch.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const branch = await this.getBranchById(id);
    checkAccess(actor, branch);
    await this.prisma.branch.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getBranchById(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return branch;
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

  private async checkNameUnique(
    companyId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.branch.findFirst({
      where: excludedId
        ? { companyId, name, id: { not: excludedId } }
        : { companyId, name },
    });
    if (existing) {
      throw new ConflictException('Name already exists in this company');
    }
  }
}
