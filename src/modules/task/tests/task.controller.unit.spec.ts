/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { TaskStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../../auth/interfaces/access-token-payload.interface';
import { TaskController } from '../task.controller';

describe('TaskController Unit Tests', () => {
  let controller: TaskController;
  let mockService: any;

  const actorAdmin: AccessTokenPayload = {
    sub: 'user-admin-1',
    login: 'admin1',
    role: 'admin',
    companyId: 'company-1',
    branchId: null,
    faceDeviceUserId: null,
  };

  beforeEach(() => {
    mockService = {
      create: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Task 1' }),
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findOne: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Task 1' }),
      update: jest.fn().mockResolvedValue({ id: 'task-1', title: 'Updated' }),
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
      findAllProjects: jest.fn().mockResolvedValue([]),
      findProjectById: jest
        .fn()
        .mockResolvedValue({ id: 'proj-1', name: 'Project 1' }),
      updateProject: jest
        .fn()
        .mockResolvedValue({ id: 'proj-1', name: 'Updated' }),
      removeProject: jest
        .fn()
        .mockResolvedValue({ success: true, id: 'proj-1' }),
    };

    controller = new TaskController(mockService);
  });

  it('should call create on service', async () => {
    const dto = { title: 'New Task' };
    const res = await controller.create(dto, actorAdmin);
    expect(res).toEqual({ id: 'task-1', title: 'Task 1' });
    expect(mockService.create).toHaveBeenCalledWith(actorAdmin, dto);
  });

  it('should call findAll on service', async () => {
    const query = { page: 1, limit: 10 };
    await controller.findAll(query, actorAdmin);
    expect(mockService.findAll).toHaveBeenCalledWith(actorAdmin, query);
  });

  it('should call findOne on service', async () => {
    await controller.findOne('task-1', actorAdmin);
    expect(mockService.findOne).toHaveBeenCalledWith(actorAdmin, 'task-1');
  });

  it('should call update on service', async () => {
    const dto = { title: 'Updated' };
    await controller.update('task-1', dto, actorAdmin);
    expect(mockService.update).toHaveBeenCalledWith(actorAdmin, 'task-1', dto);
  });

  it('should call updateStatus on service', async () => {
    const dto = { status: TaskStatus.done };
    await controller.updateStatus('task-1', dto, actorAdmin);
    expect(mockService.updateStatus).toHaveBeenCalledWith(
      actorAdmin,
      'task-1',
      dto,
    );
  });

  it('should call updateAssignees on service', async () => {
    const dto = { assigneeIds: ['user-1'] };
    await controller.updateAssignees('task-1', dto, actorAdmin);
    expect(mockService.updateAssignees).toHaveBeenCalledWith(
      actorAdmin,
      'task-1',
      dto,
    );
  });

  it('should call reorder on service', async () => {
    const dto = { items: [{ id: 'task-1', order: 1 }] };
    await controller.reorder(dto, actorAdmin);
    expect(mockService.reorder).toHaveBeenCalledWith(actorAdmin, dto);
  });

  it('should call delete on service', async () => {
    await controller.delete('task-1', actorAdmin);
    expect(mockService.remove).toHaveBeenCalledWith(actorAdmin, 'task-1');
  });

  it('should call createProject on service', async () => {
    const dto = { name: 'Proj 1' };
    await controller.createProject(dto, actorAdmin);
    expect(mockService.createProject).toHaveBeenCalledWith(actorAdmin, dto);
  });

  it('should call findAllProjects on service', async () => {
    const query = { companyId: 'comp-1' };
    await controller.findAllProjects(query, actorAdmin);
    expect(mockService.findAllProjects).toHaveBeenCalledWith(
      actorAdmin,
      'comp-1',
      query,
    );
  });

  it('should call findProjectById on service', async () => {
    await controller.findProjectById('proj-1', actorAdmin);
    expect(mockService.findProjectById).toHaveBeenCalledWith(
      actorAdmin,
      'proj-1',
    );
  });

  it('should call updateProject on service', async () => {
    const dto = { name: 'Proj Updated' };
    await controller.updateProject('proj-1', dto, actorAdmin);
    expect(mockService.updateProject).toHaveBeenCalledWith(
      actorAdmin,
      'proj-1',
      dto,
    );
  });

  it('should call removeProject on service', async () => {
    await controller.removeProject('proj-1', actorAdmin);
    expect(mockService.removeProject).toHaveBeenCalledWith(
      actorAdmin,
      'proj-1',
    );
  });
});
