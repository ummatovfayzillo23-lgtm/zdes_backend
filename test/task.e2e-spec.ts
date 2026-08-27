import 'reflect-metadata';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  INestApplication,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import {
  CreateTaskDto,
  CreateTaskProjectDto,
  ReorderTasksDto,
  TaskQueryDto,
  UpdateTaskAssigneesDto,
  UpdateTaskDto,
  UpdateTaskProjectDto,
  UpdateTaskStatusDto,
} from '../src/modules/task/tests/task-dto-validation.spec';
import { TaskServiceContract } from '../src/modules/task/tests/task.service.spec';

// ============================================================================
// E2E Mock Controller (Adhering to NestJS routing & TaskController contract)
// ============================================================================
@Controller('api/v1/tasks')
export class MockTaskE2EController {
  constructor(private readonly taskService: TaskServiceContract) {}

  // Projects endpoints
  @Post('projects')
  async createProject(@Body() dto: CreateTaskProjectDto) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.createProject(actor, dto);
  }

  @Get('projects')
  async findAllProjects(@Query('companyId') companyId?: string) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.findAllProjects(actor, companyId);
  }

  @Get('projects/:id')
  async findProjectById(@Param('id') id: string) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.findProjectById(actor, id);
  }

  @Patch('projects/:id')
  async updateProject(
    @Param('id') id: string,
    @Body() dto: UpdateTaskProjectDto,
  ) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.updateProject(actor, id, dto);
  }

  @Delete('projects/:id')
  async removeProject(@Param('id') id: string) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.removeProject(actor, id);
  }

  // Task endpoints
  @Post()
  async create(@Body() dto: CreateTaskDto) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.create(actor, dto);
  }

  @Get()
  async findAll(@Query() query: TaskQueryDto) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.findAll(actor, query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.findOne(actor, id);
  }

  @Patch('reorder')
  async reorder(@Body() dto: ReorderTasksDto) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.reorder(actor, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.update(actor, id, dto);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.updateStatus(actor, id, dto);
  }

  @Patch(':id/assignees')
  async updateAssignees(
    @Param('id') id: string,
    @Body() dto: UpdateTaskAssigneesDto,
  ) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.updateAssignees(actor, id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const actor = {
      sub: 'admin-e2e-uuid',
      login: 'admin',
      role: 'admin',
      companyId: 'company-e2e-uuid',
      branchId: null,
    };
    return this.taskService.remove(actor, id);
  }
}

// ============================================================================
// E2E TEST SUITE
// ============================================================================
describe('Task Management API (E2E Integration)', () => {
  let app: INestApplication;
  let taskService: TaskServiceContract;

  let mockPrisma: any;
  let taskProjectsStore: any[];
  let tasksStore: any[];
  let taskAssigneesStore: any[];

  beforeAll(async () => {
    taskProjectsStore = [];
    tasksStore = [];
    taskAssigneesStore = [];

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

    taskService = new TaskServiceContract(mockPrisma);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [MockTaskE2EController],
      providers: [
        {
          provide: TaskServiceContract,
          useValue: taskService,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // --- Task Projects API E2E ---
  describe('Task Projects Endpoints', () => {
    let createdProjectId: string;

    it('POST /api/v1/tasks/projects -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks/projects')
        .send({
          name: 'Sprint Alpha',
          description: 'Sprint description',
          color: '#4F46E5',
          icon: 'folder',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Sprint Alpha');
      createdProjectId = res.body.id;
    });

    it('POST /api/v1/tasks/projects with duplicate name -> 409 Conflict', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks/projects')
        .send({ name: 'Sprint Alpha' })
        .expect(409);
    });

    it('GET /api/v1/tasks/projects -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks/projects')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/tasks/projects/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/projects/${createdProjectId}`)
        .expect(200);

      expect(res.body.id).toBe(createdProjectId);
    });

    it('PATCH /api/v1/tasks/projects/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/projects/${createdProjectId}`)
        .send({ name: 'Sprint Alpha Updated', color: '#10B981' })
        .expect(200);

      expect(res.body.name).toBe('Sprint Alpha Updated');
      expect(res.body.color).toBe('#10B981');
    });

    it('DELETE /api/v1/tasks/projects/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/tasks/projects/${createdProjectId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // --- Tasks API E2E ---
  describe('Tasks Core & Specialized Actions Endpoints', () => {
    let createdTaskId: string;

    it('POST /api/v1/tasks -> 201 Created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({
          title: 'Implement OAuth2 Flow',
          description: 'Detailed description for oauth',
          type: TaskType.feature,
          priority: TaskPriority.high,
          startDate: '2026-08-27',
          dueDate: '2026-08-30',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Implement OAuth2 Flow');
      expect(res.body.status).toBe(TaskStatus.not_started);
      createdTaskId = res.body.id;
    });

    it('POST /api/v1/tasks with invalid payload -> 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .send({
          title: '', // Empty title
          priority: 'not_a_priority',
        })
        .expect(400);
    });

    it('GET /api/v1/tasks (List View) -> 200 OK with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks?page=1&limit=10')
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBeDefined();
      expect(res.body.page).toBe(1);
    });

    it('GET /api/v1/tasks (Board View) -> 200 OK with 5 status columns', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks?viewMode=board')
        .expect(200);

      expect(res.body.not_started).toBeDefined();
      expect(res.body.in_progress).toBeDefined();
      expect(res.body.in_review).toBeDefined();
      expect(res.body.done).toBeDefined();
      expect(res.body.cancelled).toBeDefined();
      expect(res.body.total).toBeDefined();
    });

    it('GET /api/v1/tasks (Calendar View) -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/tasks?viewMode=calendar')
        .expect(200);

      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.total).toBeDefined();
    });

    it('GET /api/v1/tasks/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tasks/${createdTaskId}`)
        .expect(200);

      expect(res.body.id).toBe(createdTaskId);
    });

    it('PATCH /api/v1/tasks/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${createdTaskId}`)
        .send({
          title: 'Implement OAuth2 Flow (Refactored)',
          priority: TaskPriority.urgent,
        })
        .expect(200);

      expect(res.body.title).toBe('Implement OAuth2 Flow (Refactored)');
      expect(res.body.priority).toBe(TaskPriority.urgent);
    });

    it('PATCH /api/v1/tasks/:id/status -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${createdTaskId}/status`)
        .send({ status: TaskStatus.in_progress })
        .expect(200);

      expect(res.body.status).toBe(TaskStatus.in_progress);
    });

    it('PATCH /api/v1/tasks/:id/status with invalid enum -> 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${createdTaskId}/status`)
        .send({ status: 'unknown_status' })
        .expect(400);
    });

    it('PATCH /api/v1/tasks/:id/assignees -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${createdTaskId}/assignees`)
        .send({
          assigneeIds: [
            'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
          ],
        })
        .expect(200);

      expect(res.body.assignees.length).toBe(2);
    });

    it('PATCH /api/v1/tasks/reorder -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/tasks/reorder')
        .send({
          items: [
            {
              id: createdTaskId,
              order: 5,
              status: TaskStatus.done,
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.updatedCount).toBe(1);
    });

    it('DELETE /api/v1/tasks/:id -> 200 OK', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/tasks/${createdTaskId}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      await request(app.getHttpServer())
        .get(`/api/v1/tasks/${createdTaskId}`)
        .expect(404);
    });
  });
});
