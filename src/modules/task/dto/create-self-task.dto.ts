import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSelfTaskDto {
  @ApiPropertyOptional({
    description:
      'Company UUID (optional for superadmin override; auto-resolved from token for company actors)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

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
