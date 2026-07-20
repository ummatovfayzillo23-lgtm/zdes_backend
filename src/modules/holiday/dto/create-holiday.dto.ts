import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateHolidayDto {
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

  @ApiProperty({
    example: 'Navruz holiday',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: '2026-03-21',
  })
  @Type(() => String)
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-03-22',
  })
  @Type(() => String)
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  affectsSalary?: boolean;

  @ApiPropertyOptional({
    example: 'Official company holiday',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
