import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'superAdmin',
  })
  @IsString()
  login!: string;

  @ApiProperty({
    example: 'Password123',
  })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({
    example: 'web',
  })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional({
    example: 'Chrome on Windows',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Firebase device token for push notifications',
    example: 'fcm-device-token',
  })
  @IsOptional()
  @IsString()
  pushToken?: string;
}
