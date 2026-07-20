import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAdvanceDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin/manager',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: 500000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiProperty({ example: '2026-06-08' })
  @IsISO8601({ strict: true })
  date!: string;

  @ApiPropertyOptional({ example: '2026-06' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  month?: string;

  @ApiPropertyOptional({ example: 'Advance for travel expenses' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
