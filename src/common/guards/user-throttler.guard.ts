import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithUser } from '../interfaces/request-with-user.interface';

const DEVICE_ID_HEADER = 'x-device-id';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithUser): Promise<string> {
    const identity = req.user?.sub ?? req.ip ?? 'unknown';
    const deviceIdHeader = req.headers[DEVICE_ID_HEADER];
    const deviceId = Array.isArray(deviceIdHeader)
      ? deviceIdHeader[0]
      : deviceIdHeader;

    return deviceId ? `${identity}:${deviceId}` : identity;
  }
}
