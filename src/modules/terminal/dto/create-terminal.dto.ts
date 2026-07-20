import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TerminalStatus, TerminalType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsIP,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTerminalDto {
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
    example: 'Main gate terminal',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({
    example: 'TRN-001',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  serialNumber!: string;

  @ApiPropertyOptional({
    example: '192.168.1.100',
  })
  @IsOptional()
  @IsIP()
  ipAddress?: string;

  @ApiPropertyOptional({
    example: 4370,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional({
    enum: TerminalType,
    example: TerminalType.zkteco_face,
  })
  @IsOptional()
  @IsEnum(TerminalType)
  type?: TerminalType;

  @ApiPropertyOptional({
    enum: TerminalStatus,
    example: TerminalStatus.active,
  })
  @IsOptional()
  @IsEnum(TerminalStatus)
  status?: TerminalStatus;

  @ApiPropertyOptional({
    example: { username: 'admin', password: '12345' },
  })
  @IsOptional()
  @IsObject()
  connectionConfig?: Record<string, unknown>;

  @ApiPropertyOptional({
    example: '2026-06-08T10:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  lastSyncAt?: string;
}
