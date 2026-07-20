import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateWorkScheduleDto {
  @ApiPropertyOptional({
    example: 'uuid-company-id',
    description: 'Required for superadmin; auto-filled for admin',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({ example: 'uuid-branch-id' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiProperty({ example: 'Standart ish kuni' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:mm format' })
  endTime!: string;

  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: 'Work days: 1=Monday, 2=Tuesday, ..., 7=Sunday',
    type: [Number],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays!: number[];

  @ApiPropertyOptional({ example: 15, description: 'Allowed late minutes' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  graceMinutes?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    example: 'uuid-user-id',
    description:
      'If provided, this schedule is immediately assigned to the user',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;
}
