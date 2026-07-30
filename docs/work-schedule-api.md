# Work Schedule API

Base path: `/work-schedules`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin` only (`@Roles('superadmin', 'admin')` on the whole controller)

## Scoping rules (applies to every endpoint)

| Role | companyId | Behavior |
|---|---|---|
| `superadmin` | must be provided explicitly on create (`companyId` in body) | can act on any company |
| `admin` | auto-filled from the admin's own token | can only act within their own company; sending a different `companyId` throws `403 Forbidden` |

`branchId` is optional everywhere. If provided, it must belong to the resolved `companyId` or a `409 Conflict` is thrown.

---

## Data model (`WorkSchedule`)

```ts
{
  id: string;              // uuid
  companyId: string;       // uuid
  branchId: string | null; // uuid
  name: string;             // unique per companyId
  startTime: string;        // "HH:mm"
  endTime: string;          // "HH:mm"
  workDays: number[];       // 1=Monday ... 7=Sunday
  graceMinutes: number;     // default 0, allowed late minutes before counted as "late"
  isDefault: boolean;       // company-wide fallback schedule (see below) — NOT settable by the client on create/update
  isActive: boolean;        // default true
  createdAt: string;        // ISO datetime
  updatedAt: string;        // ISO datetime
}
```

### `isDefault` semantics (backend-controlled, not client input)

- Creating a schedule **without** `userId` → it is a **company-wide** schedule → backend automatically sets `isDefault: true`, and clears `isDefault` on any other schedule in that company.
- Creating a schedule **with** `userId` → it is assigned to **that single user only** → backend automatically sets `isDefault: false`.
- Only one schedule per company can have `isDefault: true` at a time.
- To later promote a different existing schedule to be the company default, use `PATCH /work-schedules/:id/set-default`.
- Attendance calculation fallback: if a user has no individually assigned schedule (`user.workScheduleId` is `null`), attendance uses the company's `isDefault: true` + `isActive: true` schedule automatically.

---

## Endpoints

### 1. Create work schedule

`POST /work-schedules`

**Request body** (`CreateWorkScheduleDto`)

```json
{
  "companyId": "b1e7c1b2-....",     // required for superadmin, ignored/auto-filled for admin
  "branchId": "a2f8d3c4-....",      // optional
  "name": "Standart ish kuni",
  "startTime": "09:00",
  "endTime": "18:00",
  "workDays": [1, 2, 3, 4, 5],
  "graceMinutes": 15,               // optional, default 0, 0-120
  "userId": "c3a9e5f6-...."          // optional — if present, schedule belongs to this user only
}
```

**Validation**
- `name`: string, 1-255 chars, required
- `startTime` / `endTime`: `HH:mm` format, required
- `workDays`: array of ints 1-7, 1-7 items, required
- `graceMinutes`: int 0-120, optional
- `companyId`, `branchId`, `userId`: UUID, optional

**Response `201`**

```json
{
  "id": "5f2b6c1a-....",
  "companyId": "b1e7c1b2-....",
  "branchId": "a2f8d3c4-....",
  "name": "Standart ish kuni",
  "startTime": "09:00",
  "endTime": "18:00",
  "workDays": [1, 2, 3, 4, 5],
  "graceMinutes": 15,
  "isDefault": true,
  "isActive": true,
  "createdAt": "2026-07-29T06:00:00.000Z",
  "updatedAt": "2026-07-29T06:00:00.000Z"
}
```

**Errors**
- `404 Not Found` — company / branch / user not found
- `409 Conflict` — branch doesn't belong to company; user belongs to another company; schedule name already exists in company

---

### 2. List work schedules

`GET /work-schedules`

**Query params** (`WorkScheduleQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored for `admin` (auto-scoped) |
| `branchId` | uuid | |
| `search` | string | matches `name` (case-insensitive `contains`) |
| `isDefault` | boolean | `true`/`false` |
| `isActive` | boolean | `true`/`false` |
| `page` | int, default `1` | |
| `limit` | int, default `10`, max `100` | |

Example: `GET /work-schedules?search=standart&isActive=true&page=1&limit=10`

**Response `200`**

