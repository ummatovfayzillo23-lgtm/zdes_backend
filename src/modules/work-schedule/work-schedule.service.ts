import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, WorkSchedule, WorkScheduleCompany } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
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

@Injectable()
export class WorkScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkScheduleDto, actor: AccessTokenPayload) {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    await this.ensureCompanyExists(companyId);
    if (dto.branchId)
      await this.ensureBranchBelongsToCompany(dto.branchId, companyId);

    const normalizedName = this.normalizeRequiredName(dto.name);
    await this.ensureNameIsUnique(companyId, normalizedName);

    if (dto.userId) {
      const user = await this.findUserOrThrow(dto.userId);
      if (user.companyId && user.companyId !== companyId) {
        throw new ConflictException(
          'User does not belong to the selected company',
        );
      }
    }

    // Company-wide schedule (no userId) automatically becomes that
    // company's default; a schedule created for a single user never is.
    const isDefault = !dto.userId;

    const workScheduleId = await this.prisma.$transaction(async (tx) => {
      if (isDefault) await this.clearDefaultForCompany(tx, companyId);

      const workSchedule = await tx.workSchedule.create({
        data: {
          companyId,
          name: normalizedName,
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
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });

    const where: Prisma.WorkScheduleCompanyWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.isDefault !== undefined ? { isDefault: query.isDefault } : {}),
      workSchedule: {
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
    };

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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    this.assertReadableScope(actor, ws);
    return this.toDetail(ws);
  }

  async update(
    id: string,
    dto: UpdateWorkScheduleDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findWorkScheduleByIdOrThrow(id);
    this.assertOwnerScope(actor, existing);

    const normalizedName = dto.name
      ? this.normalizeRequiredName(dto.name)
      : existing.name;
    if (dto.name)
      await this.ensureNameIsUnique(existing.companyId, normalizedName, id);

    await this.prisma.workSchedule.update({
      where: { id },
      data: {
        ...(dto.name ? { name: normalizedName } : {}),
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(dto.workDays ? { workDays: dto.workDays } : {}),
        ...(dto.graceMinutes !== undefined
          ? { graceMinutes: dto.graceMinutes }
          : {}),
      },
    });

    return this.findOne(id, actor);
  }

  async toggleStatus(
    id: string,
    dto: ToggleWorkScheduleStatusDto,
    actor: AccessTokenPayload,
  ) {
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    this.assertOwnerScope(actor, ws);
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
    await this.findWorkScheduleByIdOrThrow(id);
    await this.ensureCompanyExists(dto.companyId);
    if (dto.branchId)
      await this.ensureBranchBelongsToCompany(dto.branchId, dto.companyId);

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
      if (dto.isDefault) await this.clearDefaultForCompany(tx, dto.companyId);

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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    const user = await this.findUserOrThrow(dto.userId);
    this.assertReadableScope(actor, ws);
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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    const user = await this.findUserOrThrow(dto.userId);
    this.assertReadableScope(actor, ws);
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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    this.assertOwnerScope(actor, ws);
    // WorkScheduleCompany rows cascade-delete; users referencing this
    // schedule fall back to SetNull via the WorkSchedule -> User relation.
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

  private assertOwnerScope(
    actor: AccessTokenPayload,
    ws: { companyId: string },
  ): void {
    if (actor.role === 'superadmin') return;
    if (ws.companyId !== actor.companyId) {
      throw new ForbiddenException("You cannot access another company's data");
    }
  }

  private assertReadableScope(
    actor: AccessTokenPayload,
    ws: WorkScheduleWithCompanies,
  ): void {
    if (actor.role === 'superadmin') return;
    const hasAccess =
      ws.companyId === actor.companyId ||
      ws.companies.some((c) => c.companyId === actor.companyId);
    if (!hasAccess) {
      throw new ForbiddenException("You cannot access another company's data");
    }
  }

  private async findUserOrThrow(userId: string) {
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
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async findWorkScheduleByIdOrThrow(
    id: string,
  ): Promise<WorkScheduleWithCompanies> {
    const ws = await this.prisma.workSchedule.findUnique({
      where: { id },
      include: { companies: true },
    });
    if (!ws) throw new NotFoundException('Work schedule not found');
    return ws;
  }

  private async ensureCompanyExists(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
  }

  private async ensureBranchBelongsToCompany(
    branchId: string,
    companyId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (branch.companyId !== companyId) {
      throw new ConflictException(
        'Branch does not belong to the selected company',
      );
    }
  }

  private async ensureNameIsUnique(
    companyId: string,
    name: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.workSchedule.findFirst({
      where: {
        companyId,
        name,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing)
      throw new ConflictException(
        'Work schedule name already exists for this company',
      );
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

  private normalizeRequiredName(name: string): string {
    const normalized = trimToNull(name);
    if (!normalized)
      throw new ConflictException('Work schedule name is required');
    return normalized;
  }
}
