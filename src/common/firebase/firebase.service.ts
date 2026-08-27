import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import {
  getMessaging,
  type Message,
  type SendResponse,
} from 'firebase-admin/messaging';
import { PrismaService } from '../config/prisma/prisma.service';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger('Firebase');
  private app: App | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials are not set — push notifications are disabled',
      );
      return;
    }

    this.app = getApps().length
      ? getApps()[0]
      : initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
        });

    this.logger.log('Firebase initialized');
  }

  async sendToTokens(
    tokens: string[],
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app || tokens.length === 0) {
      return;
    }

    const messages: Message[] = tokens.map((token) => ({
      token,
      notification,
      data,
    }));

    try {
      const response = await getMessaging(this.app).sendEach(messages);

      const invalidTokens = response.responses
        .map((result: SendResponse, index: number) => ({
          result,
          token: tokens[index],
        }))
        .filter(
          ({ result }) =>
            !result.success &&
            (result.error?.code === 'messaging/invalid-registration-token' ||
              result.error?.code ===
                'messaging/registration-token-not-registered'),
        )
        .map(({ token }) => token);

      if (invalidTokens.length > 0) {
        await this.prisma.pushToken.deleteMany({
          where: { token: { in: invalidTokens } },
        });
        this.logger.warn(`Removed ${invalidTokens.length} invalid push token(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to send push notification: ${(error as Error).message}`,
      );
    }
  }
}
