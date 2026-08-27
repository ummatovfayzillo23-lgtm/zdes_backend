# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`zdes_backend` — a NestJS 11 (Express) REST API for a multi-tenant HR / attendance / payroll / task-management system. Prisma + PostgreSQL, Redis for caching, Firebase Admin for push, AWS Rekognition for face matching. All routes are served under `api/v1` (see `src/main.ts`). Swagger UI is at `/api/v1/docs` behind hardcoded basic auth (`login` / `1234`).

The tenancy tree is `Company → Branch → Department → Position → User`. Most business logic lives in per-module services that talk to Prisma directly.

## Commands

```bash
npm run build          # prisma generate + nest build
npm run start:debug    # nest start --debug --watch  (the dev-loop command; there is no start:dev)
npm run start          # runs the built dist/ (must build first)
npm run lint           # eslint --fix over src/apps/libs/test
npm run format         # prettier --write

npm test                       # jest, all *.spec.ts under src/
npm test -- task.service       # single file / pattern (regex against test path)
npm test -- -t "creates a task"  # single test by name
npm run test:cov               # coverage
npm run test:e2e               # jest with test/jest-e2e.json (test/*.e2e-spec.ts)

# Prisma
npx prisma migrate dev --name <name>   # create + apply a migration against DATABASE_URL
npx prisma generate                    # regenerate client (also runs on postinstall & build)
npm run seed                           # prisma/seed.ts — upserts one user per role, login == role name,
                                       # password = SEED_USER_PASSWORD (default "Password123")
```

Node 20 (`.node-version`). Copy `.env.example` → `.env` before running anything; `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL` are the minimum to boot.

## Known repo state / gotchas

- Prisma client can go stale after pulling schema changes — run `npx prisma generate` (or `npm run build`) if `@prisma/client` is missing enums/models (`TaskType`, `AttendanceSession`, …).
- Docs in `docs/` and some module `README.md` files are written in Uzbek; they are accurate and worth reading.
- `uploads/` is served statically at `/uploads` and git-ignored except `.gitkeep`.
- `*-query.dto.ts` files have a pre-existing `no-unsafe-member-access` eslint error on `obj[key]` (from the boolean-query-parse commit) — repo-wide, unrelated to the simplification pass. Lint is not CI-enforced.

## Architecture

### Module layout
`src/modules/<feature>/` — each is a self-contained NestJS module: `<feature>.module.ts`, `<feature>.controller.ts`, `<feature>.service.ts`, `dto/` (class-validator DTOs, often re-exported via `dto/index.ts`), `interfaces/`, and `tests/` (`*.spec.ts`). `auth` and `attendance` further split into `controllers/`, `services/`, `constants/`. `app.module.ts` wires every feature module plus the global infra modules.

### Global request pipeline (`src/main.ts` + `app.module.ts`)
1. **`AccessTokenGuard`** (global) — skips `@Public()` routes; otherwise requires `Authorization: Bearer <jwt>`, verifies via `TokenService`, attaches `AuthUserPayload` to `request.user`.
2. **`UserThrottlerGuard`** (global) — rate limit keyed by `user.sub` + `x-device-id`. Configurable via `RATE_LIMIT_TTL_MS` / `RATE_LIMIT_MAX`.
3. **`RolesGuard`** (global) — reads `@Roles(...)` metadata; no decorator ⇒ any authenticated user passes; otherwise `request.user.role` must be in the list.
4. **`ValidationPipe`** — `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`, implicit conversion on. Unknown body fields are rejected.
5. **`ResponseInterceptor`** — wraps every success response as `{ success, statusCode, message, data, path, timestamp }`. Handlers return raw data; do not build the envelope yourself.
6. **`HttpCacheInterceptor`** — see caching below.
7. **`GlobalExceptionFilter`** — normalizes `HttpException` and Prisma errors (`P2002`→409, `P2003`→400, `P2025`→404) into `{ statusCode, error, message, path, timestamp }`.

### Auth
Hand-rolled JWT (HMAC-SHA256), **not** passport. `src/modules/auth/`. Access token carries `sub, login, role, companyId, branchId, faceDeviceUserId` and is valid for up to ~20 days. Refresh tokens are hashed and stored in DB. `@Public()` routes: `POST /auth/login|refresh|logout` and `POST /turnstile/logs`. Use `@CurrentUser()` to pull the payload into a handler.

