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
import { CreateSettingDto } from './dto/create-setting.dto';
import { SettingQueryDto } from './dto/setting-query.dto';
import { UpdateSettingDto } from './dto/update-setting.dto';

@Injectable()
export class SettingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSettingDto, actor: AccessTokenPayload) {
    const companyId = await this.ensureCompanyExists(
      resolveScopedCompanyId(actor, dto.companyId),
    );
    const key = this.normalizeRequired(dto.key, 'Setting key is required');
    await this.ensureUniqueKey(companyId, key);

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
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
    });

    const where: Prisma.SettingWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(search ? { key: { contains: search, mode: 'insensitive' } } : {}),
    };

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
    const setting = await this.findSettingByIdOrThrow(id);
    assertWithinScope(actor, setting);
    return setting;
  }

  async update(id: string, dto: UpdateSettingDto, actor: AccessTokenPayload) {
    const existing = await this.findSettingByIdOrThrow(id);
    assertWithinScope(actor, existing);

    const companyId =
      dto.companyId !== undefined
        ? await this.ensureCompanyExists(
            resolveScopedCompanyId(actor, dto.companyId),
          )
        : existing.companyId;
    const key =
      dto.key !== undefined
        ? this.normalizeRequired(dto.key, 'Setting key is required')
        : existing.key;

    await this.ensureUniqueKey(companyId, key, id);

    return this.prisma.setting.update({
      where: { id },
      data: {
        companyId,
        key,
        ...(dto.value !== undefined
          ? { value: dto.value as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const setting = await this.findSettingByIdOrThrow(id);
    assertWithinScope(actor, setting);
    await this.prisma.setting.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findSettingByIdOrThrow(id: string) {
    const setting = await this.prisma.setting.findUnique({ where: { id } });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return setting;
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company.id;
  }

  private async ensureUniqueKey(
    companyId: string,
    key: string,
    excludedId?: string,
  ) {
    const setting = await this.prisma.setting.findFirst({
      where: {
        companyId,
        key,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
      select: { id: true },
    });

    if (setting) {
      throw new ConflictException(
        'Setting key already exists for this company',
      );
    }
  }

  private normalizeRequired(value: string, message: string) {
    const normalized = trimToNull(value);
    if (!normalized) {
      throw new ConflictException(message);
    }
    return normalized;
  }
}
