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
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto, actor: AccessTokenPayload) {
    if (actor.role !== 'superadmin' && !dto.userId) {
      throw new ForbiddenException(
        'userId is required for non-superadmin actors',
      );
    }

    const userId = dto.userId
      ? await this.ensureUserInScope(dto.userId, actor)
      : null;

    return this.prisma.notification.create({
      data: {
        userId,
        title: this.normalizeRequired(
          dto.title,
          'Notification title is required',
        ),
        message: this.normalizeRequired(
          dto.message,
          'Notification message is required',
        ),
        icon: dto.icon,
        isRead: dto.isRead,
      },
    });
  }

  async findAll(query: NotificationQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor);

    const where: Prisma.NotificationWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(scope.companyId
        ? {
            user: {
              companyId: scope.companyId,
              ...(scope.branchId ? { branchId: scope.branchId } : {}),
            },
          }
        : {}),
      ...(query.icon ? { icon: query.icon } : {}),
      ...(query.isRead !== undefined ? { isRead: query.isRead } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { message: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
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
    const notification = await this.findNotificationByIdOrThrow(id);
    await this.assertNotificationInScope(actor, notification);
    return notification;
  }

  async update(
    id: string,
    dto: UpdateNotificationDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findNotificationByIdOrThrow(id);
    await this.assertNotificationInScope(actor, existing);

    const userId =
      dto.userId !== undefined
        ? dto.userId
          ? await this.ensureUserInScope(dto.userId, actor)
          : null
        : undefined;

    return this.prisma.notification.update({
      where: { id },
      data: {
        ...(userId !== undefined ? { userId } : {}),
        ...(dto.title !== undefined
          ? {
              title: this.normalizeRequired(
                dto.title,
                'Notification title is required',
              ),
            }
          : {}),
        ...(dto.message !== undefined
          ? {
              message: this.normalizeRequired(
                dto.message,
                'Notification message is required',
              ),
            }
          : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.isRead !== undefined ? { isRead: dto.isRead } : {}),
      },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const notification = await this.findNotificationByIdOrThrow(id);
    await this.assertNotificationInScope(actor, notification);
    await this.prisma.notification.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async findNotificationByIdOrThrow(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  private async assertNotificationInScope(
    actor: AccessTokenPayload,
    notification: { userId: string | null },
  ): Promise<void> {
    if (actor.role === 'superadmin') {
      return;
    }

    if (!notification.userId) {
      throw new ForbiddenException(
        'Only superadmin can access global notifications',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: notification.userId },
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

  private normalizeRequired(value: string, message: string) {
    const normalized = trimToNull(value);
    if (!normalized) {
      throw new ConflictException(message);
    }
    return normalized;
  }
}
