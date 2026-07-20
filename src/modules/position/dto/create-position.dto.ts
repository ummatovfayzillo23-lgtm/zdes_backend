import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePositionDto {
  @ApiPropertyOptional({
    example: 'uuid-company-id',
    description: 'Required for superadmin; auto-filled for admin',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    example: 'uuid-department-id',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({
    example: 'Backend Developer',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}
