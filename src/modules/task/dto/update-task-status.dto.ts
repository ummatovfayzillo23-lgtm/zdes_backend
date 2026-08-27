import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTaskStatusDto {
  @ApiProperty({
    enum: TaskStatus,
    example: TaskStatus.in_progress,
    description: 'New status for the task',
  })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
