import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { trimToNull } from '../../../common/utils/helpers';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import type { AccessTokenPayload } from '../interfaces/access-token-payload.interface';
import type { TokenRequestMeta } from '../interfaces/token-request-meta.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login - superadmin, admin, manager, employee' })
  login(@Body() body: LoginDto, @Req() request: Request) {
    return this.authService.login(
      body.login,
      body.password,
      this.getRequestMeta(request, body),
      body.pushToken,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh token - superadmin, admin, manager, employee' })
  refresh(
    @Body() body: RefreshTokenDto,
    @Req() request: Request,
  ) {
    return this.authService.refresh(
      body.refreshToken,
      this.getRequestMeta(request, body),
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout - superadmin, admin, manager, employee' })
  logout(@Body() body: RefreshTokenDto) {
    return this.authService.logout(body.refreshToken, body.pushToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @Roles('superadmin', 'admin', 'manager', 'employee')
  @ApiOperation({ summary: 'Current user - superadmin, admin, manager, employee' })
  me(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getCurrentUser(user);
  }

  private getRequestMeta(
    request: Request,
    body: Pick<LoginDto, 'deviceName' | 'deviceType'>,
  ): TokenRequestMeta {
    const forwardedForHeader = request.headers['x-forwarded-for'];
    const forwardedFor = Array.isArray(forwardedForHeader)
      ? forwardedForHeader[0]
      : forwardedForHeader;

    return {
      ipAddress: trimToNull(forwardedFor?.split(',')[0] ?? request.ip),
      userAgent: request.headers['user-agent'] ?? null,
      deviceType: trimToNull(body.deviceType),
      deviceName: trimToNull(body.deviceName),
    };
  }
}
