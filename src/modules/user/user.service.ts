import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/config/prisma/prisma.service';
import { PasswordService } from '../auth/services/password.service';
import { trimToNull } from '../../common/utils/helpers';
import { getFile, buildUploadUrl } from '../../common/upload/image-upload.util';
import {
  checkAccess,
  getScope,
  getCompanyId,
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

type Search = { contains: string; mode: 'insensitive' };

type UserFilter = {
  companyId?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  isActive?: boolean;
  isBlocked?: boolean;
  role?: UserRole;
  OR?: {
    login?: Search;
    firstName?: Search;
    lastName?: Search;
    phone?: Search;
    email?: Search;
    employeeNo?: Search;
  }[];
};

type UserData = {
  login?: string;
  role?: UserRole;
  companyId?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  workScheduleId?: string | null;
  employeeNo?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  passportSerial?: string | null;
  dateOfBirth?: Date | null;
  baseSalary?: number | null;
};

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

    let companyId = dto.companyId;
    if (actor.role !== 'superadmin') {
      companyId = getCompanyId(actor, dto.companyId);
    }

    const login = trimToNull(dto.login);
    if (!login) {
      throw new ConflictException('Login is required');
    }
    await this.checkLoginUnique(login);

    const email = trimToNull(dto.email);
    if (email) {
      await this.checkEmailUnique(email);
    }

    if (companyId) {
      await this.checkCompany(companyId);
    }
    if (dto.branchId) {
      await this.checkBranch(dto.branchId, companyId);
    }
    if (dto.departmentId) {
      await this.checkDepartment(dto.departmentId, companyId);
    }
    if (dto.positionId) {
      await this.checkPosition(dto.positionId, companyId);
    }
    if (dto.managerId) {
      await this.checkManager(dto.managerId);
    }
    if (dto.workScheduleId) {
      await this.checkWorkSchedule(dto.workScheduleId);
    }

    if (dto.employeeNo && companyId) {
      await this.checkEmployeeNoUnique(companyId, dto.employeeNo);
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
        baseSalary: dto.baseSalary ?? null,
      },
      select: USER_SELECT,
    });
  }

  async findAll(query: UserQueryDto, actor: AccessTokenPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const scope = getScope(actor, {
      companyId: query.companyId,
      branchId: query.branchId,
    });
    const forcedRole = actor.role === 'manager' ? 'employee' : query.role;

    const baseWhere: UserFilter = {};
    if (scope.companyId) {
      baseWhere.companyId = scope.companyId;
    }
    if (scope.branchId) {
      baseWhere.branchId = scope.branchId;
    }
    if (query.departmentId) {
      baseWhere.departmentId = query.departmentId;
    }
    if (query.positionId) {
      baseWhere.positionId = query.positionId;
    }
    if (query.isActive !== undefined) {
      baseWhere.isActive = query.isActive;
    }
    if (query.isBlocked !== undefined) {
      baseWhere.isBlocked = query.isBlocked;
    }

    const search = trimToNull(query.search);
    if (search) {
      baseWhere.OR = [
        { login: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const where: UserFilter = { ...baseWhere };
    if (forcedRole) {
      where.role = forcedRole;
    }

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
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AccessTokenPayload) {
    const existing = await this.getUserById(id);
    this.checkUserAccess(actor, existing);

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

    let login: string | undefined;
    if (dto.login) {
      login = trimToNull(dto.login) ?? undefined;
      if (!login) {
        throw new ConflictException('Login is required');
      }
      await this.checkLoginUnique(login, id);
    }

    let email: string | null | undefined;
    if (dto.email !== undefined) {
      email = trimToNull(dto.email);
      if (email) {
        await this.checkEmailUnique(email, id);
      }
    }

    let companyId = existing.companyId;
    if (dto.companyId !== undefined) {
      companyId = dto.companyId ?? null;
    }

    if (dto.companyId) {
      await this.checkCompany(dto.companyId);
    }
    if (dto.branchId) {
      await this.checkBranch(dto.branchId, companyId ?? undefined);
    }
    if (dto.departmentId) {
      await this.checkDepartment(dto.departmentId, companyId ?? undefined);
    }
    if (dto.positionId) {
      await this.checkPosition(dto.positionId, companyId ?? undefined);
    }
    if (dto.managerId) {
      await this.checkManager(dto.managerId);
    }
    if (dto.workScheduleId) {
      await this.checkWorkSchedule(dto.workScheduleId);
    }

    let employeeNo: string | null | undefined;
    if (dto.employeeNo !== undefined) {
      employeeNo = trimToNull(dto.employeeNo);
      if (employeeNo && companyId) {
        await this.checkEmployeeNoUnique(companyId, employeeNo, id);
      }
    }

    const data: UserData = {};
    if (login) {
      data.login = login;
    }
    if (dto.role) {
      data.role = dto.role;
    }
    if (dto.companyId !== undefined) {
      data.companyId = dto.companyId ?? null;
    }
    if (dto.branchId !== undefined) {
      data.branchId = dto.branchId ?? null;
    }
    if (dto.departmentId !== undefined) {
      data.departmentId = dto.departmentId ?? null;
    }
    if (dto.positionId !== undefined) {
      data.positionId = dto.positionId ?? null;
    }
    if (dto.managerId !== undefined) {
      data.managerId = dto.managerId ?? null;
    }
    if (dto.workScheduleId !== undefined) {
      data.workScheduleId = dto.workScheduleId ?? null;
    }
    if (employeeNo !== undefined) {
      data.employeeNo = employeeNo;
    }
    if (dto.firstName !== undefined) {
      data.firstName = trimToNull(dto.firstName);
    }
    if (dto.lastName !== undefined) {
      data.lastName = trimToNull(dto.lastName);
    }
    if (dto.middleName !== undefined) {
      data.middleName = trimToNull(dto.middleName);
    }
    if (dto.phone !== undefined) {
      data.phone = trimToNull(dto.phone);
    }
    if (email !== undefined) {
      data.email = email;
    }
    if (dto.address !== undefined) {
      data.address = trimToNull(dto.address);
    }
    if (dto.passportSerial !== undefined) {
      data.passportSerial = trimToNull(dto.passportSerial);
    }
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if (dto.baseSalary !== undefined) {
      data.baseSalary = dto.baseSalary ?? null;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: USER_SELECT,
    });
  }

  async updateOwnProfile(actor: AccessTokenPayload, dto: UpdateOwnProfileDto) {
    const existing = await this.getUserById(actor.sub);

    let email: string | null | undefined;
    if (dto.email !== undefined) {
      email = trimToNull(dto.email);
      if (email) {
        await this.checkEmailUnique(email, existing.id);
      }
    }

    const data: UserData = {};
    if (dto.firstName !== undefined) {
      data.firstName = trimToNull(dto.firstName);
    }
    if (dto.lastName !== undefined) {
      data.lastName = trimToNull(dto.lastName);
    }
    if (dto.middleName !== undefined) {
      data.middleName = trimToNull(dto.middleName);
    }
    if (dto.phone !== undefined) {
      data.phone = trimToNull(dto.phone);
    }
    if (email !== undefined) {
      data.email = email;
    }
    if (dto.address !== undefined) {
      data.address = trimToNull(dto.address);
    }
    if (dto.passportSerial !== undefined) {
      data.passportSerial = trimToNull(dto.passportSerial);
    }
    if (dto.dateOfBirth !== undefined) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }

    return this.prisma.user.update({
      where: { id: existing.id },
      data,
      select: USER_SELECT,
    });
  }

  async updateOwnAvatar(actor: AccessTokenPayload, file?: Express.Multer.File) {
    const uploaded = getFile(file);

    return this.prisma.user.update({
      where: { id: actor.sub },
      data: { avatarUrl: buildUploadUrl('avatars', uploaded.filename) },
      select: USER_SELECT,
    });
  }

  async updateAvatar(
    id: string,
    actor: AccessTokenPayload,
    file?: Express.Multer.File,
  ) {
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
    const uploaded = getFile(file);

    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl: buildUploadUrl('avatars', uploaded.filename) },
      select: USER_SELECT,
    });
  }

  async updateFaceImage(
    id: string,
    actor: AccessTokenPayload,
    file?: Express.Multer.File,
  ) {
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
    const uploaded = getFile(file);

    return this.prisma.user.update({
      where: { id },
      data: { faceImageUrl: buildUploadUrl('faces', uploaded.filename) },
      select: USER_SELECT,
    });
  }

  async toggleStatus(
    id: string,
    dto: ToggleUserStatusDto,
    actor: AccessTokenPayload,
  ) {
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
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
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
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
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
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
    const user = await this.getUserById(id);
    this.checkUserAccess(actor, user);
    if (actor.role !== 'superadmin' && user.role === 'superadmin') {
      throw new ForbiddenException('Cannot delete a superadmin user');
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true as const, id };
  }

  private checkUserAccess(
    actor: AccessTokenPayload,
    target: { companyId: string | null; branchId: string | null; role: string },
  ): void {
    checkAccess(actor, target);
    if (actor.role === 'manager' && target.role !== 'employee') {
      throw new ForbiddenException(
        'Manager can only manage employee-role users',
      );
    }
  }

  private async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async checkLoginUnique(
    login: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: excludedId ? { login, id: { not: excludedId } } : { login },
    });
    if (existing) {
      throw new ConflictException('Login already exists');
    }
  }

  private async checkEmailUnique(
    email: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: excludedId ? { email, id: { not: excludedId } } : { email },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }
  }

  private async checkEmployeeNoUnique(
    companyId: string,
    employeeNo: string,
    excludedId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: excludedId
        ? { companyId, employeeNo, id: { not: excludedId } }
        : { companyId, employeeNo },
    });
    if (existing) {
      throw new ConflictException(
        'Employee number already exists in this company',
      );
    }
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
    companyId?: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, companyId: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (companyId && branch.companyId !== companyId) {
      throw new ConflictException('Branch is not in this company');
    }
  }

  private async checkDepartment(
    departmentId: string,
    companyId?: string,
  ): Promise<void> {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, companyId: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    if (companyId && department.companyId !== companyId) {
      throw new ConflictException('Department is not in this company');
    }
  }

  private async checkPosition(
    positionId: string,
    companyId?: string,
  ): Promise<void> {
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true, companyId: true },
    });
    if (!position) {
      throw new NotFoundException('Position not found');
    }
    if (companyId && position.companyId !== companyId) {
      throw new ConflictException('Position is not in this company');
    }
  }

  private async checkManager(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Manager not found');
    }
  }

  private async checkWorkSchedule(workScheduleId: string): Promise<void> {
    const ws = await this.prisma.workSchedule.findUnique({
      where: { id: workScheduleId },
      select: { id: true },
    });
    if (!ws) {
      throw new NotFoundException('Work schedule not found');
    }
  }
}
