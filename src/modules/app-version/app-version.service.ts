import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { AppVersionQueryDto } from './dto/app-version-query.dto';
import { CreateAppVersionDto } from './dto/create-app-version.dto';
import { UpdateAppVersionDto } from './dto/update-app-version.dto';

type AppVersionData = {
  android?: Prisma.InputJsonValue;
  ios?: Prisma.InputJsonValue;
};

@Injectable()
export class AppVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAppVersionDto) {
    return this.prisma.appVersion.create({
      data: {
        android: dto.android as Prisma.InputJsonValue | undefined,
        ios: dto.ios as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(query: AppVersionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.appVersion.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.appVersion.count(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    return this.getAppVersionById(id);
  }

  async update(id: string, dto: UpdateAppVersionDto) {
    await this.getAppVersionById(id);

    const data: AppVersionData = {};
    if (dto.android !== undefined) {
      data.android = dto.android as Prisma.InputJsonValue;
    }
    if (dto.ios !== undefined) {
      data.ios = dto.ios as Prisma.InputJsonValue;
    }

    return this.prisma.appVersion.update({ where: { id }, data });
  }

  async delete(id: string) {
    await this.getAppVersionById(id);
    await this.prisma.appVersion.delete({ where: { id } });
    return { success: true as const, id };
  }

  private async getAppVersionById(id: string) {
    const appVersion = await this.prisma.appVersion.findUnique({
      where: { id },
    });
    if (!appVersion) {
      throw new NotFoundException('App version not found');
    }
    return appVersion;
  }
}
