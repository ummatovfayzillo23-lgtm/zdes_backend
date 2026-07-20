import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TerminalEventType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateRawAttendanceLogDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin/manager',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiProperty()
  @IsUUID()
  terminalId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  attendanceId?: string;

  @ApiProperty({
    example: '1001',
  })
  @IsString()
  @MaxLength(100)
  deviceUserId!: string;

  @ApiProperty({
    example: '2026-06-08T08:30:00.000Z',
  })
  @IsDateString()
  eventTime!: string;

  @ApiPropertyOptional({
    enum: TerminalEventType,
    example: TerminalEventType.check_in,
  })
  @IsOptional()
  @IsEnum(TerminalEventType)
  eventType?: TerminalEventType;

  @ApiPropertyOptional({
    example: { source: 'manual' },
  })
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  processed?: boolean;

  @ApiPropertyOptional({
    example: 'No matching employee',
  })
  @IsOptional()
  @IsString()
  error?: string;
}
