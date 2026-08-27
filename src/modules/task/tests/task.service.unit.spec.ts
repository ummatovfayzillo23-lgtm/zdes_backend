/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import type { AccessTokenPayload } from '../../auth/interfaces/access-token-payload.interface';
import { TaskService } from '../task.service';

describe('TaskService Unit Tests', () => {
  let service: TaskService;
  let mockPrisma: any;
  let mockNotificationService: any;

  const actorAdmin: AccessTokenPayload = {
    sub: 'user-admin-1',
    login: 'admin1',
    role: 'admin',
    companyId: 'company-1',
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorSuperAdmin: AccessTokenPayload = {
    sub: 'user-super-1',
    login: 'superadmin',
    role: 'superadmin',
    companyId: null,
    branchId: null,
    faceDeviceUserId: null,
  };

  const actorEmployee: AccessTokenPayload = {
    sub: 'user-emp-1',
    login: 'employee1',
    role: 'employee',
    companyId: 'company-1',
    branchId: 'branch-1',
    faceDeviceUserId: null,
  };

  const actorOtherCompanyEmp: AccessTokenPayload = {
    sub: 'user-emp-2',
    login: 'employee2',
    role: 'employee',
    companyId: 'company-2',
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
      sendToUser: jest.fn().mockResolvedValue(undefined),
    };

    service = new TaskService(mockPrisma, mockNotificationService);
  });

  describe('create task', () => {
    it('should create a task successfully with valid payload', async () => {
      const createdTaskMock = {
        id: 'task-1',
        companyId: 'company-1',
        title: 'Build Login API',
        description: 'Login endpoint with JWT',
        type: TaskType.feature,
        status: TaskStatus.not_started,
        priority: TaskPriority.normal,
        startDate: new Date('2026-08-27'),
        dueDate: new Date('2026-08-30'),
        order: 0,
        createdById: actorAdmin.sub,
        project: null,
        department: null,
        createdBy: { id: actorAdmin.sub, username: 'admin1' },
        assignees: [{ userId: 'user-emp-1', user: { id: 'user-emp-1' } }],
      };

      mockPrisma.task.create.mockResolvedValue(createdTaskMock);

      const result = await service.create(actorAdmin, {
        title: 'Build Login API',
        description: 'Login endpoint with JWT',
        startDate: '2026-08-27',
        dueDate: '2026-08-30',
        assigneeIds: ['user-emp-1'],
      });

      expect(result).toEqual(createdTaskMock);
      expect(mockPrisma.task.create).toHaveBeenCalled();
      expect(mockNotificationService.notifyUser).toHaveBeenCalledWith(
        'user-emp-1',
        'New Task Assigned',
        expect.stringContaining('Build Login API'),
        'briefcase',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if title is empty', async () => {
      await expect(
        service.create(actorAdmin, {
          title: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if startDate is after dueDate', async () => {
      await expect(
        service.create(actorAdmin, {
          title: 'Invalid Dates Task',
          startDate: '2026-08-30',
          dueDate: '2026-08-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if order is negative', async () => {
      await expect(
        service.create(actorAdmin, {
          title: 'Negative order task',
          order: -1,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if actor is not superadmin and companyId belongs to another company', async () => {
      await expect(
        service.create(actorAdmin, {
          title: 'Cross company attempt',
          companyId: 'company-2',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow superadmin to create task when companyId is provided', async () => {
      mockPrisma.task.create.mockResolvedValue({
        id: 'task-super',
        companyId: 'company-1',
        title: 'Super Admin Task',
      });

      const res = await service.create(actorSuperAdmin, {
        title: 'Super Admin Task',
        companyId: 'company-1',
      });

      expect(res.id).toBe('task-super');
    });

    it('should throw BadRequestException if superadmin creates task without companyId', async () => {
      await expect(
        service.create(actorSuperAdmin, {
          title: 'Super Admin Task Without Company',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate project belongs to company', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'proj-2',
        companyId: 'company-2', // Different company
      });

      await expect(
        service.create(actorAdmin, {
          title: 'Project validation task',
          projectId: 'proj-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate department belongs to company', async () => {
      mockPrisma.department.findUnique.mockResolvedValue({
        id: 'dept-2',
        companyId: 'company-2', // Different company
      });

      await expect(
        service.create(actorAdmin, {
          title: 'Department validation task',
          departmentId: 'dept-2',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll and view projections', () => {
    it('should return paginated list by default', async () => {
      mockPrisma.task.findMany.mockResolvedValue([{ id: 'task-1' }]);
      mockPrisma.task.count.mockResolvedValue(1);

      const result: any = await service.findAll(actorAdmin, {
        page: 1,
        limit: 10,
        viewMode: 'list',
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('should return board projection with all 5 status columns', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', status: TaskStatus.not_started },
        { id: 't2', status: TaskStatus.in_progress },
        { id: 't3', status: TaskStatus.in_progress },
      ]);

      const result: any = await service.findAll(actorAdmin, {
        viewMode: 'board',
      });

      expect(result.not_started.count).toBe(1);
      expect(result.in_progress.count).toBe(2);
      expect(result.in_review.count).toBe(0);
      expect(result.in_review.items).toEqual([]);
      expect(result.done.count).toBe(0);
      expect(result.cancelled.count).toBe(0);
      expect(result.total).toBe(3);
    });

    it('should return calendar projection sorted by dueDate', async () => {
      mockPrisma.task.findMany.mockResolvedValue([
        { id: 't1', dueDate: new Date('2026-08-28') },
        { id: 't2', dueDate: new Date('2026-08-30') },
      ]);

      const result: any = await service.findAll(actorAdmin, {
        viewMode: 'calendar',
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe('findOne and update', () => {
    it('should return single task and enforce scope', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        title: 'Existing Task',
      });

      const task = await service.findOne(actorAdmin, 'task-1');
      expect(task.id).toBe('task-1');

      // Other company actor fails
      await expect(
        service.findOne(actorOtherCompanyEmp, 'task-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if task not found', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.findOne(actorAdmin, 'unknown-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update task details and forbid employee from full update', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        title: 'Task 1',
      });
      mockPrisma.task.update.mockResolvedValue({
        id: 'task-1',
        title: 'Updated Task 1',
      });

      const updated = await service.update(actorAdmin, 'task-1', {
        title: 'Updated Task 1',
      });
      expect(updated.title).toBe('Updated Task 1');

      await expect(
        service.update(actorEmployee, 'task-1', { title: 'Emp update' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('should allow assigned employee or creator to update status', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        createdById: 'someone-else',
        assignees: [{ userId: actorEmployee.sub }],
      });
      mockPrisma.task.update.mockResolvedValue({
        id: 'task-1',
        status: TaskStatus.in_progress,
      });

      const res = await service.updateStatus(actorEmployee, 'task-1', {
        status: TaskStatus.in_progress,
      });
      expect(res.status).toBe(TaskStatus.in_progress);
    });

    it('should forbid unassigned employee from updating status', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        createdById: 'someone-else',
        assignees: [{ userId: 'another-user' }],
      });

      await expect(
        service.updateStatus(actorEmployee, 'task-1', {
          status: TaskStatus.done,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateAssignees', () => {
    it('should atomically replace assignees and notify newly assigned users', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        title: 'Task Alpha',
        assignees: [{ userId: 'user-old' }],
      });
      mockPrisma.task.findUniqueOrThrow.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
        title: 'Task Alpha',
        assignees: [{ userId: 'user-new' }],
      });

      await service.updateAssignees(actorAdmin, 'task-1', {
        assigneeIds: ['user-new'],
      });

      expect(mockPrisma.taskAssignee.deleteMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
      });
      expect(mockPrisma.taskAssignee.createMany).toHaveBeenCalledWith({
        data: [{ taskId: 'task-1', userId: 'user-new' }],
      });
      expect(mockNotificationService.notifyUser).toHaveBeenCalledWith(
        'user-new',
        'Task Assigned',
        expect.stringContaining('Task Alpha'),
        'briefcase',
        expect.any(Object),
      );
    });
  });

  describe('reorder', () => {
    it('should reorder tasks in a transaction and verify company scope', async () => {
      mockPrisma.task.findUnique
        .mockResolvedValueOnce({ id: 't1', companyId: 'company-1' })
        .mockResolvedValueOnce({ id: 't2', companyId: 'company-1' });

      mockPrisma.task.update
        .mockResolvedValueOnce({ id: 't1', order: 0 })
        .mockResolvedValueOnce({
          id: 't2',
          order: 1,
          status: TaskStatus.in_progress,
        });

      const res = await service.reorder(actorAdmin, {
        items: [
          { id: 't1', order: 0 },
          { id: 't2', order: 1, status: TaskStatus.in_progress },
        ],
      });

      expect(res.success).toBe(true);
      expect(res.updatedCount).toBe(2);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('remove task', () => {
    it('should remove task for admin', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
      });
      mockPrisma.task.delete.mockResolvedValue({ id: 'task-1' });

      const res = await service.remove(actorAdmin, 'task-1');
      expect(res).toEqual({ success: true, id: 'task-1' });
    });

    it('should forbid employee from deleting task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        id: 'task-1',
        companyId: 'company-1',
      });

      await expect(service.remove(actorEmployee, 'task-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('TaskProject CRUD', () => {
    it('should create project with unique company name', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue(null);
      mockPrisma.taskProject.create.mockResolvedValue({
        id: 'proj-1',
        companyId: 'company-1',
        name: 'Backend API',
      });

      const proj = await service.createProject(actorAdmin, {
        name: 'Backend API',
        description: 'Backend project description',
      });

      expect(proj.id).toBe('proj-1');
      expect(mockPrisma.taskProject.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if project name exists in same company', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'proj-existing',
        companyId: 'company-1',
        name: 'Backend API',
      });

      await expect(
        service.createProject(actorAdmin, {
          name: 'Backend API',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should remove project and unlink tasks', async () => {
      mockPrisma.taskProject.findUnique.mockResolvedValue({
        id: 'proj-1',
        companyId: 'company-1',
      });
      mockPrisma.task.updateMany.mockResolvedValue({ count: 5 });
      mockPrisma.taskProject.delete.mockResolvedValue({ id: 'proj-1' });

      const res = await service.removeProject(actorAdmin, 'proj-1');
      expect(res).toEqual({ success: true, id: 'proj-1' });
      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        data: { projectId: null },
      });
    });
  });
});
