import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkSchedule, WorkScheduleCompany } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import { getScope, getCompanyId } from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { AssignUserDto } from './dto/assign-user.dto';
import { AttachCompanyDto } from './dto/attach-company.dto';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { ToggleWorkScheduleStatusDto } from './dto/toggle-work-schedule-status.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkScheduleQueryDto } from './dto/work-schedule-query.dto';

type WorkScheduleWithCompanies = WorkSchedule & {
  companies: WorkScheduleCompany[];
};

type Search = { contains: string; mode: 'insensitive' };

type LinkFilter = {
  companyId?: string;
  branchId?: string;
  isDefault?: boolean;
  workSchedule?: { isActive?: boolean; name?: Search };
};

type ScheduleData = {
  name?: string;
  startTime?: string;
  endTime?: string;
  workDays?: number[];
  graceMinutes?: number;
};

@Injectable()
export class WorkScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkScheduleDto, actor: AccessTokenPayload) {
    const companyId = getCompanyId(actor, dto.companyId);
    await this.checkCompany(companyId);
    if (dto.branchId) {
      await this.checkBranch(dto.branchId, companyId);
    }

    const name = trimToNull(dto.name);
    if (!name) {
      throw new ConflictException('Name is required');
    }
    await this.checkNameUnique(companyId, name);

    if (dto.userId) {
      const user = await this.getUser(dto.userId);
      if (user.companyId && user.companyId !== companyId) {
        throw new ConflictException('User is not in this company');
      }
    }

    const isDefault = !dto.userId;

