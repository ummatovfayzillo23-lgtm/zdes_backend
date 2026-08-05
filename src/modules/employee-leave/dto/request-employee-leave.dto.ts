import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveDurationType, LeaveType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RequestEmployeeLeaveDto {
  @ApiProperty({
    enum: LeaveType,
    example: LeaveType.vacation,
  })
  @IsEnum(LeaveType)
  type!: LeaveType;

  @ApiProperty({
    enum: LeaveDurationType,
    example: LeaveDurationType.daily,
  })
  @IsEnum(LeaveDurationType)
  durationType!: LeaveDurationType;

  @ApiProperty({
    example: '2026-06-10',
  })
  @Type(() => String)
  @IsDateString()
  fromDate!: string;

  @ApiPropertyOptional({
    example: '2026-06-12',
    description:
      'Required for multi_day requests; ignored for hourly/daily (defaults to fromDate)',
  })
  @IsOptional()
  @Type(() => String)
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Required for hourly leave; maximum 3 hours per request',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  leaveHours?: number;

  @ApiPropertyOptional({
    example: 'Doctor appointment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
