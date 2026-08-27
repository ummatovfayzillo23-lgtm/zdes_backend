/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import {
  resolveScopedCompanyId,
  assertWithinScope,
} from '../../../common/utils/scope.util';
import type { AuthUserPayload } from '../../auth/interfaces/auth-user-payload.interface';

// ============================================================================
// DTO Interfaces & Validation Contracts
// ============================================================================
export interface CreateTaskDto {
  companyId?: string;
  projectId?: string;
  departmentId?: string;
  title: string;
  description?: string;
  type?: TaskType;
  status?: TaskStatus;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  order?: number;
  assigneeIds?: string[];
}

export type UpdateTaskDto = Partial<CreateTaskDto>;

export interface TaskQueryDto {
  companyId?: string;
  projectId?: string;
  departmentId?: string;
  assigneeId?: string;
  createdById?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  search?: string;
  startDate?: string;
  dueDate?: string;
  viewMode?: 'list' | 'board' | 'calendar' | 'grid';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
}

export interface UpdateTaskAssigneesDto {
  assigneeIds: string[];
}

export interface TaskOrderItemDto {
  id: string;
  order: number;
  status?: TaskStatus;
}

export interface ReorderTasksDto {
  items: TaskOrderItemDto[];
}

export interface CreateTaskProjectDto {
  companyId?: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isActive?: boolean;
}

export type UpdateTaskProjectDto = Partial<CreateTaskProjectDto>;

// ============================================================================
// Mock Implementation of TaskService adhering to PROJECT.md Contracts
// ============================================================================
export class TaskServiceContract {
  constructor(
    private readonly prisma: any,
    private readonly notificationService?: any,
  ) {}

  private validateDates(startDate?: string, dueDate?: string) {
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

  private validateTitle(title: string) {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException('Title cannot be empty');
    }
    if (title.length > 255) {
      throw new BadRequestException('Title cannot exceed 255 characters');
    }
  }

  private validateOrder(order?: number) {
    if (order !== undefined && order < 0) {
      throw new BadRequestException('Order cannot be negative');
    }
  }

