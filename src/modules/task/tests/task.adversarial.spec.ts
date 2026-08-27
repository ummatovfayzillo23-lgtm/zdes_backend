/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { AccessTokenPayload } from '../../auth/interfaces/access-token-payload.interface';
import {
  CreateTaskDto,
  CreateTaskProjectDto,
  ReorderTasksDto,
  TaskOrderItemDto,
  TaskQueryDto,
  UpdateTaskAssigneesDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
} from '../dto';
import { TaskService } from '../task.service';

describe('Adversarial & Stress Test Suite: Task Management Module', () => {
  let service: TaskService;
  let mockPrisma: any;
  let mockNotificationService: any;

  // Actors
  const company1 = 'company-uuid-1111';
  const company2 = 'company-uuid-2222';

  const actorSuperAdmin: AccessTokenPayload = {
    sub: 'user-superadmin-uuid',
    login: 'superadmin',
    role: 'superadmin',
    companyId: null,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorAdminC1: AccessTokenPayload = {
    sub: 'user-admin-c1-uuid',
    login: 'admin_c1',
    role: 'admin',
    companyId: company1,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorAdminC2: AccessTokenPayload = {
    sub: 'user-admin-c2-uuid',
    login: 'admin_c2',
    role: 'admin',
    companyId: company2,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorManagerC1: AccessTokenPayload = {
    sub: 'user-manager-c1-uuid',
    login: 'manager_c1',
    role: 'manager',
    companyId: company1,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorEmpAssignedC1: AccessTokenPayload = {
    sub: 'user-emp-assigned-uuid',
    login: 'emp_assigned',
    role: 'employee',
    companyId: company1,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorEmpUnassignedC1: AccessTokenPayload = {
    sub: 'user-emp-unassigned-uuid',
    login: 'emp_unassigned',
    role: 'employee',
    companyId: company1,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorEmpC2: AccessTokenPayload = {
    sub: 'user-emp-c2-uuid',
    login: 'emp_c2',
    role: 'employee',
    companyId: company2,
    branchId: null,
    faceDeviceUserId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      task: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        updateMany: jest.fn(),
      },
      taskProject: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      department: {
        findUnique: jest.fn(),
      },
      taskAssignee: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((input) => {
        if (Array.isArray(input)) {
          return Promise.all(input);
        }
        if (typeof input === 'function') {
          return input(mockPrisma);
        }
        return Promise.resolve(input);
      }),
    };

    mockNotificationService = {
      notifyUser: jest.fn().mockResolvedValue(undefined),
    };

    service = new TaskService(mockPrisma, mockNotificationService);
  });

  // ==========================================================================
  // 1. Cross-Tenant Isolation Attacks
  // ==========================================================================
  describe('1. Cross-Tenant Isolation Attacks', () => {
    it('ADV-TENANT-01: Admin from Company 1 cannot read task of Company 2 (assertWithinScope)', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-c2-uuid',
        companyId: company2,
        title: 'Confidential Task C2',
      });

      await expect(
        service.findOne(actorAdminC1, 'task-c2-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-TENANT-02: Admin from Company 1 cannot update task of Company 2', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-c2-uuid',
        companyId: company2,
        title: 'Confidential Task C2',
      });

      await expect(
        service.update(actorAdminC1, 'task-c2-uuid', {
          title: 'Hacked Title',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-TENANT-03: Admin from Company 1 cannot delete task of Company 2', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-c2-uuid',
        companyId: company2,
        title: 'Confidential Task C2',
      });

      await expect(
        service.remove(actorAdminC1, 'task-c2-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-TENANT-04: Admin cannot link task to Project belonging to another company', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'proj-c2-uuid',
        companyId: company2,
      });

      await expect(
        service.create(actorAdminC1, {
          title: 'Task linking cross-company project',
          projectId: 'proj-c2-uuid',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-TENANT-05: Admin cannot link task to Department belonging to another company', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-c2-uuid',
        companyId: company2,
      });

      await expect(
        service.create(actorAdminC1, {
          title: 'Task linking cross-company department',
          departmentId: 'dept-c2-uuid',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-TENANT-06: Superadmin creating task without explicit companyId throws BadRequestException', async () => {
      await expect(
        service.create(actorSuperAdmin, {
          title: 'Superadmin Task without Company',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-TENANT-07: Admin attempting company spoofing is blocked with ForbiddenException', async () => {
      await expect(
        service.create(actorAdminC1, {
          title: 'Spoof attempt',
          companyId: company2, // Spoofed companyId in DTO
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 2. Duplicate Assignees & Assignee Mutation Edge Cases
  // ==========================================================================
  describe('2. Duplicate Assignees & Batch Mutation', () => {
    it('ADV-ASGN-01: Duplicate user IDs in assigneeIds on creation are deduplicated into unique entries', async () => {
      const dupUser1 = 'user-uuid-1111';
      const dupUser2 = 'user-uuid-2222';

      mockPrisma.task.create.mockResolvedValue({
        id: 'task-dup-uuid',
        title: 'Task with duplicate assignees',
        companyId: company1,
      });

      await service.create(actorAdminC1, {
        title: 'Task with duplicate assignees',
        assigneeIds: [dupUser1, dupUser1, dupUser2, dupUser1, dupUser2],
      });

      expect(mockPrisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignees: {
              create: [{ userId: dupUser1 }, { userId: dupUser2 }],
            },
          }),
        }),
      );
    });

    it('ADV-ASGN-02: Self-assignment does NOT trigger redundant self notification', async () => {
      mockPrisma.task.create.mockResolvedValue({
        id: 'task-self-uuid',
        title: 'Self assigned task',
        companyId: company1,
      });

      await service.create(actorAdminC1, {
        title: 'Self assigned task',
        assigneeIds: [actorAdminC1.sub, 'other-user-uuid'],
      });

      // Notify should only be called for 'other-user-uuid', NOT for actorAdminC1.sub
      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.notifyUser).toHaveBeenCalledWith(
        'other-user-uuid',
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });

    it('ADV-ASGN-03: Updating assignees sends notifications ONLY to newly added assignees', async () => {
      const existingUser = 'user-existing-uuid';
      const newUser = 'user-new-uuid';

      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-asgn-uuid',
        companyId: company1,
        title: 'Task with existing assignees',
        assignees: [{ userId: existingUser }],
      });

      mockPrisma.task.findUniqueOrThrow.mockResolvedValue({
        id: 'task-asgn-uuid',
        companyId: company1,
        title: 'Task with existing assignees',
        assignees: [{ userId: existingUser }, { userId: newUser }],
      });

      await service.updateAssignees(actorAdminC1, 'task-asgn-uuid', {
        assigneeIds: [existingUser, newUser, newUser], // With duplicate
      });

      expect(mockPrisma.taskAssignee.deleteMany).toHaveBeenCalledWith({
        where: { taskId: 'task-asgn-uuid' },
      });
      expect(mockPrisma.taskAssignee.createMany).toHaveBeenCalledWith({
        data: [
          { taskId: 'task-asgn-uuid', userId: existingUser },
          { taskId: 'task-asgn-uuid', userId: newUser },
        ],
      });

      // Only newUser gets notified
      expect(mockNotificationService.notifyUser).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.notifyUser).toHaveBeenCalledWith(
        newUser,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Object),
      );
    });

    it('ADV-ASGN-04: Clearing assignees with empty array succeeds cleanly', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-clear-uuid',
        companyId: company1,
        title: 'Task clear assignees',
        assignees: [{ userId: 'user-1' }],
      });
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue({
        id: 'task-clear-uuid',
        companyId: company1,
        title: 'Task clear assignees',
        assignees: [],
      });

      const res = await service.updateAssignees(
        actorAdminC1,
        'task-clear-uuid',
        {
          assigneeIds: [],
        },
      );

      expect(mockPrisma.taskAssignee.deleteMany).toHaveBeenCalledWith({
        where: { taskId: 'task-clear-uuid' },
      });
      expect(mockPrisma.taskAssignee.createMany).not.toHaveBeenCalled();
      expect(mockNotificationService.notifyUser).not.toHaveBeenCalled();
      expect(res.assignees).toEqual([]);
    });

    it('ADV-ASGN-05: Notification delivery failure does NOT crash task creation (resilience)', async () => {
      mockNotificationService.notifyUser.mockRejectedValueOnce(
        new Error('Push service network timeout'),
      );
      mockPrisma.task.create.mockResolvedValue({
        id: 'task-resilience-uuid',
        title: 'Resilient Task',
        companyId: company1,
      });

      const res = await service.create(actorAdminC1, {
        title: 'Resilient Task',
        assigneeIds: ['some-user-uuid'],
      });

      expect(res.id).toBe('task-resilience-uuid');
    });
  });

  // ==========================================================================
  // 3. Date Boundaries & Temporal Validation
  // ==========================================================================
  describe('3. Date Boundaries & Temporal Validation', () => {
    it('ADV-DATE-01: startDate chronologically after dueDate throws BadRequestException on create', async () => {
      await expect(
        service.create(actorAdminC1, {
          title: 'Invalid Date Task',
          startDate: '2026-09-01T00:00:00.000Z',
          dueDate: '2026-08-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DATE-02: Invalid date strings throw BadRequestException on create', async () => {
      await expect(
        service.create(actorAdminC1, {
          title: 'Malformed Start Date',
          startDate: 'not-a-date',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(actorAdminC1, {
          title: 'Malformed Due Date',
          dueDate: 'garbage-value',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DATE-03: Updating startDate later than existing dueDate throws BadRequestException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-date-uuid',
        companyId: company1,
        title: 'Date Task',
        startDate: new Date('2026-08-01T00:00:00.000Z'),
        dueDate: new Date('2026-08-15T00:00:00.000Z'),
      });

      await expect(
        service.update(actorAdminC1, 'task-date-uuid', {
          startDate: '2026-08-20T00:00:00.000Z', // Later than existing dueDate Aug 15
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DATE-04: Updating dueDate earlier than existing startDate throws BadRequestException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-date-uuid',
        companyId: company1,
        title: 'Date Task',
        startDate: new Date('2026-08-10T00:00:00.000Z'),
        dueDate: new Date('2026-08-25T00:00:00.000Z'),
      });

      await expect(
        service.update(actorAdminC1, 'task-date-uuid', {
          dueDate: '2026-08-05T00:00:00.000Z', // Earlier than existing startDate Aug 10
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DATE-05: Same day start and due date succeeds', async () => {
      mockPrisma.task.create.mockResolvedValue({
        id: 'task-sameday-uuid',
        title: 'Same Day Task',
        companyId: company1,
        startDate: new Date('2026-08-27T00:00:00.000Z'),
        dueDate: new Date('2026-08-27T23:59:59.000Z'),
      });

      const res = await service.create(actorAdminC1, {
        title: 'Same Day Task',
        startDate: '2026-08-27T00:00:00.000Z',
        dueDate: '2026-08-27T23:59:59.000Z',
      });

      expect(res.id).toBe('task-sameday-uuid');
    });
  });

  // ==========================================================================
  // 4. Pagination Extremes & Query Filtering
  // ==========================================================================
  describe('4. Pagination Extremes & Query Filtering', () => {
    it('ADV-PAGE-01: page < 1 throws BadRequestException', async () => {
      await expect(
        service.findAll(actorAdminC1, { page: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findAll(actorAdminC1, { page: -10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-PAGE-02: limit < 1 or limit > 100 throws BadRequestException', async () => {
      await expect(
        service.findAll(actorAdminC1, { limit: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.findAll(actorAdminC1, { limit: 101 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-PAGE-03: Beyond total page returns empty items array with valid pagination metadata', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.count.mockResolvedValue(15);

      const res = (await service.findAll(actorAdminC1, {
        page: 50,
        limit: 10,
      })) as any;

      expect(res.items).toEqual([]);
      expect(res.total).toBe(15);
      expect(res.page).toBe(50);
      expect(res.limit).toBe(10);
      expect(res.totalPages).toBe(2);
    });

    it('ADV-PAGE-04: Board view returns all 5 status buckets even when zero tasks exist', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);

      const res = (await service.findAll(actorAdminC1, {
        viewMode: 'board',
      })) as any;

      expect(res.not_started).toEqual({ count: 0, items: [] });
      expect(res.in_progress).toEqual({ count: 0, items: [] });
      expect(res.in_review).toEqual({ count: 0, items: [] });
      expect(res.done).toEqual({ count: 0, items: [] });
      expect(res.cancelled).toEqual({ count: 0, items: [] });
      expect(res.total).toBe(0);
    });
  });

  // ==========================================================================
  // 5. Large Reorder Payloads & Reorder Edge Cases
  // ==========================================================================
  describe('5. Large Reorder Payloads & Reorder Corner Cases', () => {
    it('ADV-REORD-01: Empty items array returns success with 0 updatedCount without querying DB', async () => {
      const res = await service.reorder(actorAdminC1, { items: [] });
      expect(res).toEqual({ success: true, updatedCount: 0 });
      expect(mockPrisma.task.findUnique).not.toHaveBeenCalled();
    });

    it('ADV-REORD-02: Large reorder payload (100 items) validates company isolation and executes atomic transaction', async () => {
      const items = Array.from({ length: 100 }, (_, i) => ({
        id: `a0eebc99-9c0b-4ef8-bb6d-6bb9bd3800${String(i).padStart(2, '0')}`,
        order: i,
        status: i % 2 === 0 ? TaskStatus.in_progress : TaskStatus.done,
      }));

      mockPrisma.task.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({
          id: where.id,
          companyId: company1,
          title: `Task ${where.id}`,
        }),
      );
      mockPrisma.task.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 'updated', ...data }),
      );

      const res = await service.reorder(actorAdminC1, { items });

      expect(res.success).toBe(true);
      expect(res.updatedCount).toBe(100);
      expect(mockPrisma.task.findUnique).toHaveBeenCalledTimes(100);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('ADV-REORD-03: Reorder payload with one non-existent task throws NotFoundException and aborts transaction', async () => {
      const items = [
        { id: 'valid-task-uuid', order: 0 },
        { id: 'non-existent-uuid', order: 1 },
      ];

      mockPrisma.task.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'valid-task-uuid') {
          return Promise.resolve({ id: 'valid-task-uuid', companyId: company1 });
        }
        return Promise.resolve(null);
      });

      await expect(service.reorder(actorAdminC1, { items })).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });

    it('ADV-REORD-04: Reorder payload containing task from another company throws ForbiddenException', async () => {
      const items = [
        { id: 'task-c1-uuid', order: 0 },
        { id: 'task-c2-uuid', order: 1 },
      ];

      mockPrisma.task.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'task-c1-uuid') {
          return Promise.resolve({ id: 'task-c1-uuid', companyId: company1 });
        }
        return Promise.resolve({ id: 'task-c2-uuid', companyId: company2 });
      });

      await expect(service.reorder(actorAdminC1, { items })).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.task.update).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 6. Role-Based Permissions & Scoped Employee Access
  // ==========================================================================
  describe('6. RBAC & Employee Restrictions', () => {
    it('ADV-RBAC-01: Assigned Employee can update status of their task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-emp-uuid',
        companyId: company1,
        title: 'Employee Task',
        assignees: [{ userId: actorEmpAssignedC1.sub }],
      });
      mockPrisma.task.update.mockResolvedValue({
        id: 'task-emp-uuid',
        status: TaskStatus.in_progress,
      });

      const res = await service.updateStatus(
        actorEmpAssignedC1,
        'task-emp-uuid',
        {
          status: TaskStatus.in_progress,
        },
      );

      expect(res.status).toBe(TaskStatus.in_progress);
    });

    it('ADV-RBAC-02: Task Creator Employee can update status even if not in assignees', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-created-uuid',
        companyId: company1,
        createdById: actorEmpUnassignedC1.sub,
        assignees: [],
      });
      mockPrisma.task.update.mockResolvedValue({
        id: 'task-created-uuid',
        status: TaskStatus.done,
      });

      const res = await service.updateStatus(
        actorEmpUnassignedC1,
        'task-created-uuid',
        {
          status: TaskStatus.done,
        },
      );

      expect(res.status).toBe(TaskStatus.done);
    });

    it('ADV-RBAC-03: Unassigned Employee attempting to update status throws ForbiddenException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-emp-uuid',
        companyId: company1,
        createdById: 'someone-else-uuid',
        assignees: [{ userId: 'another-emp-uuid' }],
      });

      await expect(
        service.updateStatus(actorEmpUnassignedC1, 'task-emp-uuid', {
          status: TaskStatus.done,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-RBAC-04: Employee attempting full task update throws ForbiddenException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-emp-uuid',
        companyId: company1,
        title: 'Task Title',
      });

      await expect(
        service.update(actorEmpAssignedC1, 'task-emp-uuid', {
          title: 'Employee attempting full update',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-RBAC-05: Employee attempting to update assignees throws ForbiddenException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-emp-uuid',
        companyId: company1,
      });

      await expect(
        service.updateAssignees(actorEmpAssignedC1, 'task-emp-uuid', {
          assigneeIds: ['new-user-uuid'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ADV-RBAC-06: Employee attempting to delete task throws ForbiddenException', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-emp-uuid',
        companyId: company1,
      });

      await expect(
        service.remove(actorEmpAssignedC1, 'task-emp-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==========================================================================
  // 7. Project Deletion & Task Retention (SetNull)
  // ==========================================================================
  describe('7. Project Deletion & Task Retention', () => {
    it('ADV-PROJ-01: Removing project sets task.projectId to null before deleting project', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'proj-del-uuid',
        companyId: company1,
        name: 'Project to Delete',
      });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.taskProject.delete.mockResolvedValue({ id: 'proj-del-uuid' });

      const res = await service.removeProject(actorAdminC1, 'proj-del-uuid');

      expect(res).toEqual({ success: true, id: 'proj-del-uuid' });
      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-del-uuid' },
        data: { projectId: null },
      });
      expect(mockPrisma.taskProject.delete).toHaveBeenCalledWith({
        where: { id: 'proj-del-uuid' },
      });
    });

    it('ADV-PROJ-02: Creating project with duplicate name in same company throws ConflictException', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'existing-proj-uuid',
        companyId: company1,
        name: 'Sprint Alpha',
      });

      await expect(
        service.createProject(actorAdminC1, { name: 'Sprint Alpha' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================================
  // 8. DTO Validation Constraints & Service Enforcement
  // ==========================================================================
  describe('8. DTO Validation Constraints & Service Enforcement', () => {
    it('ADV-DTO-01: Empty string title fails DTO validation and whitespace-only title throws BadRequestException in Service', async () => {
      const emptyDto = plainToInstance(CreateTaskDto, { title: '' });
      const errors = await validate(emptyDto);
      expect(errors.length).toBeGreaterThan(0);

      await expect(
        service.create(actorAdminC1, { title: '    ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DTO-02: CreateTaskDto title exceeding 255 characters fails validation', async () => {
      const dto = plainToInstance(CreateTaskDto, { title: 'A'.repeat(256) });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      await expect(
        service.create(actorAdminC1, { title: 'A'.repeat(256) }),
      ).rejects.toThrow(BadRequestException);
    });

    it('ADV-DTO-03: ReorderTasksDto items must contain valid UUIDs and non-negative orders', async () => {
      const validDto = plainToInstance(ReorderTasksDto, {
        items: [
          {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            order: 0,
            status: TaskStatus.in_progress,
          },
        ],
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);

      const invalidUuidDto = plainToInstance(ReorderTasksDto, {
        items: [{ id: 'not-a-uuid', order: 0 }],
      });
      const invalidUuidErrors = await validate(invalidUuidDto);
      expect(invalidUuidErrors.length).toBeGreaterThan(0);

      const negativeOrderDto = plainToInstance(ReorderTasksDto, {
        items: [
          { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', order: -1 },
        ],
      });
      const negativeErrors = await validate(negativeOrderDto);
      expect(negativeErrors.length).toBeGreaterThan(0);
    });

    it('ADV-DTO-04: UpdateTaskAssigneesDto requires valid UUID array', async () => {
      const validDto = plainToInstance(UpdateTaskAssigneesDto, {
        assigneeIds: ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'],
      });
      const validErrors = await validate(validDto);
      expect(validErrors.length).toBe(0);

      const invalidDto = plainToInstance(UpdateTaskAssigneesDto, {
        assigneeIds: ['invalid-id'],
      });
      const invalidErrors = await validate(invalidDto);
      expect(invalidErrors.length).toBeGreaterThan(0);
    });

    it('ADV-DTO-05: TaskQueryDto limits and pagination validation', async () => {
      const invalidPageDto = plainToInstance(TaskQueryDto, { page: 0 });
      const pageErrors = await validate(invalidPageDto);
      expect(pageErrors.length).toBeGreaterThan(0);

      const invalidLimitDto = plainToInstance(TaskQueryDto, { limit: 150 });
      const limitErrors = await validate(invalidLimitDto);
      expect(limitErrors.length).toBeGreaterThan(0);
    });
  });
});
