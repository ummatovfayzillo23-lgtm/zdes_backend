import { Global, Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const logger = new Logger('Redis');
        const client = new Redis(
          process.env.REDIS_URL ?? 'redis://localhost:6379',
          {
            lazyConnect: false,
            maxRetriesPerRequest: 5,
            keepAlive: 10000,
            connectTimeout: 10000,
            retryStrategy: (times) => Math.min(times * 500, 5000),
            reconnectOnError: () => true,
          },
        );

        client.on('error', (error) => {
          logger.error(`Redis connection error: ${error.message}`);
        });
        client.on('connect', () => {
          logger.log('Redis connected');
        });
        client.on('reconnecting', (delay: number) => {
          logger.warn(`Redis reconnecting in ${delay}ms`);
        });

        return client;
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class RedisModule {}
