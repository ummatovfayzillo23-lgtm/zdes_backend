import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { CacheService } from '../redis/cache.service';
import type { RequestWithUser } from '../interfaces/request-with-user.interface';

const CACHEABLE_METHODS = new Set(['GET']);
const INVALIDATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIPPED_RESOURCES = new Set(['auth', 'docs', 'docs-json']);

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly cache: CacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const method = request.method.toUpperCase();
    const resource = this.resolveResource(request.originalUrl);

    if (!resource || SKIPPED_RESOURCES.has(resource)) {
      return next.handle();
    }

    if (INVALIDATING_METHODS.has(method)) {
      return next.handle().pipe(
        tap(() => {
          void this.cache.delByPrefix(`cache:${resource}:`);
        }),
      );
    }

    if (!CACHEABLE_METHODS.has(method)) {
      return next.handle();
    }

    const key = this.buildKey(resource, request);

    return from(this.cache.get(key)).pipe(
      switchMap((cached) => {
        if (cached !== undefined) {
          return of(cached);
        }

        return next.handle().pipe(
          tap((data) => {
            void this.cache.set(key, data);
          }),
        );
      }),
    );
  }

  private resolveResource(originalUrl: string): string | null {
    const path = originalUrl.split('?')[0];
    const segments = path.split('/').filter(Boolean);
    return segments[2] ?? null;
  }

  private buildKey(resource: string, request: RequestWithUser): string {
    const identity = request.user?.sub ?? request.ip ?? 'anon';
    return `cache:${resource}:${identity}:${request.originalUrl}`;
  }
}
