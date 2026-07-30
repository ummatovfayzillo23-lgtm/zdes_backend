import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({
    example: 'ZDES',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'ZDES LLC',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({
    example: '+998901234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    example: 'info@zdes.uz',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    example: 'Tashkent city, Yunusobod district',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/logos/zdes.png',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional({
    example: 'Asia/Tashkent',
    default: 'Asia/Tashkent',
    description:
      'IANA timezone used to compute attendance schedules for this company',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
