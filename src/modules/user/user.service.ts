import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { trimToNull } from '../../common/utils/helpers';
import {
  assertWithinScope,
  resolveCompanyBranchScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ToggleUserBlockedDto } from './dto/toggle-user-blocked.dto';
import { ToggleUserStatusDto } from './dto/toggle-user-status.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';

const USER_ROLES = ['superadmin', 'admin', 'manager', 'employee'] as const;

const USER_SELECT = {
  id: true,
  login: true,
  role: true,
  companyId: true,
  branchId: true,
  departmentId: true,
  positionId: true,
  managerId: true,
  workScheduleId: true,
  employeeNo: true,
  firstName: true,
  lastName: true,
  middleName: true,
  phone: true,
  email: true,
  address: true,
  passportSerial: true,
  dateOfBirth: true,
  avatarUrl: true,
  faceDeviceUserId: true,
  faceImageUrl: true,
  baseSalary: true,
  isActive: true,
  isBlocked: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
  ) {}

  async create(dto: CreateUserDto, actor: AccessTokenPayload) {
    if (actor.role !== 'superadmin' && dto.role === 'superadmin') {
      throw new ForbiddenException('Cannot create a superadmin user');
    }

    // User.companyId is nullable (superadmin needs none); admin is still forced into its own company.
    const companyId =
      actor.role === 'superadmin'
        ? dto.companyId
        : resolveScopedCompanyId(actor, dto.companyId);

    const login = this.normalizeRequiredField(dto.login, 'login');
    await this.ensureLoginIsUnique(login);

    const email = trimToNull(dto.email);
    if (email) await this.ensureEmailIsUnique(email);

    if (companyId) await this.ensureCompanyExists(companyId);
    if (dto.branchId)
      await this.ensureBranchBelongsToCompany(dto.branchId, companyId);
    if (dto.departmentId)
      await this.ensureDepartmentBelongsToCompany(dto.departmentId, companyId);
    if (dto.positionId)
      await this.ensurePositionBelongsToCompany(dto.positionId, companyId);
    if (dto.managerId) await this.ensureUserExists(dto.managerId);
    if (dto.workScheduleId)
      await this.ensureWorkScheduleExists(dto.workScheduleId);

    if (dto.employeeNo && companyId) {
      await this.ensureEmployeeNoIsUnique(companyId, dto.employeeNo);
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    return this.prisma.user.create({
      data: {
        login,
        passwordHash,
        role: dto.role,
        companyId: companyId ?? null,
        branchId: dto.branchId ?? null,
        departmentId: dto.departmentId ?? null,
        positionId: dto.positionId ?? null,
        managerId: dto.managerId ?? null,
        workScheduleId: dto.workScheduleId ?? null,
        employeeNo: trimToNull(dto.employeeNo),
        firstName: trimToNull(dto.firstName),
        lastName: trimToNull(dto.lastName),
        middleName: trimToNull(dto.middleName),
        phone: trimToNull(dto.phone),
        email,
        address: trimToNull(dto.address),
        passportSerial: trimToNull(dto.passportSerial),
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        avatarUrl: trimToNull(dto.avatarUrl),
        baseSalary: dto.baseSalary ?? null,
      },
      select: USER_SELECT,
    });
  }

  async findAll(query: UserQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const search = trimToNull(query.search);
    const scope = resolveCompanyBranchScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });
    // Manager only manages employees, never peer managers/admins.
    const forcedRole = actor.role === 'manager' ? 'employee' : query.role;

    const baseWhere: Prisma.UserWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      ...(query.positionId ? { positionId: query.positionId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.isBlocked !== undefined ? { isBlocked: query.isBlocked } : {}),
      ...(search
        ? {
            OR: [
              { login: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { employeeNo: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const where: Prisma.UserWhereInput = {
      ...baseWhere,
      ...(forcedRole ? { role: forcedRole } : {}),
    };

    const [items, total, roleCounts] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: USER_SELECT,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({
        by: ['role'],
        where: baseWhere,
        orderBy: { role: 'asc' },
        _count: true,
      }),
    ]);

    const stats = Object.fromEntries(
      USER_ROLES.map((role) => [role, 0]),
    ) as Record<(typeof USER_ROLES)[number], number>;
    for (const entry of roleCounts) {
      stats[entry.role] = typeof entry._count === 'number' ? entry._count : 0;
    }

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats,
    };
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    const user = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, user);
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AccessTokenPayload) {
    const existing = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, existing);

    if (
      actor.role !== 'superadmin' &&
      (existing.role === 'superadmin' || dto.role === 'superadmin')
    ) {
      throw new ForbiddenException('Cannot modify a superadmin user');
    }

    if (
      actor.role !== 'superadmin' &&
      dto.companyId &&
      dto.companyId !== actor.companyId
    ) {
      throw new ForbiddenException("You cannot access another company's data");
    }

    if (
      actor.role === 'manager' &&
      (dto.role !== undefined ||
        dto.companyId !== undefined ||
        dto.branchId !== undefined)
    ) {
      throw new ForbiddenException(
        'Manager cannot change role, company or branch',
      );
    }

    const login = dto.login
      ? this.normalizeRequiredField(dto.login, 'login')
      : undefined;
    if (login) await this.ensureLoginIsUnique(login, id);

    const email = dto.email !== undefined ? trimToNull(dto.email) : undefined;
    if (email) await this.ensureEmailIsUnique(email, id);

    const companyId =
      dto.companyId !== undefined
        ? (dto.companyId ?? null)
        : existing.companyId;

    if (dto.companyId) await this.ensureCompanyExists(dto.companyId);
    if (dto.branchId)
      await this.ensureBranchBelongsToCompany(
        dto.branchId,
        companyId ?? undefined,
      );
    if (dto.departmentId)
      await this.ensureDepartmentBelongsToCompany(
        dto.departmentId,
        companyId ?? undefined,
      );
    if (dto.positionId)
      await this.ensurePositionBelongsToCompany(
        dto.positionId,
        companyId ?? undefined,
      );
    if (dto.managerId) await this.ensureUserExists(dto.managerId);
    if (dto.workScheduleId)
      await this.ensureWorkScheduleExists(dto.workScheduleId);

    const employeeNo =
      dto.employeeNo !== undefined ? trimToNull(dto.employeeNo) : undefined;
    if (employeeNo && companyId) {
      await this.ensureEmployeeNoIsUnique(companyId, employeeNo, id);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(login ? { login } : {}),
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.companyId !== undefined
          ? { companyId: dto.companyId ?? null }
          : {}),
        ...(dto.branchId !== undefined
          ? { branchId: dto.branchId ?? null }
          : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId ?? null }
          : {}),
        ...(dto.positionId !== undefined
          ? { positionId: dto.positionId ?? null }
          : {}),
        ...(dto.managerId !== undefined
          ? { managerId: dto.managerId ?? null }
          : {}),
        ...(dto.workScheduleId !== undefined
          ? { workScheduleId: dto.workScheduleId ?? null }
          : {}),
        ...(employeeNo !== undefined ? { employeeNo } : {}),
        ...(dto.firstName !== undefined
          ? { firstName: trimToNull(dto.firstName) }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: trimToNull(dto.lastName) }
          : {}),
        ...(dto.middleName !== undefined
          ? { middleName: trimToNull(dto.middleName) }
          : {}),
        ...(dto.phone !== undefined ? { phone: trimToNull(dto.phone) } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(dto.address !== undefined
          ? { address: trimToNull(dto.address) }
          : {}),
        ...(dto.passportSerial !== undefined
          ? { passportSerial: trimToNull(dto.passportSerial) }
          : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
          : {}),
        ...(dto.avatarUrl !== undefined
          ? { avatarUrl: trimToNull(dto.avatarUrl) }
          : {}),
        ...(dto.baseSalary !== undefined
          ? { baseSalary: dto.baseSalary ?? null }
          : {}),
      },
      select: USER_SELECT,
    });
  }

  async updateOwnProfile(actor: AccessTokenPayload, dto: UpdateOwnProfileDto) {
    const existing = await this.findUserByIdOrThrow(actor.sub);

    const email = dto.email !== undefined ? trimToNull(dto.email) : undefined;
    if (email) await this.ensureEmailIsUnique(email, existing.id);

    return this.prisma.user.update({
      where: { id: existing.id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: trimToNull(dto.firstName) }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: trimToNull(dto.lastName) }
          : {}),
        ...(dto.middleName !== undefined
          ? { middleName: trimToNull(dto.middleName) }
          : {}),
        ...(dto.phone !== undefined ? { phone: trimToNull(dto.phone) } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(dto.address !== undefined
          ? { address: trimToNull(dto.address) }
          : {}),
        ...(dto.passportSerial !== undefined
          ? { passportSerial: trimToNull(dto.passportSerial) }
          : {}),
        ...(dto.dateOfBirth !== undefined
          ? { dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null }
          : {}),
        ...(dto.avatarUrl !== undefined
          ? { avatarUrl: trimToNull(dto.avatarUrl) }
          : {}),
      },
      select: USER_SELECT,
    });
  }

  async toggleStatus(
    id: string,
    dto: ToggleUserStatusDto,
    actor: AccessTokenPayload,
  ) {
    const user = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, user);
    const nextIsActive = dto.isActive ?? !user.isActive;

    return this.prisma.user.update({
      where: { id },
      data: { isActive: nextIsActive },
      select: USER_SELECT,
    });
  }

  async toggleBlocked(
    id: string,
    dto: ToggleUserBlockedDto,
    actor: AccessTokenPayload,
  ) {
    const user = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, user);
    const nextIsBlocked = dto.isBlocked ?? !user.isBlocked;

    return this.prisma.user.update({
      where: { id },
      data: { isBlocked: nextIsBlocked },
      select: USER_SELECT,
    });
  }

  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    actor: AccessTokenPayload,
  ) {
    const user = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, user);
    if (actor.role !== 'superadmin' && user.role === 'superadmin') {
      throw new ForbiddenException('Cannot modify a superadmin user');
    }

    const passwordHash = await this.passwordService.hashPassword(
      dto.newPassword,
    );

    return this.prisma.user.update({
      where: { id },
      data: { passwordHash },
      select: USER_SELECT,
    });
  }

  async delete(id: string, actor: AccessTokenPayload) {
    const user = await this.findUserByIdOrThrow(id);
    this.assertUserWithinScope(actor, user);
    if (actor.role !== 'superadmin' && user.role === 'superadmin') {
      throw new ForbiddenException('Cannot delete a superadmin user');
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true as const, id };
  }

  private assertUserWithinScope(
    actor: AccessTokenPayload,
    target: { companyId: string | null; branchId: string | null; role: string },
  ): void {
    assertWithinScope(actor, target);
    if (actor.role === 'manager' && target.role !== 'employee') {
      throw new ForbiddenException(
        'Manager can only manage employee-role users',
      );
    }
  }

  private async findUserByIdOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureLoginIsUnique(
    login: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { login, ...(excludedId ? { id: { not: excludedId } } : {}) },
    });
    if (existing) throw new ConflictException('Login already exists');
  }

  private async ensureEmailIsUnique(
    email: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: { email, ...(excludedId ? { id: { not: excludedId } } : {}) },
    });
    if (existing) throw new ConflictException('Email already exists');
  }

  private async ensureEmployeeNoIsUnique(
    companyId: string,
    employeeNo: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        companyId,
        employeeNo,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (existing)
      throw new ConflictException(
        'Employee number already exists in this company',
      );
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
    companyId?: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    if (companyId && branch.companyId !== companyId) {
      throw new ConflictException(
        'Branch does not belong to the selected company',
      );
    }
  }

  private async ensureDepartmentBelongsToCompany(
    departmentId: string,
    companyId?: string,
  ): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, companyId: true },
    });
    if (!department) throw new NotFoundException('Department not found');
    if (companyId && department.companyId !== companyId) {
      throw new ConflictException(
        'Department does not belong to the selected company',
      );
    }
  }

  private async ensurePositionBelongsToCompany(
    positionId: string,
    companyId?: string,
  ): Promise<void> {
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true, companyId: true },
    });
    if (!position) throw new NotFoundException('Position not found');
    if (companyId && position.companyId !== companyId) {
      throw new ConflictException(
        'Position does not belong to the selected company',
      );
    }
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Manager not found');
  }

  private async ensureWorkScheduleExists(
    workScheduleId: string,
  ): Promise<void> {
    const ws = await this.prisma.workSchedule.findUnique({
      where: { id: workScheduleId },
      select: { id: true },
    });
    if (!ws) throw new NotFoundException('Work schedule not found');
  }

  private normalizeRequiredField(value: string, fieldName: string): string {
    const normalized = trimToNull(value);
    if (!normalized) throw new ConflictException(`${fieldName} is required`);
    return normalized;
  }
}