Because role/company/branch/`isActive`/`isBlocked` are baked into the stateless access token, **changes to those fields only take effect on `/auth/refresh` or `GET /auth/me`** — not on other endpoints until the token expires. `GET /auth/me` re-fetches from DB and re-runs `checkUserCanLogin`.

### Authorization — two independent layers
1. **Endpoint gate**: `@Roles('superadmin','admin','manager','employee')` on controller class or method (method overrides class). Roles enum: `superadmin | admin | manager | employee`. There is **no permission table** — authorization is entirely code-defined.
2. **Row-level tenant scoping**: enforced *manually* inside service methods via `src/common/utils/scope.util.ts`:
   - `getScope(actor, requested)` — for list/query filters.
   - `getCompanyId(actor, providedCompanyId)` — for create ops.
   - `checkAccess(actor, target)` — for get/update/delete of a single record.
   `superadmin` bypasses scoping; `admin` is pinned to its `companyId`; `manager` to `companyId` + `branchId` and to `employee`-role targets only. **A new service method that forgets to call these helpers silently leaks cross-tenant data.**

Full role/endpoint matrix: **`docs/roles.md`** (comprehensive, keep it in sync when changing `@Roles` or scope logic).

### Data access
Single global `PrismaService` (extends `PrismaClient`, connects `onModuleInit`) provided by a `@Global()` `PrismaModule`. Inject it directly into services; no repository layer. Schema: `prisma/schema.prisma` (~800 lines, all models). Migrations in `prisma/migrations/` are timestamp-named; `prisma.config.ts` points Prisma at the schema and `DATABASE_URL`.

### Caching (`HttpCacheInterceptor` + `CacheService` over ioredis)
Keyed as `cache:<resource>:<userSub|ip>:<originalUrl>` where `<resource>` is the 3rd URL segment (`/api/v1/<resource>/...`). `GET` responses are cached for `CACHE_TTL_SECONDS` (default 300); any `POST/PUT/PATCH/DELETE` to a resource deletes `cache:<resource>:*`. `auth` and `docs` are never cached. Cache is per-user — cross-user data does not leak through it.

### File uploads (`src/common/upload/image-upload.util.ts`)
`imageUploadOptions(category)` returns Multer disk-storage config: categories `avatars | logos | faces | attendance`, jpeg/png/webp only, 5 MB max, random-UUID filenames, written under `uploads/<category>/`. `buildUploadUrl()` prefixes `APP_BASE_URL`. Use `getFile()` to 400 on a missing file.

### External integrations
- **Redis** (`src/common/redis/`) — `CacheService`, wired from `REDIS_URL`.
- **Firebase** (`src/common/firebase/`) — `FirebaseService` for push notifications; needs `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`.
- **AWS Rekognition** — face matching in the attendance/turnstile flow; `AWS_REGION` + keys.
- **Turnstile webhook** — `POST /turnstile/logs` is `@Public()`, authenticated by the `x-turnstile-secret` header vs `TURNSTILE_SHARED_SECRET`. **If that env var is unset the check is skipped and the endpoint is open.** This is the device ingestion path for attendance (employees have no attendance API of their own).

## Conventions when adding code

- New feature ⇒ new `src/modules/<feature>/` module, registered in `app.module.ts`.
- Controllers stay thin: validate via DTO, pass `@CurrentUser()` actor + dto to the service, return raw data.
- Services own all authorization scoping — call the `scope.util.ts` helpers explicitly.
- DTOs use `class-validator` decorators; the global pipe rejects unknown fields, so every accepted field needs a decorator.
- When a route has both `/:id` and a literal sub-path (e.g. `/me`, `/projects`), declare the literal **before** `/:id` or Nest treats the literal as an id (see `task.controller.ts`, `user.controller.ts`).
- Tests live in `src/modules/<feature>/tests/*.spec.ts` (jest `rootDir` is `src`, `testRegex` is `.*\.spec\.ts$`). e2e specs go in `test/*.e2e-spec.ts`.
- Update `docs/roles.md` whenever you touch `@Roles(...)`, `@Public()`, or `scope.util.ts`.
- Simplification pass in progress: follow `docs/code-style.md` (plain names, linear syntax, no comments, partial `update`, per-endpoint `@Roles`/`@ApiBearerAuth`, request/response unchanged). Reference module: `src/modules/holiday/`. Shared scope helpers were renamed — `getCompanyId` / `getScope` / `checkAccess` (was `getCompanyId` / `getScope` / `checkAccess`).