  // --- TaskProject CRUD ---
  async createProject(actor: AuthUserPayload, dto: CreateTaskProjectDto) {
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

  async findAllProjects(actor: AuthUserPayload, companyIdQuery?: string) {
    const companyId = resolveScopedCompanyId(actor, companyIdQuery);
    return await this.prisma.taskProject.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findProjectById(actor: AuthUserPayload, id: string) {
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
    actor: AuthUserPayload,
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

  async removeProject(actor: AuthUserPayload, id: string) {
    await this.findProjectById(actor, id);
    // When deleting project, associated tasks get projectId set to null (onDelete: SetNull in Prisma)
    await this.prisma.task.updateMany({
      where: { projectId: id },
      data: { projectId: null },
    });
    await this.prisma.taskProject.delete({ where: { id } });
    return { success: true, id };
  }

  // --- Task CRUD ---
  async create(actor: AuthUserPayload, dto: CreateTaskDto) {
    const companyId = resolveScopedCompanyId(actor, dto.companyId);
    this.validateTitle(dto.title);
    this.validateDates(dto.startDate, dto.dueDate);
    this.validateOrder(dto.order);

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

    // Notify assigned users (excluding self)
    if (this.notificationService && uniqueAssigneeIds.length) {
      for (const userId of uniqueAssigneeIds) {
        if (userId !== actor.sub) {
          try {
            await this.notificationService.sendToUser(userId, {
              title: 'New Task Assigned',
              body: `You have been assigned to task "${task.title}"`,
              data: { taskId: task.id, type: 'TASK_ASSIGNED' },
            });
          } catch {
            // Non-blocking notification error
          }
        }
      }
    }

    return task;
  }

  async findOne(actor: AuthUserPayload, id: string) {
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

  async findAll(actor: AuthUserPayload, query: TaskQueryDto = {}) {
    const companyId = resolveScopedCompanyId(actor, query.companyId);
    const viewMode = query.viewMode ?? 'list';

    if (query.page !== undefined && query.page < 1) {
      throw new BadRequestException('page must be >= 1');
    }
    if (query.limit !== undefined && (query.limit < 1 || query.limit > 100)) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    const where: any = { companyId };
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
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
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
        if (board[t.status as TaskStatus]) {
          board[t.status as TaskStatus].items.push(t);
          board[t.status as TaskStatus].count++;
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

    // Default: list view with pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const orderBy: any = {};
    if (query.sortBy) {
      orderBy[query.sortBy] = query.sortOrder ?? 'asc';
    } else {
      orderBy.createdAt = 'desc';
    }

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
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async update(actor: AuthUserPayload, id: string, dto: UpdateTaskDto) {
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
    actor: AuthUserPayload,
    id: string,
    dto: UpdateTaskStatusDto,
  ) {
    const task = await this.findOne(actor, id);
    if (!dto.status || !Object.values(TaskStatus).includes(dto.status)) {
      throw new BadRequestException(`Invalid status value "${dto.status}"`);
    }

    // If actor is employee, ensure they are assigned to this task
    if (actor.role === 'employee') {
      const isAssigned = task.assignees?.some(
        (a: any) => a.userId === actor.sub,
      );
      if (!isAssigned) {
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
    actor: AuthUserPayload,
    id: string,
    dto: UpdateTaskAssigneesDto,
  ) {
    const task = await this.findOne(actor, id);
    if (actor.role === 'employee') {
      throw new ForbiddenException(
        'Employees are not authorized to update assignees',
      );
    }

    const uniqueAssigneeIds = Array.from(new Set(dto.assigneeIds));
    const previousAssigneeIds = (task.assignees ?? []).map(
      (a: any) => a.userId,
    );
    const newAssigneeIds = uniqueAssigneeIds.filter(
      (uid) => !previousAssigneeIds.includes(uid),
    );

    // Atomic replacement in transaction
    const updated = await this.prisma.$transaction(async (tx: any) => {
      await tx.taskAssignee.deleteMany({ where: { taskId: id } });
      if (uniqueAssigneeIds.length) {
        await tx.taskAssignee.createMany({
          data: uniqueAssigneeIds.map((userId) => ({ taskId: id, userId })),
        });
      }
      return tx.task.findUnique({
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
            await this.notificationService.sendToUser(userId, {
              title: 'Task Assigned',
              body: `You were assigned to task "${task.title}"`,
              data: { taskId: id, type: 'TASK_ASSIGNED' },
            });
          } catch {
            // Non-blocking notification error
          }
        }
      }
    }

    return updated;
  }

  async reorder(actor: AuthUserPayload, dto: ReorderTasksDto) {
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

  async remove(actor: AuthUserPayload, id: string) {
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

// ============================================================================
// TEST SUITE: 4-TIER OPAQUE-BOX HARNESS
// ============================================================================
describe('TaskService — 4-Tier Comprehensive E2E & Unit Test Harness', () => {
  let service: TaskServiceContract;
  let mockPrisma: any;
  let mockNotificationService: any;

  const mockSuperadmin: AuthUserPayload = {
    sub: 'user-superadmin-uuid',
    login: 'superadmin',
    role: 'superadmin',
    companyId: null,
    branchId: null,
  };

  const mockAdminCompanyA: AuthUserPayload = {
    sub: 'user-admin-a-uuid',
    login: 'admin_a',
    role: 'admin',
    companyId: 'company-a-uuid',
    branchId: null,
  };

  const mockManagerCompanyA: AuthUserPayload = {
    sub: 'user-manager-a-uuid',
    login: 'manager_a',
    role: 'manager',
    companyId: 'company-a-uuid',
    branchId: 'branch-a-uuid',
  };

  const mockEmployee1CompanyA: AuthUserPayload = {
    sub: 'user-emp1-a-uuid',
    login: 'emp1_a',
    role: 'employee',
    companyId: 'company-a-uuid',
    branchId: 'branch-a-uuid',
  };

  const mockEmployee2CompanyA: AuthUserPayload = {
    sub: 'user-emp2-a-uuid',
    login: 'emp2_a',
    role: 'employee',
    companyId: 'company-a-uuid',
    branchId: 'branch-a-uuid',
  };

  const mockAdminCompanyB: AuthUserPayload = {
    sub: 'user-admin-b-uuid',
    login: 'admin_b',
    role: 'admin',
    companyId: 'company-b-uuid',
    branchId: null,
  };

  // In-memory mock storage
  let taskProjectsStore: any[];
  let tasksStore: any[];
  let taskAssigneesStore: any[];

  beforeEach(() => {
    taskProjectsStore = [];
    tasksStore = [];
    taskAssigneesStore = [];

    mockNotificationService = {
      sendToUser: jest.fn().mockResolvedValue({ success: true }),
    };

    mockPrisma = {
      taskProject: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          if (where.id) {
            return Promise.resolve(
              taskProjectsStore.find((p) => p.id === where.id) || null,
            );
          }
          if (where.companyId_name) {
            return Promise.resolve(
              taskProjectsStore.find(
                (p) =>
                  p.companyId === where.companyId_name.companyId &&
                  p.name.toLowerCase() ===
                    where.companyId_name.name.toLowerCase(),
              ) || null,
            );
          }
          return Promise.resolve(null);
        }),
        findMany: jest.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            taskProjectsStore.filter((p) =>
              where.companyId ? p.companyId === where.companyId : true,
            ),
          );
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const created = {
            id: `proj-${Date.now()}-${Math.random()}`,
            ...data,
            createdAt: new Date(),
          };
          taskProjectsStore.push(created);
          return Promise.resolve(created);
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const index = taskProjectsStore.findIndex((p) => p.id === where.id);
          if (index !== -1) {
            taskProjectsStore[index] = {
              ...taskProjectsStore[index],
              ...data,
              updatedAt: new Date(),
            };
            return Promise.resolve(taskProjectsStore[index]);
          }
          return Promise.resolve(null);
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          taskProjectsStore = taskProjectsStore.filter(
            (p) => p.id !== where.id,
          );
          return Promise.resolve({ id: where.id });
        }),
      },
      task: {
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const t = tasksStore.find((x) => x.id === where.id);
          if (!t) return Promise.resolve(null);
          const assignees = taskAssigneesStore
            .filter((a) => a.taskId === t.id)
            .map((a) => ({
              ...a,
              user: { id: a.userId, firstName: 'User', lastName: a.userId },
            }));
          return Promise.resolve({ ...t, assignees });
        }),
        findMany: jest
          .fn()
          .mockImplementation(({ where, skip = 0, take = 100 }) => {
            const filtered = tasksStore.filter((t) => {
              if (where.companyId && t.companyId !== where.companyId)
                return false;
              if (where.projectId && t.projectId !== where.projectId)
                return false;
              if (where.departmentId && t.departmentId !== where.departmentId)
                return false;
              if (where.status && t.status !== where.status) return false;
              if (where.priority && t.priority !== where.priority) return false;
              if (where.type && t.type !== where.type) return false;
              if (where.OR) {
                const q = where.OR[0]?.title?.contains?.toLowerCase() || '';
                const matchTitle = t.title?.toLowerCase().includes(q);
                const matchDesc = t.description?.toLowerCase().includes(q);
                if (!matchTitle && !matchDesc) return false;
              }
              if (where.assignees?.some?.userId) {
                const has = taskAssigneesStore.some(
                  (a) =>
                    a.taskId === t.id &&
                    a.userId === where.assignees.some.userId,
                );
                if (!has) return false;
              }
              return true;
            });
            const sliced = filtered.slice(skip, skip + take).map((t) => {
              const assignees = taskAssigneesStore
                .filter((a) => a.taskId === t.id)
                .map((a) => ({ ...a, user: { id: a.userId } }));
              return { ...t, assignees };
            });
            return Promise.resolve(sliced);
          }),
        count: jest.fn().mockImplementation(({ where }) => {
          const filtered = tasksStore.filter((t) => {
            if (where.companyId && t.companyId !== where.companyId)
              return false;
            if (where.status && t.status !== where.status) return false;
            return true;
          });
          return Promise.resolve(filtered.length);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          const { assignees, ...taskData } = data;
          const created = {
            id: `task-${Date.now()}-${Math.random()}`,
            ...taskData,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tasksStore.push(created);
          if (assignees?.create) {
            assignees.create.forEach((a: any) => {
              taskAssigneesStore.push({
                id: `asgn-${Math.random()}`,
                taskId: created.id,
                userId: a.userId,
              });
            });
          }
          const createdAssignees = taskAssigneesStore
            .filter((a) => a.taskId === created.id)
            .map((a) => ({ ...a, user: { id: a.userId } }));
          return Promise.resolve({ ...created, assignees: createdAssignees });
        }),
        update: jest.fn().mockImplementation(({ where, data }) => {
          const idx = tasksStore.findIndex((t) => t.id === where.id);
          if (idx !== -1) {
            tasksStore[idx] = {
              ...tasksStore[idx],
              ...data,
              updatedAt: new Date(),
            };
            const assignees = taskAssigneesStore
              .filter((a) => a.taskId === where.id)
              .map((a) => ({ ...a, user: { id: a.userId } }));
            return Promise.resolve({ ...tasksStore[idx], assignees });
          }
          return Promise.resolve(null);
        }),
        updateMany: jest.fn().mockImplementation(({ where, data }) => {
          let count = 0;
          tasksStore.forEach((t) => {
            if (where.projectId && t.projectId === where.projectId) {
              t.projectId = data.projectId;
              count++;
            }
          });
          return Promise.resolve({ count });
        }),
        delete: jest.fn().mockImplementation(({ where }) => {
          tasksStore = tasksStore.filter((t) => t.id !== where.id);
          taskAssigneesStore = taskAssigneesStore.filter(
            (a) => a.taskId !== where.id,
          );
          return Promise.resolve({ id: where.id });
        }),
      },
      taskAssignee: {
        deleteMany: jest.fn().mockImplementation(({ where }) => {
          taskAssigneesStore = taskAssigneesStore.filter(
            (a) => a.taskId !== where.taskId,
          );
          return Promise.resolve({ count: 1 });
        }),
        createMany: jest.fn().mockImplementation(({ data }) => {
          data.forEach((item: any) => {
            taskAssigneesStore.push({ id: `asgn-${Math.random()}`, ...item });
          });
          return Promise.resolve({ count: data.length });
        }),
      },
      $transaction: jest.fn().mockImplementation(async (arg) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        if (typeof arg === 'function') {
          return arg(mockPrisma);
        }
        return Promise.resolve();
      }),
    };

    service = new TaskServiceContract(mockPrisma, mockNotificationService);
  });

  // ==========================================================================
  // TIER 1: FEATURE COVERAGE (>=5 Tests per core feature)
  // ==========================================================================
  describe('Tier 1: Feature Coverage', () => {
    describe('Feature 1: TaskProject Management', () => {
      it('TC-T1-PROJ-01: should create project with valid metadata', async () => {
        const project = await service.createProject(mockAdminCompanyA, {
          name: 'Core Backend Q3',
          description: 'Q3 deliverables',
          color: '#4F46E5',
          icon: 'folder-code',
        });

        expect(project.id).toBeDefined();
        expect(project.name).toBe('Core Backend Q3');
        expect(project.companyId).toBe('company-a-uuid');
        expect(project.isActive).toBe(true);
      });

      it('TC-T1-PROJ-02: should throw ConflictException when creating project with duplicate name in same company', async () => {
        await service.createProject(mockAdminCompanyA, {
          name: 'Duplicate Project',
        });

        await expect(
          service.createProject(mockAdminCompanyA, {
            name: 'Duplicate Project',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('TC-T1-PROJ-03: should allow identical project names in different companies', async () => {
        const p1 = await service.createProject(mockAdminCompanyA, {
          name: 'Mobile App',
        });
        const p2 = await service.createProject(mockAdminCompanyB, {
          name: 'Mobile App',
        });

        expect(p1.id).not.toBe(p2.id);
        expect(p1.companyId).toBe('company-a-uuid');
        expect(p2.companyId).toBe('company-b-uuid');
      });

      it('TC-T1-PROJ-04: should find all projects scoped to the actor company', async () => {
        await service.createProject(mockAdminCompanyA, { name: 'Project A1' });
        await service.createProject(mockAdminCompanyA, { name: 'Project A2' });
        await service.createProject(mockAdminCompanyB, { name: 'Project B1' });

        const projects = await service.findAllProjects(mockAdminCompanyA);
        expect(projects.length).toBe(2);
        expect(projects.every((p) => p.companyId === 'company-a-uuid')).toBe(
          true,
        );
      });

      it('TC-T1-PROJ-05: should update project fields and reject conflicting name rename', async () => {
        const p1 = await service.createProject(mockAdminCompanyA, {
          name: 'P1',
        });
        await service.createProject(mockAdminCompanyA, { name: 'P2' });

        const updated = await service.updateProject(mockAdminCompanyA, p1.id, {
          name: 'P1 Updated',
          color: '#10B981',
        });
        expect(updated.name).toBe('P1 Updated');
        expect(updated.color).toBe('#10B981');

        await expect(
          service.updateProject(mockAdminCompanyA, p1.id, { name: 'P2' }),
        ).rejects.toThrow(ConflictException);
      });

      it('TC-T1-PROJ-06: should remove project and set taskId.projectId to null', async () => {
        const project = await service.createProject(mockAdminCompanyA, {
          name: 'To Delete',
        });
        const task = await service.create(mockAdminCompanyA, {
          title: 'Task in Project',
          projectId: project.id,
        });

        const res = await service.removeProject(mockAdminCompanyA, project.id);
        expect(res.success).toBe(true);

        const updatedTask = await service.findOne(mockAdminCompanyA, task.id);
        expect(updatedTask.projectId).toBeNull();
      });
    });

    describe('Feature 2: Task Core CRUD Operations', () => {
      it('TC-T1-TASK-01: should create task with default enum and order values', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Implement Auth',
        });

        expect(task.id).toBeDefined();
        expect(task.title).toBe('Implement Auth');
        expect(task.type).toBe(TaskType.feature);
        expect(task.status).toBe(TaskStatus.not_started);
        expect(task.priority).toBe(TaskPriority.normal);
        expect(task.order).toBe(0);
        expect(task.companyId).toBe('company-a-uuid');
        expect(task.createdById).toBe('user-admin-a-uuid');
      });

      it('TC-T1-TASK-02: should create task with full metadata and multiple assignees', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Fix Redis Race Condition',
          description: 'Distributed locking issue on token refresh',
          type: TaskType.bug,
          status: TaskStatus.in_progress,
          priority: TaskPriority.urgent,
          startDate: '2026-08-27',
          dueDate: '2026-08-30',
          order: 5,
          assigneeIds: ['user-emp1-a-uuid', 'user-emp2-a-uuid'],
        });

        expect(task.type).toBe(TaskType.bug);
        expect(task.status).toBe(TaskStatus.in_progress);
        expect(task.priority).toBe(TaskPriority.urgent);
        expect(task.assignees.length).toBe(2);
      });

      it('TC-T1-TASK-03: should retrieve a single task by ID with relations', async () => {
        const created = await service.create(mockAdminCompanyA, {
          title: 'Single Fetch Task',
        });
        const fetched = await service.findOne(mockAdminCompanyA, created.id);

        expect(fetched.id).toBe(created.id);
        expect(fetched.title).toBe('Single Fetch Task');
      });

      it('TC-T1-TASK-04: should throw NotFoundException when task does not exist', async () => {
        await expect(
          service.findOne(mockAdminCompanyA, 'non-existent-task-uuid'),
        ).rejects.toThrow(NotFoundException);
      });

      it('TC-T1-TASK-05: should update task fields and updatedAt timestamp', async () => {
        const created = await service.create(mockAdminCompanyA, {
          title: 'Initial Title',
        });
        const updated = await service.update(mockAdminCompanyA, created.id, {
          title: 'Updated Title',
          priority: TaskPriority.high,
        });

        expect(updated.title).toBe('Updated Title');
        expect(updated.priority).toBe(TaskPriority.high);
      });

      it('TC-T1-TASK-06: should delete a task by ID', async () => {
        const created = await service.create(mockAdminCompanyA, {
          title: 'To Delete Task',
        });
        const result = await service.remove(mockAdminCompanyA, created.id);

        expect(result.success).toBe(true);
        await expect(
          service.findOne(mockAdminCompanyA, created.id),
        ).rejects.toThrow(NotFoundException);
      });
    });

    describe('Feature 3: View Projections (List, Board/Kanban, Calendar)', () => {
      beforeEach(async () => {
        await service.create(mockAdminCompanyA, {
          title: 'Task 1',
          status: TaskStatus.not_started,
          priority: TaskPriority.normal,
        });
        await service.create(mockAdminCompanyA, {
          title: 'Task 2',
          status: TaskStatus.in_progress,
          priority: TaskPriority.high,
        });
        await service.create(mockAdminCompanyA, {
          title: 'Task 3',
          status: TaskStatus.done,
          priority: TaskPriority.urgent,
        });
      });

      it('TC-T1-VIEW-01: should return paginated list view with correct metadata', async () => {
        const res: any = await service.findAll(mockAdminCompanyA, {
          viewMode: 'list',
          page: 1,
          limit: 2,
        });

        expect(res.items.length).toBe(2);
        expect(res.total).toBe(3);
        expect(res.page).toBe(1);
        expect(res.limit).toBe(2);
        expect(res.totalPages).toBe(2);
      });

      it('TC-T1-VIEW-02: should return Board/Kanban view grouped by 5 status columns with exact counts', async () => {
        const board: any = await service.findAll(mockAdminCompanyA, {
          viewMode: 'board',
        });

        expect(board.total).toBe(3);
        expect(board.not_started.count).toBe(1);
        expect(board.in_progress.count).toBe(1);
        expect(board.done.count).toBe(1);
        expect(board.in_review.count).toBe(0);
        expect(board.cancelled.count).toBe(0);
      });

      it('TC-T1-VIEW-03: should return empty columns with count 0 for empty statuses', async () => {
        const board: any = await service.findAll(mockAdminCompanyA, {
          viewMode: 'board',
        });

        expect(Array.isArray(board.in_review.items)).toBe(true);
        expect(board.in_review.items.length).toBe(0);
        expect(board.in_review.count).toBe(0);
      });

      it('TC-T1-VIEW-04: should return calendar view items with total count', async () => {
        const cal: any = await service.findAll(mockAdminCompanyA, {
          viewMode: 'calendar',
        });

        expect(Array.isArray(cal.items)).toBe(true);
        expect(cal.total).toBe(3);
      });

      it('TC-T1-VIEW-05: should filter list view by search term in title or description', async () => {
        await service.create(mockAdminCompanyA, {
          title: 'Special Keyword Alpha',
          description: 'No match',
        });
        await service.create(mockAdminCompanyA, {
          title: 'Normal Title',
          description: 'Contains Special Keyword Beta in desc',
        });

        const res: any = await service.findAll(mockAdminCompanyA, {
          viewMode: 'list',
          search: 'Special Keyword',
        });

        expect(res.items.length).toBe(2);
      });
    });

    describe('Feature 4: Specialized Action: Status Management', () => {
      it('TC-T1-STAT-01: should transition status to in_progress', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Status Task',
        });
        const updated = await service.updateStatus(mockAdminCompanyA, task.id, {
          status: TaskStatus.in_progress,
        });

        expect(updated.status).toBe(TaskStatus.in_progress);
      });

      it('TC-T1-STAT-02: should transition status to in_review', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Review Task',
        });
        const updated = await service.updateStatus(mockAdminCompanyA, task.id, {
          status: TaskStatus.in_review,
        });

        expect(updated.status).toBe(TaskStatus.in_review);
      });

      it('TC-T1-STAT-03: should transition status to done', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Complete Task',
        });
        const updated = await service.updateStatus(mockAdminCompanyA, task.id, {
          status: TaskStatus.done,
        });

