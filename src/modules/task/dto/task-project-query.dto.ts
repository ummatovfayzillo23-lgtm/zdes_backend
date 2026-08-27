import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';
import { toBooleanQuery } from '../../../common/utils/helpers';

export class TaskProjectQueryDto {
  @ApiPropertyOptional({
    description: 'Company UUID filter (superadmin)',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by active status',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }) => toBooleanQuery(obj[key]))
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Search project name or description',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
