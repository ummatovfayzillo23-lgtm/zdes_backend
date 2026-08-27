import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  checkAccess,
  getScope,
  getCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateSettingDto } from './dto/create-setting.dto';
import { SettingQueryDto } from './dto/setting-query.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

type SettingFilter = {
  companyId?: string;
  key?: { contains: string; mode: 'insensitive' };
};

type SettingData = {
  companyId?: string;
  key?: string;
  value?: Prisma.InputJsonValue;
};

@Injectable()
export class SettingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSettingDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);

    const key = trimToNull(dto.key);
    if (!key) {
      throw new ConflictException('Key is required');
    }
    await this.checkKeyUnique(companyId, key);

    return this.prisma.setting.create({
      data: {
        companyId,
        key,
        value: dto.value as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(query: SettingQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, { companyId: query.companyId });

    const where: SettingFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.key = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.setting.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.setting.count({ where }),
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
    const setting = await this.getSettingById(id);
    checkAccess(actor, setting);
    return setting;
  }

  async update(id: string, dto: UpdateSettingDto, actor: AccessTokenPayload) {
    const existing = await this.getSettingById(id);
    checkAccess(actor, existing);

    const data: SettingData = {};

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = getCompanyId(actor, dto.companyId);
      await this.checkCompany(companyId);
      data.companyId = companyId;
    }

    let key = existing.key;
    if (dto.key !== undefined) {
      const trimmed = trimToNull(dto.key);
      if (!trimmed) {
        throw new ConflictException('Key is required');
      }
      key = trimmed;
      data.key = trimmed;
    }

    if (dto.companyId !== undefined || dto.key !== undefined) {
      await this.checkKeyUnique(companyId, key, id);
    }

    if (dto.value !== undefined) {
      data.value = dto.value as Prisma.InputJsonValue;
    }

    return this.prisma.setting.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const setting = await this.getSettingById(id);
    checkAccess(actor, setting);
    await this.prisma.setting.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getSettingById(id: string) {
    const setting = await this.prisma.setting.findUnique({ where: { id } });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return setting;
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

  private async checkKeyUnique(
    companyId: string,
    key: string,
    excludedId?: string,
  ): Promise<void> {
    const setting = await this.prisma.setting.findFirst({
      where: excludedId
        ? { companyId, key, id: { not: excludedId } }
        : { companyId, key },
      select: { id: true },
    });
    if (setting) {
      throw new ConflictException('Key already exists in this company');
    }
  }
}
