# Role System (RBAC)

This document describes the project-wide role/authorization model: the `UserRole` enum, the guard/decorator machinery that enforces it, the JWT flow that carries it, how roles are assigned/changed, and a full endpoint-by-endpoint access map across every module.

---

## 1. Overview

- **Framework**: NestJS v11 (Express platform).
- **DB/ORM**: Prisma → PostgreSQL (`prisma/schema.prisma`).
- **Auth**: custom hand-rolled JWT (HMAC-SHA256), not `passport-jwt`.
- **Domain**: multi-tenant HR/attendance/payroll system — `Company` → `Branch` → `Department` → `Position` → `User` (employee).
- **Role model**: a single flat enum on the `User` row. There is **no** `Permission`/`RolePermission` table — authorization is 100% code-defined via `@Roles(...)` decorators plus manual scope checks in services, not data-driven.

```prisma
// prisma/schema.prisma
enum UserRole {
  superadmin
  admin
  manager
  employee
}

model User {
  ...
  role      UserRole @default(employee)
  companyId String?  @db.Uuid
  branchId  String?  @db.Uuid
  isActive  Boolean  @default(true)
  isBlocked Boolean  @default(false)
  ...
  @@index([role])
}
```

One role per user (scalar column, not many-to-many). Default role for a new row is `employee`.

### Role meanings

| Role | Scope | Purpose |
|---|---|---|
| `superadmin` | Global | Platform owner. Only role allowed to manage **Companies**. Bypasses all company/branch scoping. Only role that can create/edit/delete another `superadmin`. |
| `admin` | One `companyId` | Tenant admin. Manages branches, departments, positions, users, settings, work-schedules, payroll, etc. — restricted to their own company. |
| `manager` | One `companyId` + one `branchId` | Branch-level manager. Manages `employee`-role users only, within their own branch. Cannot change anyone's `role`, `companyId`, or `branchId`. |
| `employee` | One `companyId` + one `branchId` | End-user/staff account. Almost no API surface — effectively `GET /auth/me` and self-service leave requests only. |

---

## 2. Guards & decorators

### `@Roles(...roles)`
`src/common/decorators/roles.decorator.ts`
```ts
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
```
Can be applied at controller (class) level as a blanket rule, or per-handler to override/narrow it. Method-level wins over class-level (`Reflector.getAllAndOverride`).

### `@Public()`
`src/common/decorators/public.decorator.ts` — marks a route as needing no JWT/role at all. Used **only** on: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, and `POST /turnstile/logs`.

### `AccessTokenGuard` (authentication)
`src/common/guards/access-token.guard.ts` — global guard. Skips `@Public()` routes; otherwise requires `Authorization: Bearer <token>`, verifies it via `TokenService.verifyAccessToken`, and attaches the decoded payload to `request.user`.

### `RolesGuard` (authorization)
`src/common/guards/roles.guard.ts` — global guard, runs after `AccessTokenGuard`. Skips `@Public()`. Reads `@Roles(...)` metadata; if none declared, any authenticated user passes. Otherwise checks `request.user.role` is in the allowed list, else throws `403 ForbiddenException`.

