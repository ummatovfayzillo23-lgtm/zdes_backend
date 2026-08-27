import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class TaskOrderItemDto {
  @ApiProperty({
    description: 'Task UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsUUID()
  id!: string;

  @ApiProperty({
    description: 'Order index (0-based)',
    example: 0,
  })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional({
    enum: TaskStatus,
    description: 'Optional updated status',
    example: TaskStatus.in_progress,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class ReorderTasksDto {
  @ApiProperty({
    description: 'List of tasks with updated order and optional status',
    type: [TaskOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskOrderItemDto)
  items!: TaskOrderItemDto[];
}
