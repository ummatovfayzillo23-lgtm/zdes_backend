import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdjustmentCategory, AdjustmentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SalaryAdjustmentQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    enum: AdjustmentType,
  })
  @IsOptional()
  @IsEnum(AdjustmentType)
  type?: AdjustmentType;

  @ApiPropertyOptional({
    enum: AdjustmentCategory,
  })
  @IsOptional()
  @IsEnum(AdjustmentCategory)
  category?: AdjustmentCategory;

  @ApiPropertyOptional({
    example: '2026-06',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    example: 'bonus',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: '2026-06-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
