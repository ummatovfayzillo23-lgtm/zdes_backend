import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSettingDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty({
    example: 'attendance_kpi_template',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  key!: string;

  @ApiPropertyOptional({
    example: { latePenaltyPerMinute: 1000 },
  })
  @IsOptional()
  @IsObject()
  value?: Record<string, unknown>;
}