    const workScheduleId = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await this.clearDefaultForCompany(tx, companyId);
      }

      const workSchedule = await tx.workSchedule.create({
        data: {
          companyId,
          name,
          startTime: dto.startTime,
          endTime: dto.endTime,
          workDays: dto.workDays,
          graceMinutes: dto.graceMinutes ?? 0,
        },
      });

      await tx.workScheduleCompany.create({
        data: {
          workScheduleId: workSchedule.id,
          companyId,
          branchId: dto.branchId ?? null,
          isDefault,
        },
      });

      if (dto.userId) {
        await tx.user.update({
          where: { id: dto.userId },
          data: { workScheduleId: workSchedule.id },
        });
      }

      return workSchedule.id;
    });

    return this.findOne(workScheduleId, actor);
  }

  async findAll(query: WorkScheduleQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: LinkFilter = {};
    if (scope.companyId) {
      where.companyId = scope.companyId;
    }
    if (scope.branchId) {
      where.branchId = scope.branchId;
    }
    if (query.isDefault !== undefined) {
      where.isDefault = query.isDefault;
    }

    const search = trimToNull(query.search);
    if (query.isActive !== undefined || search) {
      where.workSchedule = {};
      if (query.isActive !== undefined) {
        where.workSchedule.isActive = query.isActive;
      }
      if (search) {
        where.workSchedule.name = { contains: search, mode: 'insensitive' };
      }
    }

    const [links, total] = await this.prisma.$transaction([
      this.prisma.workScheduleCompany.findMany({
        where,
        include: { workSchedule: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.workScheduleCompany.count({ where }),
    ]);

    return {
      items: links.map((link) => this.toListItem(link)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    const ws = await this.getScheduleById(id);
    this.checkReadable(actor, ws);
    return this.toDetail(ws);
  }

  async update(
    id: string,
    dto: UpdateWorkScheduleDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.getScheduleById(id);
    this.checkOwner(actor, existing);

    const data: ScheduleData = {};

    if (dto.name) {
      const name = trimToNull(dto.name);
      if (!name) {
        throw new ConflictException('Name is required');
      }
      await this.checkNameUnique(existing.companyId, name, id);
      data.name = name;
    }
    if (dto.startTime) {
      data.startTime = dto.startTime;
    }
    if (dto.endTime) {
      data.endTime = dto.endTime;
    }
    if (dto.workDays) {
      data.workDays = dto.workDays;
    }
    if (dto.graceMinutes !== undefined) {
      data.graceMinutes = dto.graceMinutes;
    }

    await this.prisma.workSchedule.update({ where: { id }, data });

    return this.findOne(id, actor);
  }

  async toggleStatus(
    id: string,
    dto: ToggleWorkScheduleStatusDto,
    actor: AccessTokenPayload,
  ) {
    const ws = await this.getScheduleById(id);
    this.checkOwner(actor, ws);
    const nextIsActive = dto.isActive ?? !ws.isActive;

    await this.prisma.workSchedule.update({
      where: { id },
      data: { isActive: nextIsActive },
    });

    return this.findOne(id, actor);
  }

  async attachCompany(
    id: string,
    dto: AttachCompanyDto,
    actor: AccessTokenPayload,
  ) {
    await this.getScheduleById(id);
    await this.checkCompany(dto.companyId);
    if (dto.branchId) {
      await this.checkBranch(dto.branchId, dto.companyId);
    }

    const existingLink = await this.prisma.workScheduleCompany.findUnique({
      where: {
        workScheduleId_companyId: {
          workScheduleId: id,
          companyId: dto.companyId,
        },
      },
    });
    if (existingLink) {
      throw new ConflictException(
        'Work schedule is already attached to this company',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await this.clearDefaultForCompany(tx, dto.companyId);
      }

      await tx.workScheduleCompany.create({
        data: {
          workScheduleId: id,
          companyId: dto.companyId,
          branchId: dto.branchId ?? null,
          isDefault: dto.isDefault ?? false,
        },
      });
    });

    return this.findOne(id, actor);
  }

  async detachCompany(
    id: string,
    companyId: string,
    actor: AccessTokenPayload,
  ) {
    const ws = await this.getScheduleById(id);
    if (actor.role !== 'superadmin' && actor.companyId !== companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }
    if (ws.companyId === companyId) {
      throw new ConflictException(
        'Cannot detach the owning company; delete the work schedule instead',
      );
    }

    const link = ws.companies.find((c) => c.companyId === companyId);
    if (!link) {
      throw new NotFoundException(
        'Work schedule is not attached to this company',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { workScheduleId: id, companyId },
        data: { workScheduleId: null },
      }),
      this.prisma.workScheduleCompany.delete({ where: { id: link.id } }),
    ]);

    return { success: true as const, id, companyId };
  }

  async setDefaultForCompany(
    id: string,
    companyId: string,
    actor: AccessTokenPayload,
  ) {
    if (actor.role !== 'superadmin' && actor.companyId !== companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }

    const link = await this.prisma.workScheduleCompany.findUnique({
      where: { workScheduleId_companyId: { workScheduleId: id, companyId } },
    });
    if (!link) {
      throw new NotFoundException(
        'Work schedule is not attached to this company',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.clearDefaultForCompany(tx, companyId);
      await tx.workScheduleCompany.update({
        where: { id: link.id },
        data: { isDefault: true },
      });
    });

    return this.findOne(id, actor);
  }

  async assignUser(id: string, dto: AssignUserDto, actor: AccessTokenPayload) {
    const ws = await this.getScheduleById(id);
    const user = await this.getUser(dto.userId);
    this.checkReadable(actor, ws);
    if (actor.role !== 'superadmin' && user.companyId !== actor.companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }
    if (!user.companyId) {
      throw new ConflictException('User is not assigned to a company');
    }

    const link = ws.companies.find((c) => c.companyId === user.companyId);
    if (!link) {
      throw new ConflictException(
        "Work schedule is not attached to the user's company",
      );
    }

    return this.prisma.user.update({
      where: { id: dto.userId },
      data: { workScheduleId: id },
      select: { id: true, login: true, companyId: true, workScheduleId: true },
    });
  }

  async unassignUser(
    id: string,
    dto: AssignUserDto,
    actor: AccessTokenPayload,
  ) {
    const ws = await this.getScheduleById(id);
    const user = await this.getUser(dto.userId);
    this.checkReadable(actor, ws);
    if (actor.role !== 'superadmin' && user.companyId !== actor.companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }

    return this.prisma.user.update({
      where: { id: dto.userId },
      data: { workScheduleId: null },
      select: { id: true, login: true, companyId: true, workScheduleId: true },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const ws = await this.getScheduleById(id);
    this.checkOwner(actor, ws);
    await this.prisma.workSchedule.delete({ where: { id } });
    return { success: true as const, id };
  }

  private toListItem(
    link: WorkScheduleCompany & { workSchedule: WorkSchedule },
  ) {
    const { workSchedule } = link;
    return {
      id: workSchedule.id,
      ownerCompanyId: workSchedule.companyId,
      companyId: link.companyId,
      branchId: link.branchId,
      isDefault: link.isDefault,
      name: workSchedule.name,
      startTime: workSchedule.startTime,
      endTime: workSchedule.endTime,
      workDays: workSchedule.workDays,
      graceMinutes: workSchedule.graceMinutes,
      isActive: workSchedule.isActive,
      attachedAt: link.createdAt,
      createdAt: workSchedule.createdAt,
      updatedAt: workSchedule.updatedAt,
    };
  }

  private toDetail(ws: WorkScheduleWithCompanies) {
    return {
      id: ws.id,
      ownerCompanyId: ws.companyId,
      name: ws.name,
      startTime: ws.startTime,
      endTime: ws.endTime,
      workDays: ws.workDays,
      graceMinutes: ws.graceMinutes,
      isActive: ws.isActive,
      companies: ws.companies.map((c) => ({
        companyId: c.companyId,
        branchId: c.branchId,
        isDefault: c.isDefault,
        attachedAt: c.createdAt,
      })),
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  }

  private checkOwner(
    actor: AccessTokenPayload,
    ws: { companyId: string },
  ): void {
    if (actor.role === 'superadmin') {
      return;
    }
    if (ws.companyId !== actor.companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }
  }

  private checkReadable(
    actor: AccessTokenPayload,
    ws: WorkScheduleWithCompanies,
  ): void {
    if (actor.role === 'superadmin') {
      return;
    }
    const hasAccess =
      ws.companyId === actor.companyId ||
      ws.companies.some((c) => c.companyId === actor.companyId);
    if (!hasAccess) {
      throw new ForbiddenException("You cannot access another company's data");
    }
  }

  private async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        login: true,
        companyId: true,
        branchId: true,
        workScheduleId: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async getScheduleById(
    id: string,
  ): Promise<WorkScheduleWithCompanies> {
    const ws = await this.prisma.workSchedule.findUnique({
      where: { id },
      include: { companies: true },
    });
    if (!ws) {
      throw new NotFoundException('Work schedule not found');
    }
    return ws;
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

  private async checkBranch(
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (branch.companyId !== companyId) {
      throw new ConflictException('Branch is not in this company');
    }
  }

  private async checkNameUnique(
    companyId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.workSchedule.findFirst({
      where: excludedId
        ? { companyId, name, id: { not: excludedId } }
        : { companyId, name },
    });
    if (existing) {
      throw new ConflictException('Name already exists in this company');
    }
  }

  private async clearDefaultForCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    await tx.workScheduleCompany.updateMany({
      where: { companyId, isDefault: true },
      data: { isDefault: false },
    });
  }
}
