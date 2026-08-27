/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
  validate,
} from 'class-validator';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';

// ============================================================================
// DTO Definitions with class-validator annotations (Standard NestJS Pattern)
// ============================================================================
export class CreateTaskDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds?: string[];
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

export class UpdateTaskAssigneesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds!: string[];
}

export class TaskOrderItemDto {
  @IsUUID()
  id!: string;

  @IsInt()
  @Min(0)
  order!: number;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class ReorderTasksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskOrderItemDto)
  items!: TaskOrderItemDto[];
}

export class CreateTaskProjectDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TaskQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsIn(['list', 'board', 'calendar', 'grid'])
  viewMode?: 'list' | 'board' | 'calendar' | 'grid';

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// ============================================================================
// DTO VALIDATION TEST SUITE
// ============================================================================
describe('Task Module DTO Validations', () => {
  describe('CreateTaskDto validation', () => {
    it('should pass with valid minimal fields', async () => {
      const dto = plainToInstance(CreateTaskDto, { title: 'Implement Auth' });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass with complete valid payload', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Complete Feature',
        description: 'Detailed description',
        type: TaskType.feature,
        status: TaskStatus.in_progress,
        priority: TaskPriority.high,
        startDate: '2026-08-27',
        dueDate: '2026-08-30',
        order: 2,
        projectId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        departmentId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        assigneeIds: ['c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing title', async () => {
      const dto = plainToInstance(CreateTaskDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'title')).toBe(true);
    });

    it('should reject empty string title', async () => {
      const dto = plainToInstance(CreateTaskDto, { title: '' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'title')).toBe(true);
    });

    it('should reject title exceeding 255 characters', async () => {
      const dto = plainToInstance(CreateTaskDto, { title: 'A'.repeat(256) });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'title')).toBe(true);
    });

    it('should reject invalid TaskType enum', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        type: 'invalid_task_type' as any,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'type')).toBe(true);
    });

    it('should reject invalid TaskStatus enum', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        status: 'finished' as any,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });

    it('should reject invalid TaskPriority enum', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        priority: 'super_urgent' as any,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'priority')).toBe(true);
    });

    it('should reject non-UUID projectId or departmentId', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        projectId: 'not-a-uuid',
        departmentId: '12345',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'projectId')).toBe(true);
      expect(errors.some((e) => e.property === 'departmentId')).toBe(true);
    });

    it('should reject non-UUID in assigneeIds array', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        assigneeIds: ['valid-not', '123-bad'],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'assigneeIds')).toBe(true);
    });

    it('should reject invalid date strings', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        startDate: 'invalid-date',
        dueDate: '32-13-2026',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'startDate')).toBe(true);
      expect(errors.some((e) => e.property === 'dueDate')).toBe(true);
    });

    it('should reject negative order', async () => {
      const dto = plainToInstance(CreateTaskDto, {
        title: 'Valid Title',
        order: -3,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'order')).toBe(true);
    });
  });

  describe('UpdateTaskStatusDto validation', () => {
    it('should accept valid TaskStatus enum values', async () => {
      const validStatuses = [
        TaskStatus.not_started,
        TaskStatus.in_progress,
        TaskStatus.in_review,
        TaskStatus.done,
        TaskStatus.cancelled,
      ];
      for (const s of validStatuses) {
        const dto = plainToInstance(UpdateTaskStatusDto, { status: s });
        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      }
    });

    it('should reject invalid TaskStatus string', async () => {
      const dto = plainToInstance(UpdateTaskStatusDto, {
        status: 'in_testing' as any,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'status')).toBe(true);
    });
  });

  describe('UpdateTaskAssigneesDto validation', () => {
    it('should accept array of valid UUIDs', async () => {
      const dto = plainToInstance(UpdateTaskAssigneesDto, {
        assigneeIds: [
          'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        ],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should accept empty array to clear assignees', async () => {
      const dto = plainToInstance(UpdateTaskAssigneesDto, { assigneeIds: [] });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid non-UUID items in array', async () => {
      const dto = plainToInstance(UpdateTaskAssigneesDto, {
        assigneeIds: ['not-a-valid-uuid'],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'assigneeIds')).toBe(true);
    });
  });

  describe('ReorderTasksDto validation', () => {
    it('should accept array of valid TaskOrderItemDto items', async () => {
      const dto = plainToInstance(ReorderTasksDto, {
        items: [
          {
            id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            order: 0,
            status: TaskStatus.in_progress,
          },
          {
            id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            order: 1,
            status: TaskStatus.done,
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject items with invalid UUID id or negative order', async () => {
      const dto = plainToInstance(ReorderTasksDto, {
        items: [
          {
            id: 'invalid-id',
            order: -1,
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('CreateTaskProjectDto validation', () => {
    it('should accept valid project creation payload', async () => {
      const dto = plainToInstance(CreateTaskProjectDto, {
        name: 'Kalburn Project',
        description: 'New design system project',
        color: '#4F46E5',
        icon: 'folder',
        isActive: true,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject missing project name', async () => {
      const dto = plainToInstance(CreateTaskProjectDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('should reject project name exceeding 255 characters', async () => {
      const dto = plainToInstance(CreateTaskProjectDto, {
        name: 'P'.repeat(256),
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'name')).toBe(true);
    });

    it('should reject description exceeding 500 characters', async () => {
      const dto = plainToInstance(CreateTaskProjectDto, {
        name: 'Project Name',
        description: 'D'.repeat(501),
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'description')).toBe(true);
    });
  });

  describe('TaskQueryDto validation', () => {
    it('should accept valid query parameters', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        viewMode: 'board',
        status: TaskStatus.in_progress,
        priority: TaskPriority.high,
        type: TaskType.bug,
        sortBy: 'dueDate',
        sortOrder: 'desc',
        page: 2,
        limit: 25,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should reject invalid viewMode', async () => {
      const dto = plainToInstance(TaskQueryDto, {
        viewMode: 'invalid_mode' as any,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'viewMode')).toBe(true);
    });

    it('should reject page < 1 or limit > 100', async () => {
      const dto = plainToInstance(TaskQueryDto, { page: 0, limit: 150 });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'page')).toBe(true);
      expect(errors.some((e) => e.property === 'limit')).toBe(true);
    });
  });
});
