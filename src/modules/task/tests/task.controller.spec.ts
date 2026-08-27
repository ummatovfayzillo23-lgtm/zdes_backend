/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import 'reflect-metadata';
import { TaskPriority, TaskStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../../auth/interfaces/access-token-payload.interface';
import {
  CreateTaskDto,
  CreateTaskProjectDto,
  ReorderTasksDto,
  TaskQueryDto,
  UpdateTaskAssigneesDto,
  UpdateTaskDto,
  UpdateTaskProjectDto,
  UpdateTaskStatusDto,
} from './task-dto-validation.spec';
import { TaskServiceContract } from './task.service.spec';

// Controller contract class reflecting TaskController
export class TaskControllerContract {
  constructor(private readonly taskService: TaskServiceContract) {}

  async create(dto: CreateTaskDto, actor: AccessTokenPayload) {
    return this.taskService.create(actor, dto);
  }

  async findAll(query: TaskQueryDto, actor: AccessTokenPayload) {
    return this.taskService.findAll(actor, query);
  }

  async findOne(id: string, actor: AccessTokenPayload) {
    return this.taskService.findOne(actor, id);
  }

  async update(id: string, dto: UpdateTaskDto, actor: AccessTokenPayload) {
    return this.taskService.update(actor, id, dto);
  }

  async updateStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    actor: AccessTokenPayload,
  ) {
    return this.taskService.updateStatus(actor, id, dto);
  }

  async updateAssignees(
    id: string,
    dto: UpdateTaskAssigneesDto,
    actor: AccessTokenPayload,
  ) {
    return this.taskService.updateAssignees(actor, id, dto);
  }

  async reorder(dto: ReorderTasksDto, actor: AccessTokenPayload) {
    return this.taskService.reorder(actor, dto);
  }

  async delete(id: string, actor: AccessTokenPayload) {
    return this.taskService.remove(actor, id);
  }

  async createProject(dto: CreateTaskProjectDto, actor: AccessTokenPayload) {
    return this.taskService.createProject(actor, dto);
  }

  async findAllProjects(actor: AccessTokenPayload, companyId?: string) {
    return this.taskService.findAllProjects(actor, companyId);
  }

  async findProjectById(id: string, actor: AccessTokenPayload) {
    return this.taskService.findProjectById(actor, id);
  }

  async updateProject(
    id: string,
    dto: UpdateTaskProjectDto,
    actor: AccessTokenPayload,
  ) {
    return this.taskService.updateProject(actor, id, dto);
  }

  async deleteProject(id: string, actor: AccessTokenPayload) {
    return this.taskService.removeProject(actor, id);
  }
}

