import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  readonly defaultTtlSeconds = Number(process.env.CACHE_TTL_SECONDS ?? 300);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(`Cache read failed for key "${key}": ${error}`);
      return undefined;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Cache write failed for key "${key}": ${error}`);
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    const pattern = `${prefix}*`;
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length) {
          await this.redis.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(`Cache invalidation failed for prefix "${prefix}": ${error}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
