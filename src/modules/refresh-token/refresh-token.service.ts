import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateRefreshTokenDto } from './dto/create-refresh-token.dto';
import { RefreshTokenQueryDto } from './dto/refresh-token-query.dto';
import { UpdateRefreshTokenDto } from './dto/update-refresh-token.dto';

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRefreshTokenDto, actor: AccessTokenPayload) {
    const userId = await this.ensureUserInScope(dto.userId, actor);

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
    const search = trimToNull(query.search);
    const now = new Date();
    const scope = resolveCompanyBranchScope(actor);

    const where: Prisma.RefreshTokenWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(scope.companyId
        ? {
            user: {
              companyId: scope.companyId,
              ...(scope.branchId ? { branchId: scope.branchId } : {}),
            },
          }
        : {}),
      ...(trimToNull(query.deviceType)
        ? { deviceType: trimToNull(query.deviceType) }
        : {}),
      ...(query.isExpired !== undefined
        ? {
            expiresAt: query.isExpired ? { lt: now } : { gte: now },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { deviceName: { contains: search, mode: 'insensitive' } },
              { userAgent: { contains: search, mode: 'insensitive' } },
              { ipAddress: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

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
    const refreshToken = await this.findRefreshTokenByIdOrThrow(id);
    await this.assertRefreshTokenInScope(actor, refreshToken);
    return refreshToken;
  }

  async update(
    id: string,
    dto: UpdateRefreshTokenDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findRefreshTokenByIdOrThrow(id);
    await this.assertRefreshTokenInScope(actor, existing);

    const userId =
      dto.userId !== undefined
        ? await this.ensureUserInScope(dto.userId, actor)
        : undefined;

    return this.prisma.refreshToken.update({
      where: { id },
      data: {
        ...(userId !== undefined ? { userId } : {}),
        ...(dto.token !== undefined ? { token: dto.token } : {}),
        ...(dto.expiresAt !== undefined
          ? { expiresAt: new Date(dto.expiresAt) }
          : {}),
        ...(dto.deviceType !== undefined
          ? { deviceType: trimToNull(dto.deviceType) }
          : {}),
        ...(dto.deviceName !== undefined
          ? { deviceName: trimToNull(dto.deviceName) }
          : {}),
        ...(dto.userAgent !== undefined
          ? { userAgent: trimToNull(dto.userAgent) }
          : {}),
        ...(dto.ipAddress !== undefined
          ? { ipAddress: trimToNull(dto.ipAddress) }
          : {}),
        ...(dto.lastUsedAt !== undefined
          ? { lastUsedAt: dto.lastUsedAt ? new Date(dto.lastUsedAt) : null }
          : {}),
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const refreshToken = await this.findRefreshTokenByIdOrThrow(id);
    await this.assertRefreshTokenInScope(actor, refreshToken);
    await this.prisma.refreshToken.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findRefreshTokenByIdOrThrow(id: string) {
    const refreshToken = await this.prisma.refreshToken.findUnique({
      where: { id },
    });
    if (!refreshToken) {
      throw new NotFoundException('Refresh token not found');
    }
    return refreshToken;
  }

  private async assertRefreshTokenInScope(
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
    assertWithinScope(actor, user ?? { companyId: null, branchId: null });
  }

  private async ensureUserInScope(
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
    assertWithinScope(actor, user);
    return user.id;
  }
}
