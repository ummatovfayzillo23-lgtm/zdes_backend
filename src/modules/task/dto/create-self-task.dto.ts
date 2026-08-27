import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSelfTaskDto {
  @ApiProperty({
    description: 'Task title',
    example: 'Bugun bajarish kerak',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional({
    description: 'Task description (optional)',
    example: 'Batafsil tavsif',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
