import { ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationIcon } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { toBooleanQuery } from '../../../common/utils/helpers';

export class NotificationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    enum: NotificationIcon,
  })
  @IsOptional()
  @IsEnum(NotificationIcon)
  icon?: NotificationIcon;

  @ApiPropertyOptional({
    example: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }) => toBooleanQuery(obj[key]))
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({
    example: 'payroll',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
