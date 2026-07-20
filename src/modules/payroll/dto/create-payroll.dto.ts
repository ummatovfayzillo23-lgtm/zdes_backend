import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayrollStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePayrollDto {
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
    example: '2026-06',
  })
  @IsString()
  month!: string;

  @ApiPropertyOptional({ example: 4000000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  baseSalary?: number;

  @ApiPropertyOptional({ example: 500000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalBonus?: number;

  @ApiPropertyOptional({ example: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalPenalty?: number;

  @ApiPropertyOptional({ example: 200000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalAdvance?: number;

  @ApiPropertyOptional({ example: 4200000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  netSalary?: number;

  @ApiPropertyOptional({
    enum: PayrollStatus,
    example: PayrollStatus.draft,
  })
  @IsOptional()
  @IsEnum(PayrollStatus)
  status?: PayrollStatus;

  @ApiPropertyOptional({
    example: '2026-06-30T10:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  paidById?: string;
}
