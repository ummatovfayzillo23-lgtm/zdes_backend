import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTaskProjectDto {
  @ApiPropertyOptional({
    description: 'Project name',
    example: 'Frontend Redesign v2',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Project description',
    example: 'Updated project description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Color hex or identifier',
    example: '#10B981',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiPropertyOptional({
    description: 'Icon identifier',
    example: 'folder-open',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    description: 'Is project active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
