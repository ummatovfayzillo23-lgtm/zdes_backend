import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class UpdateTaskAssigneesDto {
  @ApiProperty({
    description: 'Array of user UUIDs assigned to this task',
    type: [String],
    example: ['c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  assigneeIds!: string[];
}
