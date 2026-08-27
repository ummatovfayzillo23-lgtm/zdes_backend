import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '../../common/congif/prisma/prisma.service';
import {
  assertWithinScope,
  resolveScopedCompanyId,
} from '../../common/utils/scope.util';
import type { AccessTokenPayload } from '../auth/interfaces/access-token-payload.interface';
import { NotificationService } from '../notification/notification.service';
import {
  CreateTaskDto,
  CreateSelfTaskDto,
  CreateTaskProjectDto,
  MyTasksQueryDto,
  ReorderTasksDto,
  TaskProjectQueryDto,
  TaskQueryDto,
  UpdateTaskAssigneesDto,
  UpdateTaskDto,
  UpdateTaskProjectDto,
  UpdateTaskStatusDto,
} from './dto';
import type {
  TaskBoardResponse,
  TaskCalendarResponse,
  TaskDeleteResponse,
  TaskListResponse,
  TaskReorderResponse,
  TaskWithRelations,
} from './interfaces/task.interface';

@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  private validateDates(startDate?: string, dueDate?: string): void {
    if (startDate && isNaN(Date.parse(startDate))) {
      throw new BadRequestException('Invalid startDate format');
    }
    if (dueDate && isNaN(Date.parse(dueDate))) {
      throw new BadRequestException('Invalid dueDate format');
    }
    if (startDate && dueDate && new Date(startDate) > new Date(dueDate)) {
      throw new BadRequestException('startDate cannot be after dueDate');
    }
  }

  private validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException('Title cannot be empty');
    }
    if (title.length > 255) {
      throw new BadRequestException('Title cannot exceed 255 characters');
    }
  }

  private validateOrder(order?: number): void {
    if (order !== undefined && order < 0) {
      throw new BadRequestException('Order cannot be negative');
    }
  }

  // ============================================================================
  // TaskProject CRUD
  // ============================================================================
  async createProject(actor: AccessTokenPayload, dto: CreateTaskProjectDto) {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    if (!dto.name || dto.name.trim().length === 0) {
      throw new BadRequestException('Project name cannot be empty');
    }
    if (dto.name.length > 255) {
      throw new BadRequestException(
        'Project name cannot exceed 255 characters',
      );
    }

    const existing = await this.prisma.taskProject.findUnique({
      where: { companyId_name: { companyId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new ConflictException(
        `Project with name "${dto.name}" already exists in company`,
      );
    }

    return this.prisma.taskProject.create({
      data: {
        companyId,
        name: dto.name.trim(),
        description: dto.description ?? null,
        color: dto.color ?? null,
        icon: dto.icon ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAllProjects(
    actor: AccessTokenPayload,
    companyIdQuery?: string,
    query?: TaskProjectQueryDto,
  ) {
    const companyId = resolveScopedCompanyId(
      actor,
      companyIdQuery ?? query?.companyId,
    );

    const where: Prisma.TaskProjectWhereInput = { companyId };
    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query?.search) {
      const search = query.search.trim();
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    return this.prisma.taskProject.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findProjectById(actor: AccessTokenPayload, id: string) {
    const project = await this.prisma.taskProject.findUnique({
      where: { id },
    });
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    assertWithinScope(actor, { companyId: project.companyId });
    return project;
  }

  async updateProject(
    actor: AccessTokenPayload,
    id: string,
    dto: UpdateTaskProjectDto,
  ) {
    const project = await this.findProjectById(actor, id);
    if (dto.name) {
      if (dto.name.trim().length === 0 || dto.name.length > 255) {
        throw new BadRequestException('Invalid project name length');
      }
      const existing = await this.prisma.taskProject.findUnique({
        where: {
          companyId_name: {
            companyId: project.companyId,
            name: dto.name.trim(),
          },
        },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Project with name "${dto.name}" already exists in company`,
        );
      }
    }

    return this.prisma.taskProject.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeProject(
    actor: AccessTokenPayload,
    id: string,
  ): Promise<TaskDeleteResponse> {
    await this.findProjectById(actor, id);
    await this.prisma.task.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    });
    await this.prisma.taskProject.delete({ where: { id } });
    return { success: true, id };
  }

  // ============================================================================
  // Task Core CRUD & Projections
  // ============================================================================
  async create(
    actor: AccessTokenPayload,
    dto: CreateTaskDto,
  ): Promise<TaskWithRelations> {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    this.validateTitle(dto.title);
    this.validateDates(dto.startDate, dto.dueDate);
    this.validateOrder(dto.order);

    if (dto.projectId) {
      const project = await this.prisma.taskProject.findUnique({
        where: { id: dto.projectId },
        select: { id: true, companyId: true },
      });
      if (!project || project.companyId !== companyId) {
        throw new BadRequestException(
          'Project does not exist or does not belong to this company',
        );
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { id: true, companyId: true },
      });
      if (!department || department.companyId !== companyId) {
        throw new BadRequestException(
          'Department does not exist or does not belong to this company',
        );
      }
    }

    const uniqueAssigneeIds = dto.assigneeIds
      ? Array.from(new Set(dto.assigneeIds))
      : [];

    const task = await this.prisma.task.create({
      data: {
        companyId,
        projectId: dto.projectId ?? null,
        departmentId: dto.departmentId ?? null,
        title: dto.title.trim(),
        description: dto.description ?? null,
        type: dto.type ?? TaskType.feature,
        status: dto.status ?? TaskStatus.not_started,
        priority: dto.priority ?? TaskPriority.normal,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        order: dto.order ?? 0,
        createdById: actor.sub,
        assignees: uniqueAssigneeIds.length
          ? {
              create: uniqueAssigneeIds.map((userId) => ({ userId })),
            }
          : undefined,
      },
      include: {
        project: true,
        department: true,
        createdBy: true,
        assignees: { include: { user: true } },
      },
    });

    // Notify assigned users (excluding self) wrapped in try-catch
    if (this.notificationService && uniqueAssigneeIds.length) {
      for (const userId of uniqueAssigneeIds) {
        if (userId !== actor.sub) {
          try {
            await this.notificationService.notifyUser(
              userId,
              'New Task Assigned',
              `You have been assigned to task "${task.title}"`,
              'briefcase',
              { taskId: task.id, type: 'TASK_ASSIGNED' },
            );
          } catch {
            // Non-blocking notification error
          }
        }
      }
    }

    return task;
  }

  // ============================================================================
  // Self-task: foydalanuvchi o'zi uchun task yaratadi va o'zi boshqaradi
  // ============================================================================
  async createSelf(
    actor: AccessTokenPayload,
    dto: CreateSelfTaskDto,
  ): Promise<TaskWithRelations> {
    if (!actor.companyId) {
      throw new ForbiddenException('Actor is not assigned to a company');
    }
    this.validateTitle(dto.title);

    const task = await this.prisma.task.create({
      data: {
        companyId: actor.companyId,
        title: dto.title.trim(),
        description: dto.description ?? null,
        type: TaskType.feature,
        status: TaskStatus.not_started,
        priority: TaskPriority.normal,
        createdById: actor.sub,
        assignees: {
          create: [{ userId: actor.sub }],
        },
      },
      include: {
        project: true,
        department: true,
        createdBy: true,
        assignees: { include: { user: true } },
      },
    });

    return task;
  }

  async findMyTasks(
    actor: AccessTokenPayload,
    query: MyTasksQueryDto,
  ): Promise<{ items: TaskWithRelations[]; total: number; page: number; limit: number; totalPages: number }> {
    if (!actor.companyId) {
      throw new ForbiddenException('Actor is not assigned to a company');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      companyId: actor.companyId,
      OR: [
        { createdById: actor.sub },
        { assignees: { some: { userId: actor.sub } } },
      ],
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          project: true,
          department: true,
          createdBy: true,
          assignees: { include: { user: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items: items as TaskWithRelations[],
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(
    actor: AccessTokenPayload,
    id: string,
  ): Promise<TaskWithRelations> {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        department: true,
        createdBy: true,
        assignees: { include: { user: true } },
      },
    });
    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }
    assertWithinScope(actor, { companyId: task.companyId });
    return task;
  }

  async findAll(
    actor: AccessTokenPayload,
    query: TaskQueryDto = {},
  ): Promise<TaskListResponse | TaskBoardResponse | TaskCalendarResponse> {
    const companyId = resolveScopedCompanyId(actor, query.companyId);
    const viewMode = query.viewMode ?? query.view ?? 'list';

    if (query.page !== undefined && query.page < 1) {
      throw new BadRequestException('page must be >= 1');
    }
    if (query.limit !== undefined && (query.limit < 1 || query.limit > 100)) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    const where: Prisma.TaskWhereInput = { companyId };
    if (query.projectId) where.projectId = query.projectId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.type) where.type = query.type;
    if (query.createdById) where.createdById = query.createdById;
    if (query.assigneeId) {
      where.assignees = { some: { userId: query.assigneeId } };
    }
    if (query.search) {
      const search = query.search.trim();
      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }
    }
    if (query.startDate) where.startDate = { gte: new Date(query.startDate) };
    if (query.dueDate) where.dueDate = { lte: new Date(query.dueDate) };

    // Projections based on viewMode
    if (viewMode === 'board') {
      const allTasks = await this.prisma.task.findMany({
        where,
        orderBy: [{ status: 'asc' }, { order: 'asc' }, { createdAt: 'desc' }],
        include: {
          project: true,
          department: true,
          createdBy: true,
          assignees: { include: { user: true } },
        },
      });

      const board: Record<TaskStatus, { count: number; items: any[] }> = {
        [TaskStatus.not_started]: { count: 0, items: [] },
        [TaskStatus.in_progress]: { count: 0, items: [] },
        [TaskStatus.in_review]: { count: 0, items: [] },
        [TaskStatus.done]: { count: 0, items: [] },
        [TaskStatus.cancelled]: { count: 0, items: [] },
      };

      for (const t of allTasks) {
        if (board[t.status]) {
          board[t.status].items.push(t);
          board[t.status].count++;
        }
      }

      return { ...board, total: allTasks.length };
    }

    if (viewMode === 'calendar') {
      const tasks = await this.prisma.task.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        include: {
          project: true,
          department: true,
          createdBy: true,
          assignees: { include: { user: true } },
        },
      });
      return { items: tasks, total: tasks.length };
    }

    // Default: list (or grid) view with pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const orderBy: Prisma.TaskOrderByWithRelationInput = query.sortBy
      ? {
          [query.sortBy]: query.sortOrder ?? 'asc',
        }
      : { createdAt: 'desc' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          project: true,
          department: true,
          createdBy: true,
          assignees: { include: { user: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async update(
    actor: AccessTokenPayload,
    id: string,
    dto: UpdateTaskDto,
  ): Promise<TaskWithRelations> {
    const task = await this.findOne(actor, id);
    if (actor.role === 'employee') {
      throw new ForbiddenException(
        'Employees are not authorized to perform full task updates',
      );
    }

    if (dto.title !== undefined) this.validateTitle(dto.title);
    if (dto.startDate !== undefined || dto.dueDate !== undefined) {
      const sDate =
        dto.startDate ??
        (task.startDate ? task.startDate.toISOString() : undefined);
      const dDate =
        dto.dueDate ?? (task.dueDate ? task.dueDate.toISOString() : undefined);
      this.validateDates(sDate, dDate);
    }
    if (dto.order !== undefined) this.validateOrder(dto.order);

    if (dto.projectId) {
      const project = await this.prisma.taskProject.findUnique({
        where: { id: dto.projectId },
        select: { id: true, companyId: true },
      });
      if (!project || project.companyId !== task.companyId) {
        throw new BadRequestException(
          'Project does not exist or does not belong to this company',
        );
      }
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
        select: { id: true, companyId: true },
      });
      if (!department || department.companyId !== task.companyId) {
        throw new BadRequestException(
          'Department does not exist or does not belong to this company',
        );
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.priority ? { priority: dto.priority } : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.dueDate !== undefined
          ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null }
          : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId }
          : {}),
      },
      include: {
        project: true,
        department: true,
        createdBy: true,
        assignees: { include: { user: true } },
      },
    });
  }

  async updateStatus(
    actor: AccessTokenPayload,
    id: string,
    dto: UpdateTaskStatusDto,
  ): Promise<TaskWithRelations> {
    const task = await this.findOne(actor, id);
    if (!dto.status || !Object.values(TaskStatus).includes(dto.status)) {
      throw new BadRequestException(`Invalid status value "${dto.status}"`);
    }

    // If actor is employee, ensure they are assigned to this task or created it
    if (actor.role === 'employee') {
      const isAssigned = task.assignees?.some((a) => a.userId === actor.sub);
      const isCreator = task.createdById === actor.sub;
      if (!isAssigned && !isCreator) {
        throw new ForbiddenException('Employee is not assigned to this task');
      }
    }

    return this.prisma.task.update({
      where: { id },
      data: { status: dto.status },
      include: {
        project: true,
        department: true,
        createdBy: true,
        assignees: { include: { user: true } },
      },
    });
  }

  async updateAssignees(
    actor: AccessTokenPayload,
    id: string,
    dto: UpdateTaskAssigneesDto,
  ): Promise<TaskWithRelations> {
    const task = await this.findOne(actor, id);
    if (actor.role === 'employee') {
      throw new ForbiddenException(
        'Employees are not authorized to update assignees',
      );
    }

    const uniqueAssigneeIds = Array.from(new Set(dto.assigneeIds));
    const previousAssigneeIds = (task.assignees ?? []).map((a) => a.userId);
    const newAssigneeIds = uniqueAssigneeIds.filter(
      (uid) => !previousAssigneeIds.includes(uid),
    );

    // Atomic replacement in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (uniqueAssigneeIds.length) {
        await tx.taskAssignee.createMany({
          data: uniqueAssigneeIds.map((userId) => ({ taskId: id, userId })),
        });
      }
      return tx.task.findUniqueOrThrow({
        where: { id },
        include: {
          project: true,
          department: true,
          createdBy: true,
          assignees: { include: { user: true } },
        },
      });
    });

    // Notify newly assigned users
    if (this.notificationService && newAssigneeIds.length) {
      for (const userId of newAssigneeIds) {
        if (userId !== actor.sub) {
          try {
            await this.notificationService.notifyUser(
              userId,
              'Task Assigned',
              `You were assigned to task "${task.title}"`,
              'briefcase',
              { taskId: id, type: 'TASK_ASSIGNED' },
            );
          } catch {
            // Non-blocking notification error
          }
        }
      }
    }

    return updated;
  }

  async reorder(
    actor: AccessTokenPayload,
    dto: ReorderTasksDto,
  ): Promise<TaskReorderResponse> {
    if (!dto.items || dto.items.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    // Verify all tasks exist and belong to actor's company
    for (const item of dto.items) {
      const task = await this.prisma.task.findUnique({
        where: { id: item.id },
      });
      if (!task) {
        throw new NotFoundException(`Task with ID ${item.id} not found`);
      }
      assertWithinScope(actor, { companyId: task.companyId });
    }

    // Execute in transaction
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.task.update({
          where: { id: item.id },
          data: {
            order: item.order,
            ...(item.status ? { status: item.status } : {}),
          },
        }),
      ),
    );

    return { success: true, updatedCount: dto.items.length };
  }

  async remove(
    actor: AccessTokenPayload,
    id: string,
  ): Promise<TaskDeleteResponse> {
    await this.findOne(actor, id);
    if (actor.role === 'employee') {
      throw new ForbiddenException(
        'Employees are not authorized to delete tasks',
      );
    }

    await this.prisma.task.delete({ where: { id } });
    return { success: true, id };
  }
}
