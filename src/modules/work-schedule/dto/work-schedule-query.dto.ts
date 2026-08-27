import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { toBooleanQuery } from '../../../common/utils/helpers';

export class WorkScheduleQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ example: 'standart' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: true, type: Boolean })
  @IsOptional()
  @Transform(({ obj, key }) => toBooleanQuery(obj[key]))
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: true, type: Boolean })
  @IsOptional()
  @Transform(({ obj, key }) => toBooleanQuery(obj[key]))
  @IsBoolean()
  isActive?: boolean;

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
