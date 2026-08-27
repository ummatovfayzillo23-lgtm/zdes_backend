import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class TaskQueryDto {
  @ApiPropertyOptional({
    description: 'Company UUID (superadmin only)',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by project UUID',
  })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Filter by department UUID',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by assigned user UUID',
  })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({
    description: 'Filter by task creator user UUID',
  })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Filter by task status',
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    enum: TaskPriority,
    description: 'Filter by task priority',
  })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    enum: TaskType,
    description: 'Filter by task type',
  })
  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @ApiPropertyOptional({
    description: 'Search string in title or description',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks starting on or after this date (ISO string)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tasks due on or before this date (ISO string)',
  })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({
    enum: ['list', 'board', 'calendar', 'grid'],
    description: 'View projection mode',
    default: 'list',
  })
  @IsOptional()
  @IsIn(['list', 'board', 'calendar', 'grid'])
  viewMode?: 'list' | 'board' | 'calendar' | 'grid';

  @ApiPropertyOptional({
    enum: ['list', 'board', 'calendar', 'grid'],
    description: 'Alias for viewMode',
  })
  @IsOptional()
  @IsIn(['list', 'board', 'calendar', 'grid'])
  view?: 'list' | 'board' | 'calendar' | 'grid';

  @ApiPropertyOptional({
    description: 'Field to sort by (e.g. createdAt, dueDate, order, priority)',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Sort direction',
    default: 'desc',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size limit',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