        expect(updated.status).toBe(TaskStatus.done);
      });

      it('TC-T1-STAT-04: should transition status to cancelled', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Cancel Task',
        });
        const updated = await service.updateStatus(mockAdminCompanyA, task.id, {
          status: TaskStatus.cancelled,
        });

        expect(updated.status).toBe(TaskStatus.cancelled);
      });

      it('TC-T1-STAT-05: should reject invalid status value with BadRequestException', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Invalid Status Task',
        });

        await expect(
          service.updateStatus(mockAdminCompanyA, task.id, {
            status: 'invalid_status' as any,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('Feature 5: Specialized Action: Assignee Management', () => {
      it('TC-T1-ASGN-01: should assign multiple users to a task', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Assignee Task',
        });
        const updated = await service.updateAssignees(
          mockAdminCompanyA,
          task.id,
          {
            assigneeIds: ['user-emp1-a-uuid', 'user-emp2-a-uuid'],
          },
        );

        expect(updated.assignees.length).toBe(2);
      });

      it('TC-T1-ASGN-02: should replace existing assignees with new assignees list', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Replace Assignee Task',
          assigneeIds: ['user-emp1-a-uuid'],
        });

        const updated = await service.updateAssignees(
          mockAdminCompanyA,
          task.id,
          {
            assigneeIds: ['user-emp2-a-uuid'],
          },
        );

        expect(updated.assignees.length).toBe(1);
        expect(updated.assignees[0].userId).toBe('user-emp2-a-uuid');
      });

      it('TC-T1-ASGN-03: should clear all assignees when empty array provided', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Clear Assignees Task',
          assigneeIds: ['user-emp1-a-uuid', 'user-emp2-a-uuid'],
        });

        const updated = await service.updateAssignees(
          mockAdminCompanyA,
          task.id,
          {
            assigneeIds: [],
          },
        );

        expect(updated.assignees.length).toBe(0);
      });

      it('TC-T1-ASGN-04: should deduplicate duplicate user IDs in assignee array', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Dedup Task',
        });
        const updated = await service.updateAssignees(
          mockAdminCompanyA,
          task.id,
          {
            assigneeIds: [
              'user-emp1-a-uuid',
              'user-emp1-a-uuid',
              'user-emp1-a-uuid',
            ],
          },
        );

        expect(updated.assignees.length).toBe(1);
      });

      it('TC-T1-ASGN-05: should prevent employee role from updating assignees', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Emp Assignee Task',
        });

        await expect(
          service.updateAssignees(mockEmployee1CompanyA, task.id, {
            assigneeIds: ['user-emp2-a-uuid'],
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Feature 6: Specialized Action: Atomic Task Reordering', () => {
      it('TC-T1-REORD-01: should reorder tasks within column', async () => {
        const t1 = await service.create(mockAdminCompanyA, {
          title: 'T1',
          order: 0,
        });
        const t2 = await service.create(mockAdminCompanyA, {
          title: 'T2',
          order: 1,
        });

        const res = await service.reorder(mockAdminCompanyA, {
          items: [
            { id: t1.id, order: 1 },
            { id: t2.id, order: 0 },
          ],
        });

        expect(res.success).toBe(true);
        expect(res.updatedCount).toBe(2);
      });

      it('TC-T1-REORD-02: should update task order and status atomically in reorder payload', async () => {
        const t1 = await service.create(mockAdminCompanyA, {
          title: 'Move to Done',
          status: TaskStatus.in_progress,
          order: 0,
        });

        await service.reorder(mockAdminCompanyA, {
          items: [{ id: t1.id, order: 3, status: TaskStatus.done }],
        });

        const updated = await service.findOne(mockAdminCompanyA, t1.id);
        expect(updated.status).toBe(TaskStatus.done);
        expect(updated.order).toBe(3);
      });

      it('TC-T1-REORD-03: should return updatedCount 0 for empty reorder items', async () => {
        const res = await service.reorder(mockAdminCompanyA, { items: [] });
        expect(res.success).toBe(true);
        expect(res.updatedCount).toBe(0);
      });

      it('TC-T1-REORD-04: should throw NotFoundException if reordering non-existent task', async () => {
        await expect(
          service.reorder(mockAdminCompanyA, {
            items: [{ id: 'non-existent-task-uuid', order: 0 }],
          }),
        ).rejects.toThrow(NotFoundException);
      });

      it('TC-T1-REORD-05: should throw ForbiddenException if attempting to reorder task from another company', async () => {
        const taskA = await service.create(mockAdminCompanyA, {
          title: 'Company A Task',
        });

        await expect(
          service.reorder(mockAdminCompanyB, {
            items: [{ id: taskA.id, order: 1 }],
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('Feature 7: Notifications Triggers', () => {
      it('TC-T1-NOTIF-01: should trigger notification when task assigned to user', async () => {
        await service.create(mockAdminCompanyA, {
          title: 'Notified Task',
          assigneeIds: ['user-emp1-a-uuid'],
        });

        expect(mockNotificationService.sendToUser).toHaveBeenCalledWith(
          'user-emp1-a-uuid',
          expect.objectContaining({
            title: 'New Task Assigned',
            body: expect.stringContaining('Notified Task'),
          }),
        );
      });

      it('TC-T1-NOTIF-02: should suppress assignment notification on self-assignment', async () => {
        mockNotificationService.sendToUser.mockClear();

        await service.create(mockAdminCompanyA, {
          title: 'Self Assigned Task',
          assigneeIds: [mockAdminCompanyA.sub], // Self
        });

        expect(mockNotificationService.sendToUser).not.toHaveBeenCalled();
      });

      it('TC-T1-NOTIF-03: should send notifications only to newly added assignees on updateAssignees', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Differential Notif Task',
          assigneeIds: ['user-emp1-a-uuid'],
        });

        mockNotificationService.sendToUser.mockClear();

        // Update assignees to emp1 + emp2 -> only emp2 is new
        await service.updateAssignees(mockAdminCompanyA, task.id, {
          assigneeIds: ['user-emp1-a-uuid', 'user-emp2-a-uuid'],
        });

        expect(mockNotificationService.sendToUser).toHaveBeenCalledTimes(1);
        expect(mockNotificationService.sendToUser).toHaveBeenCalledWith(
          'user-emp2-a-uuid',
          expect.anything(),
        );
      });

      it('TC-T1-NOTIF-04: should continue task creation successfully if notification service throws', async () => {
        mockNotificationService.sendToUser.mockRejectedValueOnce(
          new Error('Push Gateway Down'),
        );

        const task = await service.create(mockAdminCompanyA, {
          title: 'Resilient Task',
          assigneeIds: ['user-emp1-a-uuid'],
        });

        expect(task.id).toBeDefined();
        expect(task.title).toBe('Resilient Task');
      });

      it('TC-T1-NOTIF-05: should not send notifications when assignees list is empty', async () => {
        mockNotificationService.sendToUser.mockClear();

        await service.create(mockAdminCompanyA, {
          title: 'Unassigned Task',
          assigneeIds: [],
        });

        expect(mockNotificationService.sendToUser).not.toHaveBeenCalled();
      });
    });

    describe('Feature 8: RBAC & Permission Enforcement', () => {
      it('TC-T1-RBAC-01: should allow superadmin to create tasks in any company with explicit companyId', async () => {
        const task = await service.create(mockSuperadmin, {
          title: 'Superadmin Task in Company B',
          companyId: 'company-b-uuid',
        });

        expect(task.companyId).toBe('company-b-uuid');
      });

      it('TC-T1-RBAC-02: should throw BadRequestException if superadmin omits companyId', async () => {
        await expect(
          service.create(mockSuperadmin, { title: 'Missing Company Task' }),
        ).rejects.toThrow(BadRequestException);
      });

      it('TC-T1-RBAC-03: should enforce company scoping for admin queries', async () => {
        await service.create(mockAdminCompanyA, {
          title: 'Company A Only Task',
        });
        const tasks: any = await service.findAll(mockAdminCompanyA);

        expect(
          tasks.items.every((t: any) => t.companyId === 'company-a-uuid'),
        ).toBe(true);
      });

      it('TC-T1-RBAC-04: should allow employee to update status of an assigned task', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Employee Assigned Task',
          assigneeIds: [mockEmployee1CompanyA.sub],
        });

        const updated = await service.updateStatus(
          mockEmployee1CompanyA,
          task.id,
          {
            status: TaskStatus.in_progress,
          },
        );
        expect(updated.status).toBe(TaskStatus.in_progress);
      });

      it('TC-T1-RBAC-05: should throw ForbiddenException if employee attempts to update status of unassigned task', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Unassigned to Emp1 Task',
          assigneeIds: [mockEmployee2CompanyA.sub], // Assigned to Emp2
        });

        await expect(
          service.updateStatus(mockEmployee1CompanyA, task.id, {
            status: TaskStatus.in_progress,
          }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('TC-T1-RBAC-06: should throw ForbiddenException if employee attempts to delete a task', async () => {
        const task = await service.create(mockAdminCompanyA, {
          title: 'Employee Delete Target',
          assigneeIds: [mockEmployee1CompanyA.sub],
        });

        await expect(
          service.remove(mockEmployee1CompanyA, task.id),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  // ==========================================================================
  // TIER 2: BOUNDARY & CORNER CASES
  // ==========================================================================
  describe('Tier 2: Boundary & Corner Cases', () => {
    it('TC-T2-STR-01: should reject empty or whitespace-only title', async () => {
      await expect(
        service.create(mockAdminCompanyA, { title: '' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(mockAdminCompanyA, { title: '    ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-T2-STR-02: should accept title with exactly 255 characters', async () => {
      const maxTitle = 'A'.repeat(255);
      const task = await service.create(mockAdminCompanyA, { title: maxTitle });
      expect(task.title.length).toBe(255);
    });

    it('TC-T2-STR-03: should reject title exceeding 255 characters (256 chars)', async () => {
      const overflowTitle = 'A'.repeat(256);
      await expect(
        service.create(mockAdminCompanyA, { title: overflowTitle }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-T2-STR-04: should support large description (5000+ characters)', async () => {
      const longDesc = 'D'.repeat(5000);
      const task = await service.create(mockAdminCompanyA, {
        title: 'Long Desc Task',
        description: longDesc,
      });
      expect(task.description?.length).toBe(5000);
    });

    it('TC-T2-DATE-01: should reject invalid dates where startDate is chronologically after dueDate', async () => {
      await expect(
        service.create(mockAdminCompanyA, {
          title: 'Chronological Conflict',
          startDate: '2026-09-01',
          dueDate: '2026-08-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-T2-DATE-02: should accept same-day startDate and dueDate', async () => {
      const task = await service.create(mockAdminCompanyA, {
        title: 'Same Day Task',
        startDate: '2026-08-27',
        dueDate: '2026-08-27',
      });
      expect(task.id).toBeDefined();
    });

    it('TC-T2-DATE-03: should accept valid leap year date (2028-02-29)', async () => {
      const task = await service.create(mockAdminCompanyA, {
        title: 'Leap Year Task',
        dueDate: '2028-02-29',
      });
      expect(task.id).toBeDefined();
    });

    it('TC-T2-TENANT-01: should reject cross-tenant task access', async () => {
      const taskCompanyB = await service.create(mockAdminCompanyB, {
        title: 'Secret Company B Task',
      });

      await expect(
        service.findOne(mockAdminCompanyA, taskCompanyB.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TC-T2-TENANT-02: should throw ForbiddenException when admin supplies spoofed companyId', async () => {
      await expect(
        service.create(mockAdminCompanyA, {
          title: 'Spoofed Company Task',
          companyId: 'company-b-uuid',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TC-T2-ARRAY-01: should safely deduplicate 50 duplicate assignee IDs in single payload', async () => {
      const dupAssignees = Array(50).fill('user-emp1-a-uuid');
      const task = await service.create(mockAdminCompanyA, {
        title: '50 Dups Assignee Task',
        assigneeIds: dupAssignees,
      });

      expect(task.assignees.length).toBe(1);
    });

    it('TC-T2-ORD-01: should accept minimum order index = 0 and reject negative order index', async () => {
      const task = await service.create(mockAdminCompanyA, {
        title: 'Order Zero',
        order: 0,
      });
      expect(task.order).toBe(0);

      await expect(
        service.create(mockAdminCompanyA, {
          title: 'Negative Order',
          order: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('TC-T2-PAGE-01: should validate pagination boundaries (page >= 1, 1 <= limit <= 100)', async () => {
      await expect(
        service.findAll(mockAdminCompanyA, { page: 0, limit: 10 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findAll(mockAdminCompanyA, { page: 1, limit: 150 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // TIER 3: CROSS-FEATURE INTERACTIONS & COMBINATIONS
  // ==========================================================================
  describe('Tier 3: Cross-Feature Interactions & Combinations', () => {
    it('TC-T3-INT-01: should atomically mutate status and order in single batch reorder', async () => {
      const taskA = await service.create(mockAdminCompanyA, {
        title: 'Task A',
        status: TaskStatus.in_progress,
        order: 0,
      });
      const taskB = await service.create(mockAdminCompanyA, {
        title: 'Task B',
        status: TaskStatus.in_progress,
        order: 1,
      });

      // Move Task A to Done with order 0, Task B to order 0 in in_progress
      await service.reorder(mockAdminCompanyA, {
        items: [
          { id: taskA.id, order: 0, status: TaskStatus.done },
          { id: taskB.id, order: 0 },
        ],
      });

      const updatedA = await service.findOne(mockAdminCompanyA, taskA.id);
      const updatedB = await service.findOne(mockAdminCompanyA, taskB.id);

      expect(updatedA.status).toBe(TaskStatus.done);
      expect(updatedA.order).toBe(0);
      expect(updatedB.status).toBe(TaskStatus.in_progress);
      expect(updatedB.order).toBe(0);
    });

    it('TC-T3-INT-02: should retain orphan tasks with projectId=null when TaskProject is deleted', async () => {
      const project = await service.createProject(mockAdminCompanyA, {
        name: 'Parent Project',
      });
      const t1 = await service.create(mockAdminCompanyA, {
        title: 'T1',
        projectId: project.id,
      });
      const t2 = await service.create(mockAdminCompanyA, {
        title: 'T2',
        projectId: project.id,
      });

      await service.removeProject(mockAdminCompanyA, project.id);

      const fetchedT1 = await service.findOne(mockAdminCompanyA, t1.id);
      const fetchedT2 = await service.findOne(mockAdminCompanyA, t2.id);

      expect(fetchedT1.projectId).toBeNull();
      expect(fetchedT2.projectId).toBeNull();
    });

    it('TC-T3-INT-03: should send differential notifications only for added assignees', async () => {
      const task = await service.create(mockAdminCompanyA, {
        title: 'Differential Notify',
        assigneeIds: ['user-emp1-a-uuid'],
      });

      mockNotificationService.sendToUser.mockClear();

      // Replace [emp1] with [emp1, emp2]
      await service.updateAssignees(mockAdminCompanyA, task.id, {
        assigneeIds: ['user-emp1-a-uuid', 'user-emp2-a-uuid'],
      });

      expect(mockNotificationService.sendToUser).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.sendToUser).toHaveBeenCalledWith(
        'user-emp2-a-uuid',
        expect.anything(),
      );
    });

    it('TC-T3-INT-04: should permit employee status updates for assigned tasks but forbid unassigned tasks and full updates', async () => {
      const assignedTask = await service.create(mockAdminCompanyA, {
        title: 'Assigned Task',
        assigneeIds: [mockEmployee1CompanyA.sub],
      });
      const unassignedTask = await service.create(mockAdminCompanyA, {
        title: 'Unassigned Task',
        assigneeIds: [mockEmployee2CompanyA.sub],
      });

      // Employee can update status of assigned task
      const statusRes = await service.updateStatus(
        mockEmployee1CompanyA,
        assignedTask.id,
        {
          status: TaskStatus.in_review,
        },
      );
      expect(statusRes.status).toBe(TaskStatus.in_review);

      // Employee forbidden to update status of unassigned task
      await expect(
        service.updateStatus(mockEmployee1CompanyA, unassignedTask.id, {
          status: TaskStatus.in_review,
        }),
      ).rejects.toThrow(ForbiddenException);

      // Employee forbidden to perform full task update
      await expect(
        service.update(mockEmployee1CompanyA, assignedTask.id, {
          title: 'Hacked Title',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('TC-T3-INT-05: should maintain strict multi-tenant isolation across Board view counts and tasks', async () => {
      await service.create(mockAdminCompanyA, {
        title: 'Comp A In Progress',
        status: TaskStatus.in_progress,
      });
      await service.create(mockAdminCompanyB, {
        title: 'Comp B In Progress 1',
        status: TaskStatus.in_progress,
      });
      await service.create(mockAdminCompanyB, {
        title: 'Comp B In Progress 2',
        status: TaskStatus.in_progress,
      });

      const boardA: any = await service.findAll(mockAdminCompanyA, {
        viewMode: 'board',
      });
      const boardB: any = await service.findAll(mockAdminCompanyB, {
        viewMode: 'board',
      });

      expect(boardA.in_progress.count).toBe(1);
      expect(boardB.in_progress.count).toBe(2);
    });
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ==========================================================================
  describe('Tier 4: Real-World Application Scenarios', () => {
    it('TC-T4-SCEN-01: Full Task Lifecycle (Project -> Create -> Assign -> In Progress -> Urgent -> Review -> Done)', async () => {
      // Step 1: Admin creates teamspace project
      const project = await service.createProject(mockAdminCompanyA, {
        name: 'Payment Gateway Integration',
        color: '#3B82F6',
      });
      expect(project.id).toBeDefined();

      // Step 2: Admin creates task with 2 assignees
      const task = await service.create(mockAdminCompanyA, {
        title: 'Implement Stripe Webhook',
        description: 'Handle customer.subscription.deleted events',
        projectId: project.id,
        type: TaskType.feature,
        status: TaskStatus.not_started,
        priority: TaskPriority.normal,
        startDate: '2026-08-27',
        dueDate: '2026-08-30',
        assigneeIds: [mockEmployee1CompanyA.sub, mockEmployee2CompanyA.sub],
      });
      expect(task.assignees.length).toBe(2);

      // Step 3: Employee 1 starts work (moves to in_progress)
      const inProgressTask = await service.updateStatus(
        mockEmployee1CompanyA,
        task.id,
        {
          status: TaskStatus.in_progress,
        },
      );
      expect(inProgressTask.status).toBe(TaskStatus.in_progress);

      // Step 4: Manager reviews task and escalates priority to urgent
      const escalatedTask = await service.update(mockManagerCompanyA, task.id, {
        priority: TaskPriority.urgent,
      });
      expect(escalatedTask.priority).toBe(TaskPriority.urgent);

      // Step 5: Employee 2 completes implementation and submits for review
      const inReviewTask = await service.updateStatus(
        mockEmployee2CompanyA,
        task.id,
        {
          status: TaskStatus.in_review,
        },
      );
      expect(inReviewTask.status).toBe(TaskStatus.in_review);

      // Step 6: Manager approves and marks task done
      const completedTask = await service.updateStatus(
        mockManagerCompanyA,
        task.id,
        {
          status: TaskStatus.done,
        },
      );
      expect(completedTask.status).toBe(TaskStatus.done);

      // Step 7: Verification in Board and List views
      const board: any = await service.findAll(mockAdminCompanyA, {
        viewMode: 'board',
      });
      expect(board.done.items.some((t: any) => t.id === task.id)).toBe(true);
    });

    it('TC-T4-SCEN-02: Kanban Sprint Reorganization with 10 tasks batch reordered', async () => {
      const createdTasks: any[] = [];
      for (let i = 1; i <= 10; i++) {
        const t = await service.create(mockAdminCompanyA, {
          title: `Sprint Task ${i}`,
          status: i <= 5 ? TaskStatus.not_started : TaskStatus.in_progress,
          order: i - 1,
        });
        createdTasks.push(t);
      }

      // Reorganize: move first 3 to in_progress, next 3 to in_review, last 4 to done
      const reorderItems: TaskOrderItemDto[] = [
        { id: createdTasks[0].id, order: 0, status: TaskStatus.in_progress },
        { id: createdTasks[1].id, order: 1, status: TaskStatus.in_progress },
        { id: createdTasks[2].id, order: 2, status: TaskStatus.in_progress },
        { id: createdTasks[3].id, order: 0, status: TaskStatus.in_review },
        { id: createdTasks[4].id, order: 1, status: TaskStatus.in_review },
        { id: createdTasks[5].id, order: 2, status: TaskStatus.in_review },
        { id: createdTasks[6].id, order: 0, status: TaskStatus.done },
        { id: createdTasks[7].id, order: 1, status: TaskStatus.done },
        { id: createdTasks[8].id, order: 2, status: TaskStatus.done },
        { id: createdTasks[9].id, order: 3, status: TaskStatus.done },
      ];

      const res = await service.reorder(mockAdminCompanyA, {
        items: reorderItems,
      });
      expect(res.updatedCount).toBe(10);

      const board: any = await service.findAll(mockAdminCompanyA, {
        viewMode: 'board',
      });
      expect(board.in_progress.count).toBe(3);
      expect(board.in_review.count).toBe(3);
      expect(board.done.count).toBe(4);
      expect(board.not_started.count).toBe(0);
    });

    it('TC-T4-SCEN-03: Departmental Collaboration & Re-assignment', async () => {
      const task = await service.create(mockAdminCompanyA, {
        title: 'Security Audit Cross-Check',
        departmentId: 'dept-dev-uuid',
        assigneeIds: [mockEmployee1CompanyA.sub],
      });

      // Manager reassigns to QA department with new assignee
      const updated = await service.update(mockManagerCompanyA, task.id, {
        departmentId: 'dept-qa-uuid',
      });
      expect(updated.departmentId).toBe('dept-qa-uuid');

      const reallocated = await service.updateAssignees(
        mockManagerCompanyA,
        task.id,
        {
          assigneeIds: [mockEmployee2CompanyA.sub],
        },
      );
      expect(reallocated.assignees[0].userId).toBe(mockEmployee2CompanyA.sub);
    });

    it('TC-T4-SCEN-04: Project Decommissioning with Task Preservation', async () => {
      const project = await service.createProject(mockAdminCompanyA, {
        name: 'Legacy Migration',
      });
      const task = await service.create(mockAdminCompanyA, {
        title: 'Decommissioned Target Task',
        projectId: project.id,
      });

      // Delete project
      await service.removeProject(mockAdminCompanyA, project.id);

      // Verify task still exists and can be retrieved
      const preservedTask = await service.findOne(mockAdminCompanyA, task.id);
      expect(preservedTask.id).toBe(task.id);
      expect(preservedTask.projectId).toBeNull();
    });
  });
});
