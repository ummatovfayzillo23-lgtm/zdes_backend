import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;

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
    description:
      'Firebase device token to remove from push notifications on logout',
    example: 'fcm-device-token',
  })
  @IsOptional()
  @IsString()
  pushToken?: string;
}
