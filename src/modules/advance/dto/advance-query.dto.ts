import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AdvanceQueryDto {
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

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  month?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-06-30' })
  @IsOptional()
  @IsISO8601({ strict: true })
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
