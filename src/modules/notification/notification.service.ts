import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NotificationIcon } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { FirebaseService } from '../../common/firebase/firebase.service';
import { trimToNull } from '../../common/utils/helpers';
import { checkAccess, getScope } from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import type { NotificationTemplate } from './notification.templates';

type Search = { contains: string; mode: 'insensitive' };

type NotificationFilter = {
  userId?: string;
  user?: { companyId: string; branchId?: string };
  icon?: NotificationIcon;
  isRead?: boolean;
  OR?: { title?: Search; message?: Search }[];
};

type NotificationData = {
  userId?: string | null;
  title?: string;
  message?: string;
  icon?: NotificationIcon;
  isRead?: boolean;
};

type OversightRecipient = {
  companyId?: string;
  branchId?: string;
  role: 'admin' | 'manager';
};

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  async create(dto: CreateNotificationDto, actor: AccessTokenPayload) {
    if (actor.role !== 'superadmin' && !dto.userId) {
      throw new ForbiddenException('userId is required');
    }

    const userId = dto.userId ? await this.checkUser(dto.userId, actor) : null;

    const title = trimToNull(dto.title);
    if (!title) {
      throw new ConflictException('Title is required');
    }
    const message = trimToNull(dto.message);
    if (!message) {
      throw new ConflictException('Message is required');
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        icon: dto.icon,
        isRead: dto.isRead,
      },
    });

    await this.sendPush(userId, title, message);

    return notification;
  }

  async notifyUser(
    userId: string,
    title: string,
    message: string,
    icon?: NotificationIcon,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, title, message, icon },
    });

    await this.sendPush(userId, title, message, data);
  }

  async notifyUserWithTemplate(
    userId: string,
    template: NotificationTemplate,
  ): Promise<void> {
    await this.notifyUser(
      userId,
      template.title,
      template.message,
      template.icon,
      template.data,
    );
  }

  async notifyOversight(
    companyId: string,
    branchId: string | null,
    excludeUserId: string,
    template: NotificationTemplate,
  ): Promise<void> {
    const or: OversightRecipient[] = [{ companyId, role: 'admin' }];
    if (branchId) {
      or.push({ branchId, role: 'manager' });
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: excludeUserId },
        OR: or,
      },
      select: { id: true },
    });

    await Promise.all(
      recipients.map((recipient) =>
        this.notifyUserWithTemplate(recipient.id, template),
      ),
    );
  }

  private async sendPush(
    userId: string | null,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    const pushTokens = await this.prisma.pushToken.findMany({
      where: userId ? { userId } : {},
      select: { token: true },
    });

    if (pushTokens.length === 0) {
      return;
    }

    await this.firebase.sendToTokens(
      pushTokens.map((pushToken) => pushToken.token),
      { title, body },
      data,
    );
  }

  async findAll(query: NotificationQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor);

    const where: NotificationFilter = {};
    if (query.userId) {
      where.userId = query.userId;
    }
    if (scope.companyId) {
      where.user = { companyId: scope.companyId };
      if (scope.branchId) {
        where.user.branchId = scope.branchId;
      }
    }
    if (query.icon) {
      where.icon = query.icon;
    }
    if (query.isRead !== undefined) {
      where.isRead = query.isRead;
    }

    const search = trimToNull(query.search);
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } },
      ];
    }

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
    const notification = await this.getNotificationById(id);
    await this.checkNotificationAccess(actor, notification);
    return notification;
  }

  async update(
    id: string,
    dto: UpdateNotificationDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getNotificationById(id);
    await this.checkNotificationAccess(actor, existing);

    const data: NotificationData = {};

    if (dto.userId !== undefined) {
      data.userId = dto.userId ? await this.checkUser(dto.userId, actor) : null;
    }

    if (dto.title !== undefined) {
      const title = trimToNull(dto.title);
      if (!title) {
        throw new ConflictException('Title is required');
      }
      data.title = title;
    }
    if (dto.message !== undefined) {
      const message = trimToNull(dto.message);
      if (!message) {
        throw new ConflictException('Message is required');
      }
      data.message = message;
    }
    if (dto.icon !== undefined) {
      data.icon = dto.icon;
    }
    if (dto.isRead !== undefined) {
      data.isRead = dto.isRead;
    }

    return this.prisma.notification.update({ where: { id }, data });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const notification = await this.getNotificationById(id);
    await this.checkNotificationAccess(actor, notification);
    await this.prisma.notification.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getNotificationById(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    return notification;
  }

  private async checkNotificationAccess(
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
