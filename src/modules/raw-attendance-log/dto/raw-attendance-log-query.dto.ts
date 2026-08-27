import { ApiPropertyOptional } from '@nestjs/swagger';
import { TerminalEventType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { toBooleanQuery } from '../../../common/utils/helpers';

export class RawAttendanceLogQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  attendanceId?: string;

  @ApiPropertyOptional({
    enum: TerminalEventType,
  })
  @IsOptional()
  @IsEnum(TerminalEventType)
  eventType?: TerminalEventType;

  @ApiPropertyOptional({
    example: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }) => toBooleanQuery(obj[key]))
  @IsBoolean()
  processed?: boolean;

  @ApiPropertyOptional({
    example: '1001',
  })
  @IsOptional()
  @IsString()
  deviceUserId?: string;

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  eventFrom?: string;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsString()
  eventTo?: string;

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
