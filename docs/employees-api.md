# Employees API (User module)

Base path: `/users`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: **not** set at controller level — each route declares its own `@Roles(...)`. No `@Public()` route exists.

A `User` row is both an account (login/password/role) **and** an employee profile (name, phone, salary, department, face photo, etc.) — there is no separate "Employee" model. `role: employee` is just one of four `UserRole` values (`superadmin | admin | manager | employee`); superadmin/admin/manager accounts are also rows in the same table and are returned by the same endpoints unless filtered out.

---

## Endpoint & role summary

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `POST` | `/users` | `superadmin`, `admin` | Create a user/employee |
| `GET` | `/users` | `superadmin`, `admin`, `manager` | List/search/filter users |
| `GET` | `/users/:id` | `superadmin`, `admin`, `manager` | Get one user |
| `PATCH` | `/users/me` | `superadmin`, `admin`, `manager` | Update **own** profile (self-service) |
| `POST` | `/users/me/avatar` | `superadmin`, `admin`, `manager` | Upload **own** avatar (multipart, field `file`) |
| `PATCH` | `/users/:id` | `superadmin`, `admin`, `manager` | Update another user |
| `POST` | `/users/:id/avatar` | `superadmin`, `admin`, `manager` | Upload avatar for another user |
| `POST` | `/users/:id/face-image` | `superadmin`, `admin` | Upload face-recognition reference photo (used by Attendance) |
| `PATCH` | `/users/:id/toggle-status` | `superadmin`, `admin`, `manager` | Activate/deactivate |
| `PATCH` | `/users/:id/toggle-blocked` | `superadmin`, `admin`, `manager` | Block/unblock |
| `PATCH` | `/users/:id/change-password` | `superadmin`, `admin` | Reset a user's password |
| `DELETE` | `/users/:id` | `superadmin`, `admin` | Delete a user |

`employee` role has no access to this controller at all (employees don't manage their own account through this API beyond `PATCH /users/me` and avatar upload, which are open to every role that can authenticate — though in practice only staff roles use them since employees aren't `@Roles`-listed here).

---

## Scoping rules — who can see/manage whom

Same shared helpers as every other module (`src/common/utils/scope.util.ts`), applied identically to `findAll` (`getScope`) and to every single-record operation (`checkUserAccess`, which wraps `checkAccess` and adds one more manager-only rule):

| Role | `companyId` | `branchId` | `role` filter | Extra rule |
|---|---|---|---|---|
| `superadmin` | free | free | free — can list/create/edit any role incl. `superadmin` | none |
| `admin` | forced to own company; foreign value → `403` | free within own company | free (any role) | cannot create/edit/delete a `superadmin` user, and cannot promote anyone to `superadmin` (`403`) |
| `manager` | forced to own company | **forced to own branch** | **forced to `employee`** — the `role` query param is silently ignored/overridden | can only see/touch users whose `role === 'employee'`; touching an admin/manager/superadmin (even in-scope) → `403 "Manager can only manage employee-role users"`. Also cannot send `role`, `companyId`, or `branchId` on update at all (even unchanged) → `403 "Manager cannot change role, company or branch"` |

**List (`GET /users`)** applies the company/branch/role forcing to filter results. **Every other endpoint** (`findOne`, `update`, avatar/face-image uploads, toggle-status, toggle-blocked, change-password, delete) loads the target row first, then checks it against the actor's scope — a manager requesting `GET /users/:id` for an admin in their own company still gets `403`, not `404`, because the scope check runs after the row is found.

