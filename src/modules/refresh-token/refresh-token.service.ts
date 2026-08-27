import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import { checkAccess, getScope } from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateRefreshTokenDto } from './dto/create-refresh-token.dto';
import { RefreshTokenQueryDto } from './dto/refresh-token-query.dto';
import { UpdateRefreshTokenDto } from './dto/update-refresh-token.dto';

type Search = { contains: string; mode: 'insensitive' };

type RefreshTokenFilter = {
  userId?: string;
  user?: { companyId: string; branchId?: string };
  deviceType?: string;
  expiresAt?: { lt: Date } | { gte: Date };
  OR?: { deviceName?: Search; userAgent?: Search; ipAddress?: Search }[];
};

type RefreshTokenData = {
  userId?: string;
  token?: string;
  expiresAt?: Date;
  deviceType?: string | null;
  deviceName?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastUsedAt?: Date | null;
};

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRefreshTokenDto, actor: AccessTokenPayload) {
    const userId = await this.checkUser(dto.userId, actor);

    return this.prisma.refreshToken.create({
      data: {
        userId,
        token: dto.token,
        expiresAt: new Date(dto.expiresAt),
        deviceType: trimToNull(dto.deviceType),
        deviceName: trimToNull(dto.deviceName),
        userAgent: trimToNull(dto.userAgent),
        ipAddress: trimToNull(dto.ipAddress),
        lastUsedAt: dto.lastUsedAt ? new Date(dto.lastUsedAt) : undefined,
      },
    });
  }

  async findAll(query: RefreshTokenQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const now = new Date();

    const scope = getScope(actor);

    const where: RefreshTokenFilter = {};
    if (query.userId) {
      where.userId = query.userId;
    }
    if (scope.companyId) {
      where.user = { companyId: scope.companyId };
      if (scope.branchId) {
        where.user.branchId = scope.branchId;
      }
    }

    const deviceType = trimToNull(query.deviceType);
    if (deviceType) {
      where.deviceType = deviceType;
    }

    if (query.isExpired !== undefined) {
      where.expiresAt = query.isExpired ? { lt: now } : { gte: now };
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { deviceName: { contains: search, mode: 'insensitive' } },
        { userAgent: { contains: search, mode: 'insensitive' } },
        { ipAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.refreshToken.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.refreshToken.count({ where }),
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
    const refreshToken = await this.getRefreshTokenById(id);
    await this.checkTokenAccess(actor, refreshToken);
    return refreshToken;
  }

  async update(
    id: string,
    dto: UpdateRefreshTokenDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getRefreshTokenById(id);
    await this.checkTokenAccess(actor, existing);

    const data: RefreshTokenData = {};

    if (dto.userId !== undefined) {
      data.userId = await this.checkUser(dto.userId, actor);
    }
    if (dto.token !== undefined) {
      data.token = dto.token;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = new Date(dto.expiresAt);
    }
    if (dto.deviceType !== undefined) {
      data.deviceType = trimToNull(dto.deviceType);
    }
    if (dto.deviceName !== undefined) {
      data.deviceName = trimToNull(dto.deviceName);
    }
    if (dto.userAgent !== undefined) {
      data.userAgent = trimToNull(dto.userAgent);
    }
    if (dto.ipAddress !== undefined) {
      data.ipAddress = trimToNull(dto.ipAddress);
    }
    if (dto.lastUsedAt !== undefined) {
      data.lastUsedAt = dto.lastUsedAt ? new Date(dto.lastUsedAt) : null;
    }

    return this.prisma.refreshToken.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const refreshToken = await this.getRefreshTokenById(id);
    await this.checkTokenAccess(actor, refreshToken);
    await this.prisma.refreshToken.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getRefreshTokenById(id: string) {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id },
    });
    if (!refreshToken) {
      throw new NotFoundException('Refresh token not found');
    }
    return refreshToken;
  }

  private async checkTokenAccess(
    actor: AccessTokenPayload,
    refreshToken: { userId: string },
  ): Promise<void> {
    if (actor.role === 'superadmin') {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: refreshToken.userId },
      select: { companyId: true, branchId: true },
    });
    checkAccess(actor, user ?? { companyId: null, branchId: null });
  }

  private async checkUser(
    userId: string,
    actor: AccessTokenPayload,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, companyId: true, branchId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    checkAccess(actor, user);
    return user.id;
  }
}
