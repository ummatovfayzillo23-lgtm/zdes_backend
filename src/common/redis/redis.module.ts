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
            maxRetriesPerRequest: 2,
          },
        );

        client.on('error', (error) => {
          logger.error(`Redis connection error: ${error.message}`);
        });
        client.on('connect', () => {
          logger.log('Redis connected');
        });

        return client;
      },
    },
    CacheService,
  ],
  exports: [CacheService],
})
export class RedisModule {}