`PATCH /users/me` and `POST /users/me/avatar` have **no scope check** — they always operate on `actor.sub` (the caller's own id), so any authenticated staff role can update their own profile/avatar regardless of company/branch.

---

## Data model — fields returned by every endpoint (`USER_SELECT`)

```ts
{
  id: string;
  login: string;
  role: 'superadmin' | 'admin' | 'manager' | 'employee';
  companyId: string | null;
  branchId: string | null;
  departmentId: string | null;
  positionId: string | null;
  managerId: string | null;
  workScheduleId: string | null;
  employeeNo: string | null;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  passportSerial: string | null;
  dateOfBirth: string | null;   // ISO date
  avatarUrl: string | null;
  faceDeviceUserId: string | null;
  faceImageUrl: string | null;  // reference photo used by Attendance face verification
  baseSalary: number | null;
  isActive: boolean;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}
```

`passwordHash` and `faceDescriptor` are **never** returned by any endpoint (not in `USER_SELECT`).

---

## Endpoints

### 1. Create user

`POST /users`

Roles: `superadmin`, `admin`

**Request body** (`CreateUserDto`)

```json
{
  "login": "aziz.karimov",             // required, 3-255 chars, unique
  "password": "StrongPass1",           // required, 6-255 chars
  "role": "employee",                  // optional, UserRole — non-superadmin actor cannot set "superadmin" (403)
  "companyId": "b1e7c1b2-....",        // required for superadmin (nullable=global user if omitted); auto-filled/forced for admin
  "branchId": "a2f8d3c4-....",         // optional, must belong to companyId
  "departmentId": "...",               // optional, must belong to companyId
  "positionId": "...",                 // optional, must belong to companyId
  "managerId": "...",                  // optional, any existing user id
  "workScheduleId": "...",             // optional
  "employeeNo": "EMP-0042",            // optional, unique per company
  "firstName": "Aziz",
  "lastName": "Karimov",
  "middleName": "Anvarovich",
  "phone": "+998901234567",
  "email": "aziz@example.com",         // optional, unique
  "address": "Tashkent, ...",
  "passportSerial": "AB1234567",
  "dateOfBirth": "1995-04-12",
  "baseSalary": 4000000                // optional, >= 0, up to 2 decimals
}
```

**Errors**
- `400 Bad Request` — validation failures (missing `login`/`password`, malformed email/UUID/date)
- `403 Forbidden` — non-superadmin trying to set `role: superadmin`; admin sending a foreign `companyId`
- `404 Not Found` — referenced `companyId`/`branchId`/`departmentId`/`positionId`/`managerId`/`workScheduleId` doesn't exist
- `409 Conflict` — `login` or `email` already taken; `employeeNo` already used in that company; branch/department/position doesn't belong to the resolved company

---

### 2. List / search employees

`GET /users`

Roles: `superadmin`, `admin`, `manager`

**Query params** (`UserQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored/forced for admin & manager |
| `branchId` | uuid | free for admin within their company; forced for manager |
| `departmentId` | uuid | exact match |
| `positionId` | uuid | exact match |
| `role` | enum | **ignored for manager** (always forced to `employee`); free for superadmin/admin |
| `isActive` | boolean | accepts `true`/`false` as string or boolean |
| `isBlocked` | boolean | same |
| `search` | string | case-insensitive `contains` across `login`, `firstName`, `lastName`, `phone`, `email`, `employeeNo` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

Example — admin listing their own company's employees whose name contains "aziz":
`GET /users?role=employee&search=aziz`

Example — manager listing their branch (role is forced regardless of what's sent):
`GET /users?isActive=true`

**Response `200`**

```json
{
  "items": [ { "...": "see data model above" } ],
  "total": 24,
  "page": 1,
  "limit": 10,
  "totalPages": 3,
  "stats": { "superadmin": 0, "admin": 1, "manager": 3, "employee": 20 }
}
```

`stats` is a role breakdown computed over the **same scope + non-role filters** (company/branch/department/position/isActive/isBlocked/search) but **independent of the `role` query param itself** — so even if you filter `role=employee`, `stats` still shows the full breakdown of everyone else visible in that scope, not just employees. For a manager, `stats` in practice only ever shows a non-zero `employee` count, since a manager's branch scope never includes non-employee users.

If nothing matches, `items: []`, `total: 0` — not a `404`.

---

### 3. Get one user

`GET /users/:id`

Roles: `superadmin`, `admin`, `manager`

**Response `200`** — one item, same shape as in the list.

**Errors**
- `404 Not Found`
- `403 Forbidden` — outside actor's company/branch scope, or (manager) target isn't `role: employee`

---

### 4. Update own profile

`PATCH /users/me`

Roles: `superadmin`, `admin`, `manager` (operates on the caller, no id needed)

**Request body** (`UpdateOwnProfileDto` — subset of create, all optional)

```json
{
  "firstName": "Aziz",
  "lastName": "Karimov",
  "middleName": "Anvarovich",
  "phone": "+998901234567",
  "email": "aziz@example.com",
  "address": "Tashkent, ...",
  "passportSerial": "AB1234567",
  "dateOfBirth": "1995-04-12"
}
```

Notably **cannot** change `login`, `role`, `companyId`, `branchId`, `baseSalary`, `employeeNo`, or `avatarUrl` through this endpoint — avatar is a separate upload-only endpoint (`POST /users/me/avatar`), and everything else requires an admin/superadmin via `PATCH /users/:id`.

**Errors**: `409 Conflict` if the new `email` is already used by another user.

---

### 5. Upload own / another user's avatar

`POST /users/me/avatar` (self) or `POST /users/:id/avatar` (target, roles: `superadmin`, `admin`, `manager`, scope-checked same as update)

`multipart/form-data`, field name `file` (image). Stores the uploaded file locally under `avatars/` and sets `avatarUrl` to the built URL.

**Errors**: `400 Bad Request` if no file is provided; `404`/`403` on the `:id` variant if the target doesn't exist or is out of scope.

---

### 6. Upload face-recognition reference photo

`POST /users/:id/face-image`

Roles: `superadmin`, `admin` only (no manager)

`multipart/form-data`, field `file`. Sets `faceImageUrl`, which the Attendance module's check-in/check-out face verification compares against (see `docs/attendance-api.md`). Without this photo set, an employee cannot check in/out at all (`409 Conflict "Employee does not have a reference face image"`).

---

### 7. Update user

`PATCH /users/:id`

Roles: `superadmin`, `admin`, `manager`

**Request body** (`UpdateUserDto` — everything from `CreateUserDto` except `password`, all optional)

**Rules on top of the scope table above:**
- Non-superadmin cannot touch a user who currently is `role: superadmin`, and cannot set `role: superadmin` on anyone → `403`.
- Non-superadmin sending a `companyId` different from their own → `403`.
- **Manager** sending `role`, `companyId`, or `branchId` at all in the body — even the same value — → `403 "Manager cannot change role, company or branch"`. A manager may only edit the other profile/HR fields (name, phone, department, position, salary, etc.) of employees in their own branch.

**Errors**: same `404`/`409` set as create for referenced ids/uniqueness, plus `403` per the rules above.

---

### 8. Toggle active / blocked status

`PATCH /users/:id/toggle-status` and `PATCH /users/:id/toggle-blocked`

Roles: `superadmin`, `admin`, `manager` (scope-checked same as update)

**Request body** — both optional:
```json
{ "isActive": false }
```
```json
{ "isBlocked": true }
```
If the field is omitted, the current value is simply **flipped**. `isBlocked: true` typically means the account is locked out (e.g. can't log in / check in) independent of `isActive`.

---

### 9. Change password

`PATCH /users/:id/change-password`

Roles: `superadmin`, `admin` only

```json
{ "newPassword": "NewStrongPass1" }
```

**Errors**: `403 Forbidden` if a non-superadmin actor targets a `superadmin` user's password.

---

### 10. Delete user

`DELETE /users/:id`

Roles: `superadmin`, `admin` only

**Response `200`**: `{ "success": true, "id": "..." }`

**Errors**: `403 Forbidden` if a non-superadmin actor targets a `superadmin` user; `404 Not Found`.

---

## Error format (all endpoints)

```json
{ "statusCode": 403, "message": "Manager can only manage employee-role users", "error": "Forbidden" }
```

| Code | When |
|---|---|
| `400 Bad Request` | validation failures; missing uploaded file |
| `403 Forbidden` | outside company/branch scope; manager targeting a non-employee; touching/creating a superadmin as non-superadmin; manager changing role/company/branch |
| `404 Not Found` | user / company / branch / department / position / manager / work schedule not found |
| `409 Conflict` | login/email/employeeNo already taken; branch/department/position doesn't belong to the resolved company |

---

## Relations & dependencies

- **`baseSalary`** here is just a reference field on the profile — it is **not** read automatically by Payroll (`docs/payroll-api.md`); payroll totals are entered manually per month, independent of this value.
- **`faceImageUrl`** is required before Attendance check-in/check-out will succeed (`docs/attendance-api.md`).
- A user can be referenced by `Attendance`, `RawAttendanceLog`, `SalaryAdjustment`, `Advance`, `EmployeeLeave`, `Payroll`, `Notification`, `RefreshToken`, and `PushToken` rows (all `onDelete: Cascade` from `User`, except `manager`/`workSchedule`/`department`/`position`/`branch`/`company` links which are `SetNull`) — deleting a user deletes all of their attendance/payroll/advance/adjustment/leave/notification/token history along with them. There is no "soft delete"; `isActive`/`isBlocked` are the intended way to deactivate someone without losing history.
- `role: manager` users are themselves rows managed by `admin`/`superadmin` through this same API — a manager cannot self-register or promote themselves.