```json
{
  "items": [
    {
      "id": "5f2b6c1a-....",
      "companyId": "b1e7c1b2-....",
      "branchId": null,
      "name": "Standart ish kuni",
      "startTime": "09:00",
      "endTime": "18:00",
      "workDays": [1, 2, 3, 4, 5],
      "graceMinutes": 15,
      "isDefault": true,
      "isActive": true,
      "createdAt": "2026-07-29T06:00:00.000Z",
      "updatedAt": "2026-07-29T06:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

### 3. Get one work schedule

`GET /work-schedules/:id`

**Response `200`** — same shape as a single item above.

**Errors**
- `404 Not Found` — not found
- `403 Forbidden` — belongs to another company/branch than actor's scope

---

### 4. Update work schedule

`PATCH /work-schedules/:id`

**Request body** (`UpdateWorkScheduleDto` — all fields from create, all optional; `isDefault` is not part of the DTO — it can never be set here)

```json
{
  "name": "Yangilangan nomi",
  "startTime": "08:30",
  "endTime": "17:30",
  "workDays": [1, 2, 3, 4, 5, 6],
  "graceMinutes": 10,
  "branchId": null
}
```

**Response `200`** — updated schedule object (same shape as create response).

**Errors** — same as create, plus `404` if the schedule itself doesn't exist.

**Note:** to reassign a schedule between users, use `assign-user` / `unassign-user` below, not this endpoint.

---

### 5. Toggle active status

`PATCH /work-schedules/:id/toggle-status`

**Request body** (`ToggleWorkScheduleStatusDto`)

```json
{ "isActive": false }
```

If `isActive` is omitted, it flips the current value.

**Response `200`** — updated schedule object.

---

### 6. Set as company default

`PATCH /work-schedules/:id/set-default`

No request body.

Marks this schedule as `isDefault: true` and clears `isDefault` on every other schedule in the same company.

**Response `200`** — updated schedule object (`isDefault: true`).

---

### 7. Assign to user

`PATCH /work-schedules/:id/assign-user`

**Request body** (`AssignUserDto`)

```json
{ "userId": "c3a9e5f6-...." }
```

Sets `user.workScheduleId = id`. Fails if the user belongs to a different company than the schedule.

**Response `200`**

```json
{
  "id": "c3a9e5f6-....",
  "login": "j.doe",
  "companyId": "b1e7c1b2-....",
  "workScheduleId": "5f2b6c1a-...."
}
```

**Errors**
- `404 Not Found` — schedule or user not found
- `409 Conflict` — schedule and user belong to different companies

---

### 8. Unassign from user

`PATCH /work-schedules/:id/unassign-user`

**Request body** (`AssignUserDto`)

```json
{ "userId": "c3a9e5f6-...." }
```

Sets `user.workScheduleId = null`. The user then falls back to the company's `isDefault: true` schedule for attendance calculation (if one exists).

**Response `200`**

```json
{
  "id": "c3a9e5f6-....",
  "login": "j.doe",
  "companyId": "b1e7c1b2-....",
  "workScheduleId": null
}
```

---

### 9. Delete work schedule

`DELETE /work-schedules/:id`

**Response `200`**

```json
{ "success": true, "id": "5f2b6c1a-...." }
```

**Errors**
- `404 Not Found`
- `403 Forbidden` — outside actor's scope

---

## Error format (all endpoints)

Standard Nest exception shape:

```json
{
  "statusCode": 409,
  "message": "Work schedule name already exists for this company",
  "error": "Conflict"
}
```

| Code | When |
|---|---|
| `403 Forbidden` | actor tries to touch a company/branch outside their scope |
| `404 Not Found` | company / branch / user / schedule not found |
| `409 Conflict` | duplicate name, branch/user mismatch with company |

---

## How this ties into Attendance

`AttendanceService.findEmployeeOrThrow` resolves the *effective* schedule for a check-in/check-out as:

1. `user.workScheduleId` → the individually assigned schedule, if set.
2. Otherwise → the company's `WorkSchedule` where `isDefault: true` and `isActive: true`.
3. If neither exists, no late/early/overtime metrics are computed (only raw worked minutes).
