import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.toLowerCase();
    if (normalizedValue === 'true') {
      return true;
    }
    if (normalizedValue === 'false') {
      return false;
    }
  }

  return undefined;
}

export class TaskProjectQueryDto {
  @ApiPropertyOptional({
    description: 'Company UUID filter (superadmin)',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
  })
  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search project name or description',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
