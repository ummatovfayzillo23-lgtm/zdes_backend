import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AttachCompanyDto {
  @ApiProperty({ example: 'uuid-company-id' })
  @IsUUID()
  companyId!: string;

  @ApiPropertyOptional({ example: 'uuid-branch-id' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      "If true, becomes this company's default schedule (clears any other default for that company)",
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