describe('TaskController Contract & Endpoints', () => {
  let controller: TaskControllerContract;
  let mockService: any;

  const mockActor: AccessTokenPayload = {
    sub: 'user-admin-uuid',
    login: 'admin',
    role: 'admin',
    companyId: 'company-uuid',
    branchId: null,
    faceDeviceUserId: 'face-1',
  };

  beforeEach(() => {
    mockService = {
      create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Test Task' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'task-1', title: 'Test Task' }),
      update: jest
        .fn()
        .mockResolvedValue({ id: 'task-1', title: 'Updated Task' }),
      updateStatus: jest
        .fn()
        .mockResolvedValue({ id: 'task-1', status: TaskStatus.done }),
      updateAssignees: jest
        .fn()
        .mockResolvedValue({ id: 'task-1', assignees: [] }),
      reorder: jest.fn().mockResolvedValue({ success: true, updatedCount: 1 }),
      remove: jest.fn().mockResolvedValue({ success: true, id: 'task-1' }),
      createProject: jest
        .fn()
        .mockResolvedValue({ id: 'proj-1', name: 'Project 1' }),
      findAllProjects: jest
        .fn()
        .mockResolvedValue([{ id: 'proj-1', name: 'Project 1' }]),
      findProjectById: jest
        .fn()
        .mockResolvedValue({ id: 'proj-1', name: 'Project 1' }),
      updateProject: jest
        .fn()
        .mockResolvedValue({ id: 'proj-1', name: 'Updated Project' }),
      removeProject: jest
        .fn()
        .mockResolvedValue({ success: true, id: 'proj-1' }),
    };

    controller = new TaskControllerContract(mockService);
  });

  it('should delegate create task to taskService.create', async () => {
    const dto: CreateTaskDto = { title: 'New Task' };
    const result = await controller.create(dto, mockActor);

    expect(mockService.create).toHaveBeenCalledWith(mockActor, dto);
    expect(result.id).toBe('task-1');
  });

  it('should delegate findAll to taskService.findAll', async () => {
    const query: TaskQueryDto = { viewMode: 'board' };
    await controller.findAll(query, mockActor);

    expect(mockService.findAll).toHaveBeenCalledWith(mockActor, query);
  });

  it('should delegate findOne to taskService.findOne', async () => {
    await controller.findOne('task-1', mockActor);

    expect(mockService.findOne).toHaveBeenCalledWith(mockActor, 'task-1');
  });

  it('should delegate update to taskService.update', async () => {
    const dto: UpdateTaskDto = { priority: TaskPriority.urgent };
    await controller.update('task-1', dto, mockActor);

    expect(mockService.update).toHaveBeenCalledWith(mockActor, 'task-1', dto);
  });

  it('should delegate updateStatus to taskService.updateStatus', async () => {
    const dto: UpdateTaskStatusDto = { status: TaskStatus.done };
    await controller.updateStatus('task-1', dto, mockActor);

    expect(mockService.updateStatus).toHaveBeenCalledWith(
      mockActor,
      'task-1',
      dto,
    );
  });

  it('should delegate updateAssignees to taskService.updateAssignees', async () => {
    const dto: UpdateTaskAssigneesDto = { assigneeIds: ['user-1', 'user-2'] };
    await controller.updateAssignees('task-1', dto, mockActor);

    expect(mockService.updateAssignees).toHaveBeenCalledWith(
      mockActor,
      'task-1',
      dto,
    );
  });

  it('should delegate reorder to taskService.reorder', async () => {
    const dto: ReorderTasksDto = { items: [{ id: 'task-1', order: 0 }] };
    await controller.reorder(dto, mockActor);

    expect(mockService.reorder).toHaveBeenCalledWith(mockActor, dto);
  });

  it('should delegate delete to taskService.remove', async () => {
    await controller.delete('task-1', mockActor);

    expect(mockService.remove).toHaveBeenCalledWith(mockActor, 'task-1');
  });

  it('should delegate createProject to taskService.createProject', async () => {
    const dto: CreateTaskProjectDto = { name: 'New Project' };
    await controller.createProject(dto, mockActor);

    expect(mockService.createProject).toHaveBeenCalledWith(mockActor, dto);
  });

  it('should delegate findAllProjects to taskService.findAllProjects', async () => {
    await controller.findAllProjects(mockActor, 'company-uuid');

    expect(mockService.findAllProjects).toHaveBeenCalledWith(
      mockActor,
      'company-uuid',
    );
  });

  it('should delegate findProjectById to taskService.findProjectById', async () => {
    await controller.findProjectById('proj-1', mockActor);

    expect(mockService.findProjectById).toHaveBeenCalledWith(
      mockActor,
      'proj-1',
    );
  });

  it('should delegate updateProject to taskService.updateProject', async () => {
    const dto: UpdateTaskProjectDto = { name: 'Updated' };
    await controller.updateProject('proj-1', dto, mockActor);

    expect(mockService.updateProject).toHaveBeenCalledWith(
      mockActor,
      'proj-1',
      dto,
    );
  });

  it('should delegate deleteProject to taskService.removeProject', async () => {
    await controller.deleteProject('proj-1', mockActor);

    expect(mockService.removeProject).toHaveBeenCalledWith(mockActor, 'proj-1');
  });
});
