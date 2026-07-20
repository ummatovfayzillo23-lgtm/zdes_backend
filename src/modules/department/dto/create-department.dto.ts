import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDepartmentDto {
  @ApiPropertyOptional({
    description: 'Required for superadmin; auto-filled for admin',
  })
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @ApiProperty({
    example: 'HR',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
}
