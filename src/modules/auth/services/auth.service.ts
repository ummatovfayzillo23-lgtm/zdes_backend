import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { User, UserRole } from '@prisma/client';
import { PrismaService } from '../../../common/config/prisma/prisma.service';
import type { AccessTokenPayload } from '../interfaces/access-token-payload.interface';
import type { AuthUserPayload } from '../interfaces/auth-user-payload.interface';
import type { TokenRequestMeta } from '../interfaces/token-request-meta.interface';
import { isDateExpired, trimToNull } from '../../../common/utils/helpers';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const LOGIN_ALLOWED_ROLES: UserRole[] = [
  'superadmin',
  'admin',
  'manager',
  'employee',
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(
    login: string,
    password: string,
    meta: TokenRequestMeta,
    pushToken?: string,
  ) {
    const normalizedLogin = trimToNull(login);

    if (!normalizedLogin || !password) {
      throw new UnauthorizedException('Login and password are required');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ login: normalizedLogin }, { email: normalizedLogin }],
      },
    });

    if (
      !user ||
      !(await this.passwordService.verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid login or password');
    }

    this.checkUserCanLogin(user);

    const refreshToken = this.tokenService.createRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: this.tokenService.hashRefreshToken(refreshToken),
        expiresAt: this.tokenService.getRefreshTokenExpiryDate(),
        deviceType: meta.deviceType,
        deviceName: meta.deviceName,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
        lastUsedAt: new Date(),
      },
    });

    await this.savePushToken(user.id, pushToken, meta);

    return this.buildAuthTokensResponse(user, refreshToken);
  }

  async refresh(refreshToken: string, meta: TokenRequestMeta) {
    const normalizedRefreshToken = trimToNull(refreshToken);

    if (!normalizedRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: {
        token: this.tokenService.hashRefreshToken(normalizedRefreshToken),
      },
      include: {
        user: true,
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Refresh token is invalid');
    }

    if (isDateExpired(tokenRecord.expiresAt)) {
      await this.prisma.refreshToken.delete({
        where: {
          id: tokenRecord.id,
        },
      });

      throw new UnauthorizedException('Refresh token expired');
    }

    this.checkUserCanLogin(tokenRecord.user);

    await this.prisma.refreshToken.update({
      where: {
        id: tokenRecord.id,
      },
      data: {
        lastUsedAt: new Date(),
        userAgent: meta.userAgent ?? tokenRecord.userAgent,
        ipAddress: meta.ipAddress ?? tokenRecord.ipAddress,
        deviceType: meta.deviceType ?? tokenRecord.deviceType,
        deviceName: meta.deviceName ?? tokenRecord.deviceName,
      },
    });

    return this.buildAuthTokensResponse(tokenRecord.user);
  }

  async logout(refreshToken: string, pushToken?: string) {
    const normalizedRefreshToken = trimToNull(refreshToken);

    if (normalizedRefreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          token: this.tokenService.hashRefreshToken(normalizedRefreshToken),
        },
      });
    }

    const normalizedPushToken = trimToNull(pushToken);
    if (normalizedPushToken) {
      await this.prisma.pushToken.deleteMany({
        where: { token: normalizedPushToken },
      });
    }

    return { success: true };
  }

  async getCurrentUser(authUser: AccessTokenPayload) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: authUser.sub,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.checkUserCanLogin(user);

    return this.toPublicUser(user);
  }

  private async savePushToken(
    userId: string,
    pushToken: string | undefined,
    meta: TokenRequestMeta,
  ): Promise<void> {
    const normalizedPushToken = trimToNull(pushToken);
    if (!normalizedPushToken) {
      return;
    }

    await this.prisma.pushToken.upsert({
      where: { token: normalizedPushToken },
      update: {
        userId,
        platform: meta.deviceType,
        deviceName: meta.deviceName,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        token: normalizedPushToken,
        platform: meta.deviceType,
        deviceName: meta.deviceName,
        lastSeenAt: new Date(),
      },
    });
  }

  private checkUserCanLogin(user: User): void {
    if (!LOGIN_ALLOWED_ROLES.includes(user.role)) {
      throw new ForbiddenException('You do not have access to login');
    }

    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    if (user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }
  }

  private toAuthPayload(user: User): AuthUserPayload {
    return {
      sub: user.id,
      login: user.login,
      role: user.role,
      companyId: user.companyId,
      branchId: user.branchId,
      faceDeviceUserId: user.faceDeviceUserId,
    };
  }

  private toPublicUser(user: User) {
    return {
      id: user.id,
      login: user.login,
      role: user.role,
      companyId: user.companyId,
      branchId: user.branchId,
      departmentId: user.departmentId,
      positionId: user.positionId,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      phone: user.phone,
      email: user.email,
      employeeNo: user.employeeNo,
      faceDeviceUserId: user.faceDeviceUserId,
      isActive: user.isActive,
      isBlocked: user.isBlocked,
    };
  }

  private buildAuthTokensResponse(user: User, refreshToken?: string) {
    return {
      tokenType: 'Bearer',
      accessToken: this.tokenService.createAccessToken(
        this.toAuthPayload(user),
      ),
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenExpiresInSeconds(),
      user: this.toPublicUser(user),
    };
  }
}
