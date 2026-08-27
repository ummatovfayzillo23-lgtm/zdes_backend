import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import { checkAccess, getScope } from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreatePushTokenDto } from './dto/create-push-token.dto';
import { PushTokenQueryDto } from './dto/push-token-query.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';

type Search = { contains: string; mode: 'insensitive' };

type PushTokenFilter = {
  userId?: string;
  user?: { companyId: string; branchId?: string };
  platform?: string;
  OR?: { token?: Search; deviceName?: Search; deviceId?: Search }[];
};

type PushTokenData = {
  userId?: string;
  token?: string;
  platform?: string | null;
  deviceId?: string | null;
  deviceName?: string | null;
  lastSeenAt?: Date | null;
};

@Injectable()
export class PushTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePushTokenDto, actor: AccessTokenPayload) {
    const userId = await this.checkUser(dto.userId, actor);

    const token = trimToNull(dto.token);
    if (!token) {
      throw new ConflictException('Token is required');
    }
    await this.checkTokenUnique(token);

    return this.prisma.pushToken.create({
      data: {
        userId,
        token,
        platform: trimToNull(dto.platform),
        deviceId: trimToNull(dto.deviceId),
        deviceName: trimToNull(dto.deviceName),
        lastSeenAt: dto.lastSeenAt ? new Date(dto.lastSeenAt) : undefined,
      },
    });
  }

  async findAll(query: PushTokenQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor);

    const where: PushTokenFilter = {};
    if (query.userId) {
      where.userId = query.userId;
    }
    if (scope.companyId) {
      where.user = { companyId: scope.companyId };
      if (scope.branchId) {
        where.user.branchId = scope.branchId;
      }
    }

    const platform = trimToNull(query.platform);
    if (platform) {
      where.platform = platform;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { token: { contains: search, mode: 'insensitive' } },
        { deviceName: { contains: search, mode: 'insensitive' } },
        { deviceId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.pushToken.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.pushToken.count({ where }),
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
    const pushToken = await this.getPushTokenById(id);
    await this.checkTokenAccess(actor, pushToken);
    return pushToken;
  }

  async update(id: string, dto: UpdatePushTokenDto, actor: AccessTokenPayload) {
    const existing = await this.getPushTokenById(id);
    await this.checkTokenAccess(actor, existing);

    const data: PushTokenData = {};

    if (dto.userId !== undefined) {
      data.userId = await this.checkUser(dto.userId, actor);
    }

    if (dto.token !== undefined) {
      const token = trimToNull(dto.token);
      if (!token) {
        throw new ConflictException('Token is required');
      }
      await this.checkTokenUnique(token, id);
      data.token = token;
    }

    if (dto.platform !== undefined) {
      data.platform = trimToNull(dto.platform);
    }
    if (dto.deviceId !== undefined) {
      data.deviceId = trimToNull(dto.deviceId);
    }
    if (dto.deviceName !== undefined) {
      data.deviceName = trimToNull(dto.deviceName);
    }
    if (dto.lastSeenAt !== undefined) {
      data.lastSeenAt = dto.lastSeenAt ? new Date(dto.lastSeenAt) : null;
    }

    return this.prisma.pushToken.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const pushToken = await this.getPushTokenById(id);
    await this.checkTokenAccess(actor, pushToken);
    await this.prisma.pushToken.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getPushTokenById(id: string) {
    const pushToken = await this.prisma.pushToken.findUnique({ where: { id } });
    if (!pushToken) {
      throw new NotFoundException('Push token not found');
    }
    return pushToken;
  }

  private async checkTokenAccess(
    actor: AccessTokenPayload,
    pushToken: { userId: string },
  ): Promise<void> {
    if (actor.role === 'superadmin') {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: pushToken.userId },
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

  private async checkTokenUnique(
    token: string,
    excludedId?: string,
  ): Promise<void> {
    const pushToken = await this.prisma.pushToken.findFirst({
      where: excludedId ? { token, id: { not: excludedId } } : { token },
      select: { id: true },
    });
    if (pushToken) {
      throw new ConflictException('Token already exists');
    }
  }
}