`RolesGuard` does **not** re-check `isActive`/`isBlocked` — see [§6](#6-isactive--isblocked-flags).

### `UserThrottlerGuard`
`src/common/guards/user-throttler.guard.ts` — rate limiting keyed by `user.sub` (+ `x-device-id`), part of the same global guard chain but unrelated to roles.

### Global guard order (`src/app.module.ts`)
```ts
providers: [
  { provide: APP_GUARD, useClass: AccessTokenGuard },
  { provide: APP_GUARD, useClass: UserThrottlerGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
]
```
Every route is authenticated + role-checked by default unless explicitly `@Public()`.

### `@CurrentUser()`
`src/modules/auth/decorators/current-user.decorator.ts` — pulls `request.user` (JWT payload: `sub`, `login`, `role`, `companyId`, `branchId`, `faceDeviceUserId`) into controller handlers.

### Turnstile shared-secret (non-role auth)
`POST /turnstile/logs` is `@Public()` — instead of JWT/role, it's protected by comparing header `x-turnstile-secret` against env `TURNSTILE_SHARED_SECRET` (`turnstile.service.ts`). If that env var is unset, the check is skipped entirely (open endpoint). This is a device-to-server webhook, a separate trust boundary from the role system.

---

## 3. Second layer: company/branch scoping

`@Roles(...)` only gates **which endpoints** a role can call. Row-level multi-tenant isolation (who can see/edit *which specific records*) is enforced separately, in the service layer, via `src/common/utils/scope.util.ts`. This is called manually inside almost every service method — it is a convention, not something the guards enforce automatically.

| Helper | Used for | Behavior |
|---|---|---|
| `resolveCompanyBranchScope(actor, requested)` | list/query filters | `superadmin` → whatever was requested (cross-tenant); `admin` → forced to own `companyId` (403 if a different one requested); `manager` → forced to own `companyId` **and** `branchId` |
| `resolveScopedCompanyId(actor, providedCompanyId)` | create operations | `superadmin` must supply a `companyId`; everyone else forced to their own |
| `assertWithinScope(actor, target)` | single-record access (get/update/delete) | `superadmin` always passes; others get `403` if `target.companyId` mismatches; `manager` additionally needs `target.branchId` to match |

> **Risk note**: since scope enforcement is manual per service method (no interceptor/global filter), a new endpoint that forgets to call these helpers would silently leak cross-tenant data. Worth checking whenever a new service method is added.

---

## 4. JWT / auth flow and role propagation

### Login — `AuthService.login`
1. Look up `User` by `login` or `email`.
2. Verify password (bcrypt).
3. `ensureUserCanLogin(user)`:
   ```ts
   if (!LOGIN_ALLOWED_ROLES.includes(user.role)) throw ForbiddenException('You do not have access to login');
   if (!user.isActive) throw ForbiddenException('User is inactive');
   if (user.isBlocked) throw ForbiddenException('User is blocked');
   ```
   `LOGIN_ALLOWED_ROLES` currently equals the full enum (all 4 roles can log in) — it exists as a single toggle should a non-login role ever be introduced.
4. Store hashed refresh token, issue access + refresh tokens.

### JWT payload (`AuthUserPayload`)
```ts
{
  sub: string;
  login: string;
  role: UserRole;
  companyId: string | null;
  branchId: string | null;
  faceDeviceUserId: string | null;
}
```
`role`, `companyId`, `branchId` are baked directly into the access token. **Every downstream authorization check (`RolesGuard` + scope helpers) reads these straight from the JWT**, not from a fresh DB lookup.

### Consequence: role changes are not instant
Because the access token is a stateless, offline-verifiable JWT (valid up to 20 days), a role/company/branch change — or a block/deactivation — only takes effect:
- immediately on `GET /auth/me` (re-fetches from DB, re-runs `ensureUserCanLogin`), and
- on `POST /auth/refresh` (re-checks DB),

but **not** on any other endpoint until the current access token expires or is refreshed. A demoted or blocked user keeps working with an already-issued token elsewhere in the API until then.

---

## 5. Role assignment / change flow

There is **no self-registration endpoint** (no `POST /auth/register`). All users are created by an already-authorized actor.

- **Bootstrap superadmin**: `prisma/seed.ts` (`npm run seed`) upserts one user per role (`login` == role name: `superadmin`, `admin`, `manager`, `employee`), password from env `SEED_USER_PASSWORD` (default `Password123`). Dev/staging bootstrap only — not meant for production as-is.

- **Create a user** — `POST /users` (`superadmin`, `admin` only; **managers cannot create users**):
  - `role` is optional on `CreateUserDto` (defaults to `employee`).
  - `if (actor.role !== 'superadmin' && dto.role === 'superadmin') → 403` — only a superadmin can mint another superadmin.
  - `admin` is forced to their own `companyId` (`resolveScopedCompanyId`); `superadmin` can target any company.

- **Change a role** — `PATCH /users/:id` (`superadmin`, `admin`, `manager`):
  - `if (actor.role !== 'superadmin' && (existing.role === 'superadmin' || dto.role === 'superadmin')) → 403` — non-superadmins can't touch superadmin accounts at all.
  - `if (actor.role === 'manager' && (dto.role !== undefined || dto.companyId !== undefined || dto.branchId !== undefined)) → 403 "Manager cannot change role, company or branch"`.
  - **Net effect: only `superadmin` and `admin` can actually change a `role` field**, and `admin` can never touch superadmin accounts.

- **Block / deactivate** — dedicated endpoints, not the general update:
  - `PATCH /users/:id/toggle-status` (`isActive`) — `superadmin`, `admin`, `manager`.
  - `PATCH /users/:id/toggle-blocked` (`isBlocked`) — `superadmin`, `admin`, `manager`.
  - Manager-specific rule: `if (actor.role === 'manager' && target.role !== 'employee') → 403 "Manager can only manage employee-role users"`.

- **Delete / change password** — `DELETE /users/:id`, `PATCH /users/:id/change-password` — `superadmin`, `admin` only (manager excluded); same superadmin-protection rule applies.

- **List filtering** — `GET /users`: for `manager`, the `role` query filter is silently overridden to `employee` — a manager can never list managers/admins/superadmins, regardless of what they pass in.

---

## 6. `isActive` / `isBlocked` flags

Independent booleans on `User`, orthogonal to `role`:

| Flag | Default | Meaning |
|---|---|---|
| `isActive` | `true` | general on/off switch |
| `isBlocked` | `false` | explicit suspension |

Checked in `ensureUserCanLogin` at login, refresh, and `GET /auth/me` — **not** re-checked by `AccessTokenGuard`/`RolesGuard` on every other request (see [§4](#consequence-role-changes-are-not-instant)). There is no `isVerified`/email-verification concept in this system.

---

## 7. Full endpoint access map

Legend: **SA** = superadmin, **A** = admin, **M** = manager, **E** = employee, **Public** = no auth required.

### Auth — `/auth`
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | |
| POST | `/auth/refresh` | Public | re-validates `isActive`/`isBlocked` |
| POST | `/auth/logout` | Public | |
| GET | `/auth/me` | SA, A, M, E | re-fetches from DB — catches blocked/inactive users even with a valid token |

### Companies — `/companies` (class-level `@Roles('superadmin')`)
All CRUD + logo upload + toggle-status: **SA only**. The only resource exclusively superadmin end-to-end (top of the tenancy tree).

### Branches — `/branches` (class-level `@Roles('superadmin','admin')`)
All CRUD: **SA, A** (admin scoped to own company). No manager/employee access.

### Departments — `/departments` (class-level `@Roles('superadmin','admin','manager')`)
All CRUD: **SA, A, M** (admin → own company; manager → own branch). No employee access.

### Positions — `/positions` (class-level `@Roles('superadmin','admin','manager')`)
All CRUD: **SA, A, M**. Manager must supply `departmentId`, and that department must belong to the manager's branch.

### Users — `/users`
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/users` | SA, A | manager excluded |
| GET | `/users` | SA, A, M | manager forced to `role=employee`, own branch |
| GET | `/users/:id` | SA, A, M | scope-checked |
| PATCH | `/users/me` | SA, A, M | own profile, no scope check (always acts on `actor.sub`) |
| POST | `/users/me/avatar` | SA, A, M | own avatar |
| PATCH | `/users/:id` | SA, A, M | manager can't set role/companyId/branchId |
| POST | `/users/:id/avatar` | SA, A, M | |
| POST | `/users/:id/face-image` | SA, A | manager excluded |
| PATCH | `/users/:id/toggle-status` | SA, A, M | manager: employee-role targets only |
| PATCH | `/users/:id/toggle-blocked` | SA, A, M | manager: employee-role targets only |
| PATCH | `/users/:id/change-password` | SA, A | manager excluded |
| DELETE | `/users/:id` | SA, A | manager excluded |

**Gap**: `employee` has zero endpoints in this controller — not even `PATCH /users/me` for their own profile, despite `/auth/me` being readable by them.

### Attendance — `/attendance` (no class-level `@Roles`, all method-level)
| Method | Path | Roles |
|---|---|---|
| GET | `/attendance/kpi-template/:companyId` | SA, A |
| PUT | `/attendance/kpi-template` | SA, A |
| POST | `/attendance/check-in` | SA, A, M |
| POST | `/attendance/check-out` | SA, A, M |
| GET | `/attendance` | SA, A, M |
| GET | `/attendance/:id` | SA, A, M |

No `employee` access — self check-in/out happens via the Turnstile device webhook (public + shared secret), not this API.

### Advances — `/advances` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**. No employee self-service.

### Employee Leave — `/employee-leaves` (no class-level `@Roles`) — the one module with real per-role differentiation
| Method | Path | Roles | Notes |
|---|---|---|---|
| POST | `/employee-leaves` | SA, A | direct grant, bypasses approval |
| POST | `/employee-leaves/request` | **E only** | the only self-service create endpoint for employees in the whole API |
| PATCH | `/employee-leaves/:id/approve` | SA, A, M | |
| PATCH | `/employee-leaves/:id/reject` | SA, A, M | |
| GET | `/employee-leaves` | SA, A, M, E | employee sees own leaves only |
| GET | `/employee-leaves/:id` | SA, A, M, E | employee-owned check enforced |
| PATCH | `/employee-leaves/:id` | SA, A | no manager, no employee |
| DELETE | `/employee-leaves/:id` | SA, A | no manager, no employee |

### Holidays — `/holidays` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**. No employee access.

### Notifications — `/notifications` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**. No employee self-service to read/mark-read their own notifications.

### Payrolls — `/payrolls` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD + `GET /payrolls/stats` + `PATCH /payrolls/:id/pay`: **SA, A, M**. No employee visibility into their own payroll.

### Push Tokens — `/push-tokens` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**. (Employees register push tokens implicitly via `login`/`logout` body fields on the public auth endpoints, not this controller.)

### Raw Attendance Logs — `/raw-attendance-logs` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**.

### Refresh Tokens — `/refresh-tokens` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**. Admin-facing session-management/audit endpoint — distinct from the actual `/auth/refresh` flow.

### Salary Adjustments — `/salary-adjustments` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**.

### Settings — `/settings` (class-level `@Roles('superadmin','admin')`)
Full CRUD: **SA, A only**. No manager/employee access.

### Terminals — `/terminals` (class-level `@Roles('superadmin','admin','manager')`)
Full CRUD: **SA, A, M**.

### Work Schedules — `/work-schedules` (class-level `@Roles('superadmin','admin')`, one override)
| Method | Path | Roles |
|---|---|---|
| POST | `/work-schedules` | SA, A |
| GET | `/work-schedules` | SA, A |
| GET | `/work-schedules/:id` | SA, A |
| PATCH | `/work-schedules/:id` | SA, A |
| PATCH | `/work-schedules/:id/toggle-status` | SA, A |
| POST | `/work-schedules/:id/companies` | **SA only** (method-level override) |
| DELETE | `/work-schedules/:id/companies/:companyId` | SA, A |
| PATCH | `/work-schedules/:id/companies/:companyId/set-default` | SA, A |
| PATCH | `/work-schedules/:id/assign-user` | SA, A |
| PATCH | `/work-schedules/:id/unassign-user` | SA, A |
| DELETE | `/work-schedules/:id` | SA, A |

### App Versions — `/app-versions` (class-level `@Roles('superadmin','admin')`)
Full CRUD: **SA, A only**.

### Turnstile — `/turnstile`
| Method | Path | Roles |
|---|---|---|
| POST | `/turnstile/logs` | Public — shared-secret header (`x-turnstile-secret`) instead of role |

---

## 8. Cross-cutting notes

1. **Two-layer model**: coarse `@Roles()` endpoint gate + manual row-level scoping in services (`scope.util.ts`). The two aren't structurally linked — a new service method must remember to call the scope helpers itself.
2. **`employee` has almost no API surface**: only `GET /auth/me`, `POST /employee-leaves/request`, and read of own `/employee-leaves`. Notably missing from `PATCH /users/me` and `POST /users/me/avatar`, which looks like an oversight given the app otherwise implies an employee-facing mobile client (face photo, push tokens, avatar).
3. **Manager is the most heavily restricted privileged role**: forced company+branch scope, can only touch `employee`-role targets, cannot set `role`/`companyId`/`branchId` on anyone, cannot create users at all.
4. **Superadmin-of-superadmin protection**: `admin` cannot edit/delete/change-password of a `superadmin` account even though the route's `@Roles` nominally includes `admin` — the extra check is in the service layer.
5. **Role/company/branch changes require a token refresh** to take effect, since they're embedded in the stateless JWT and only re-validated at `/auth/refresh` and `/auth/me`.
6. **No data-driven permission system** — changing what a role can do requires an application code change (editing `@Roles(...)` calls), not a config/DB change.
7. **Turnstile ingestion is a separate trust boundary** — shared-secret auth, not JWT/role-based; if `TURNSTILE_SHARED_SECRET` is unset, the endpoint is open.
8. **Stale-token window**: `isActive`/`isBlocked` are enforced only at login/refresh/`me` — a blocked user's existing access token (up to 20 days) still works on every other endpoint until it expires or refresh is attempted.

---

## Key file reference

| Concern | File |
|---|---|
| Role enum | `prisma/schema.prisma` (`enum UserRole`) |
| User model | `prisma/schema.prisma` (`model User`) |
| `@Roles` decorator | `src/common/decorators/roles.decorator.ts` |
| `@Public` decorator | `src/common/decorators/public.decorator.ts` |
| Metadata keys | `src/common/constants/auth-metadata.constants.ts` |
| `RolesGuard` | `src/common/guards/roles.guard.ts` |
| `AccessTokenGuard` | `src/common/guards/access-token.guard.ts` |
| `UserThrottlerGuard` | `src/common/guards/user-throttler.guard.ts` |
| Global guard registration | `src/app.module.ts` |
| Company/branch scope helpers | `src/common/utils/scope.util.ts` |
| JWT payload interfaces | `src/modules/auth/interfaces/access-token-payload.interface.ts`, `src/modules/auth/interfaces/auth-user-payload.interface.ts` |
| `@CurrentUser` decorator | `src/modules/auth/decorators/current-user.decorator.ts` |
| Auth controller/service/token service | `src/modules/auth/controllers/auth.controller.ts`, `src/modules/auth/services/auth.service.ts`, `src/modules/auth/services/token.service.ts` |
| Role assignment/change logic | `src/modules/user/user.controller.ts`, `src/modules/user/user.service.ts`, `src/modules/user/dto/create-user.dto.ts` |
| Bootstrap seed | `prisma/seed.ts` |
| Turnstile shared-secret auth | `src/modules/turnstile/turnstile.controller.ts`, `src/modules/turnstile/turnstile.service.ts` |
