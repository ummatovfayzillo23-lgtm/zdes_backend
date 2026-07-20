import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentCategory, AdjustmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSalaryAdjustmentDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin/manager',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    enum: AdjustmentType,
    example: AdjustmentType.bonus,
  })
  @IsEnum(AdjustmentType)
  type!: AdjustmentType;

  @ApiPropertyOptional({
    enum: AdjustmentCategory,
    example: AdjustmentCategory.manual,
  })
  @IsOptional()
  @IsEnum(AdjustmentCategory)
  category?: AdjustmentCategory;

  @ApiProperty({
    example: 150000,
  })
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @ApiProperty({
    example: '2026-06-08',
  })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: '2026-06',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    example: 'Manual bonus',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
