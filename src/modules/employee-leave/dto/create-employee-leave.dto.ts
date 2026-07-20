import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeLeaveDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin/manager',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    enum: LeaveType,
    example: LeaveType.vacation,
  })
  @IsEnum(LeaveType)
  type!: LeaveType;

  @ApiProperty({
    example: '2026-06-10',
  })
  @Type(() => String)
  @IsDateString()
  fromDate!: string;

  @ApiProperty({
    example: '2026-06-12',
  })
  @Type(() => String)
  @IsDateString()
  toDate!: string;

  @ApiPropertyOptional({
    example: 3,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days?: number;

  @ApiPropertyOptional({
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  affectsSalary?: boolean;

  @ApiPropertyOptional({
    example: 'Medical leave',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
