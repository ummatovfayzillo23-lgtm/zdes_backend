import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AttendanceKpiTemplateDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ example: 1000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  latePenaltyPerMinute?: number = 0;

  @ApiPropertyOptional({ example: 1000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  earlyLeavePenaltyPerMinute?: number = 0;

  @ApiPropertyOptional({ example: 1000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overtimeBonusPerMinute?: number = 0;

  @ApiPropertyOptional({ example: 90, default: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  faceSimilarityThreshold?: number = 90;
}
