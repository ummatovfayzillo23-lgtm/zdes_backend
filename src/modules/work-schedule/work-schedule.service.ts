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
import { AssignUserDto } from './dto/assign-user.dto';
import { CreateWorkScheduleDto } from './dto/create-work-schedule.dto';
import { ToggleWorkScheduleStatusDto } from './dto/toggle-work-schedule-status.dto';
import { UpdateWorkScheduleDto } from './dto/update-work-schedule.dto';
import { WorkScheduleQueryDto } from './dto/work-schedule-query.dto';

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

    // Company-wide schedule (no userId) automatically becomes the default;
    // a schedule created for a single user never is.
    const isDefault = !dto.userId;
    if (isDefault) await this.clearDefaultForCompany(companyId);

    const workSchedule = await this.prisma.workSchedule.create({
      data: {
        companyId,
        branchId: dto.branchId ?? null,
        name: normalizedName,
        startTime: dto.startTime,
        endTime: dto.endTime,
        workDays: dto.workDays,
        graceMinutes: dto.graceMinutes ?? 0,
        isDefault,
      },
    });

    if (dto.userId) {
      await this.prisma.user.update({
        where: { id: dto.userId },
        data: { workScheduleId: workSchedule.id },
      });
    }

    return workSchedule;
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

    const where: Prisma.WorkScheduleWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.isDefault !== undefined ? { isDefault: query.isDefault } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.workSchedule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.workSchedule.count({ where }),
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
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, ws);
    return ws;
  }

  async update(
    id: string,
    dto: UpdateWorkScheduleDto,
    actor: AccessTokenPayload,
  ) {
    const existing = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, existing);

    const companyId = dto.companyId
      ? resolveScopedCompanyId(actor, dto.companyId)
      : existing.companyId;

    if (dto.companyId) await this.ensureCompanyExists(companyId);
    if (dto.branchId)
      await this.ensureBranchBelongsToCompany(dto.branchId, companyId);

    const normalizedName = dto.name
      ? this.normalizeRequiredName(dto.name)
      : existing.name;
    if (dto.name || dto.companyId)
      await this.ensureNameIsUnique(companyId, normalizedName, id);

    return this.prisma.workSchedule.update({
      where: { id },
      data: {
        ...(dto.companyId ? { companyId } : {}),
        ...(dto.branchId !== undefined
          ? { branchId: dto.branchId ?? null }
          : {}),
        ...(dto.name ? { name: normalizedName } : {}),
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(dto.workDays ? { workDays: dto.workDays } : {}),
        ...(dto.graceMinutes !== undefined
          ? { graceMinutes: dto.graceMinutes }
          : {}),
      },
    });
  }

  async toggleStatus(
    id: string,
    dto: ToggleWorkScheduleStatusDto,
    actor: AccessTokenPayload,
  ) {
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, ws);
    const nextIsActive = dto.isActive ?? !ws.isActive;

    return this.prisma.workSchedule.update({
      where: { id },
      data: { isActive: nextIsActive },
    });
  }

  async setDefault(id: string, actor: AccessTokenPayload) {
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, ws);

    await this.clearDefaultForCompany(ws.companyId, id);

    return this.prisma.workSchedule.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async assignUser(id: string, dto: AssignUserDto, actor: AccessTokenPayload) {
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, ws);
    const user = await this.findUserOrThrow(dto.userId);
    assertWithinScope(actor, user);

    if (user.companyId && user.companyId !== ws.companyId) {
      throw new ConflictException(
        "Work schedule does not belong to the user's company",
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
    assertWithinScope(actor, ws);
    const user = await this.findUserOrThrow(dto.userId);
    assertWithinScope(actor, user);

    return this.prisma.user.update({
      where: { id: dto.userId },
      data: { workScheduleId: null },
      select: { id: true, login: true, companyId: true, workScheduleId: true },
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const ws = await this.findWorkScheduleByIdOrThrow(id);
    assertWithinScope(actor, ws);
    await this.prisma.workSchedule.delete({ where: { id } });
    return { success: true as const, id };
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

  private async findWorkScheduleByIdOrThrow(id: string) {
    const ws = await this.prisma.workSchedule.findUnique({ where: { id } });
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
    companyId: string,
    excludedId?: string,
  ): Promise<void> {
    await this.prisma.workSchedule.updateMany({
      where: {
        companyId,
        isDefault: true,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
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
