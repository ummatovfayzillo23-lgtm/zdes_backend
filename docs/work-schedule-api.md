# Work Schedule API

Base path: `/work-schedules`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin` on the whole controller — a few sub-endpoints narrow this further (see each section)

## Architecture: one schedule, many companies

A `WorkSchedule` is a shift **template** (name, start/end time, work days, grace minutes) owned by the company that created it (`WorkSchedule.companyId`, the *owner*). It can be **attached** to other companies for reuse via the `WorkScheduleCompany` join table, so one template no longer has to be duplicated per company.

Everything that is inherently per-company lives on the join row (`WorkScheduleCompany`), not on the schedule itself:

| Field | Lives on | Meaning |
|---|---|---|
| `name`, `startTime`, `endTime`, `workDays`, `graceMinutes`, `isActive` | `WorkSchedule` | shared by every company using the template |
| `companyId` (link), `branchId`, `isDefault` | `WorkScheduleCompany` | scoped to **one** company's use of the template |

So the same "09:00–18:00" template can be company A's default, attached-but-not-default in company B, and not attached at all in company C.

## Scoping rules (applies to every endpoint)

| Role | companyId | Behavior |
|---|---|---|
| `superadmin` | must be provided explicitly on create (`companyId` in body) | can act on any company |
| `admin` | auto-filled from the admin's own token | can only act within their own company; sending a different `companyId` throws `403 Forbidden` |

- **Owner-only actions** (`update`, `toggle-status`, `delete`): only the owning company's admin (or superadmin) may perform these — they change the template for every company using it.
- **Attach to a new company**: `superadmin` only, since it crosses company boundaries.
- **Detach / set-default for a company**: that company's own admin (or superadmin) — self-service, doesn't require owning the template.
- **Read** (`findOne`, and anything scoped by `findAll`): allowed if the actor's company owns the schedule **or** has it attached.

`branchId` is optional everywhere it appears. If provided, it must belong to the resolved `companyId` or a `409 Conflict` is thrown.

---

## Data model

**`WorkSchedule` (template, response shape via `findOne`/`create`/`update`)**

```ts
{
  id: string;                // uuid
  ownerCompanyId: string;    // uuid — the company that created it; only it can edit/delete
  name: string;               // unique per ownerCompanyId
  startTime: string;          // "HH:mm"
  endTime: string;            // "HH:mm"
  workDays: number[];         // 1=Monday ... 7=Sunday
  graceMinutes: number;       // default 0, allowed late minutes before counted as "late"
  isActive: boolean;          // default true — deactivating hides it everywhere it's attached
  companies: {                // every company this schedule is attached to, including the owner
    companyId: string;
    branchId: string | null;
    isDefault: boolean;       // is this the default schedule for THAT company
    attachedAt: string;
  }[];
  createdAt: string;
  updatedAt: string;
}
```

**List item shape (`GET /work-schedules`)** — flattened per (schedule × company) attachment, since a schedule attached to 3 companies produces 3 rows:

```ts
{
  id: string;             // WorkSchedule id
  ownerCompanyId: string;
  companyId: string;      // the company this row is scoped to
  branchId: string | null;
  isDefault: boolean;
  name, startTime, endTime, workDays, graceMinutes, isActive: ...;
  attachedAt: string;
  createdAt: string;
  updatedAt: string;
}
```

### `isDefault` semantics (backend-controlled, not client input)

- Creating a schedule **without** `userId` → the owner company's attachment automatically becomes `isDefault: true`, clearing any other default **for that company**.
- Creating a schedule **with** `userId` → the owner company's attachment is `isDefault: false`, and the schedule is assigned directly to that user.
- Only one attachment per company can have `isDefault: true` at a time (enforced per-company, not globally — a schedule can be default in several companies simultaneously).
- To promote a schedule to be a company's default later, use `PATCH /work-schedules/:id/companies/:companyId/set-default`.
- Attendance calculation fallback: if a user has no individually assigned schedule (`user.workScheduleId` is `null`), attendance uses the `isDefault: true` + `isActive: true` attachment for **that user's company**.

---

## Endpoints

### 1. Create work schedule

`POST /work-schedules`

Creates a new template **and** its first attachment (to the owner company).

**Request body** (`CreateWorkScheduleDto`)

```json
{
  "companyId": "b1e7c1b2-....",     // required for superadmin, ignored/auto-filled for admin — becomes the OWNER
  "branchId": "a2f8d3c4-....",      // optional, scopes the owner company's attachment
  "name": "Standart ish kuni",
  "startTime": "09:00",
  "endTime": "18:00",
  "workDays": [1, 2, 3, 4, 5],
  "graceMinutes": 15,               // optional, default 0, 0-120
  "userId": "c3a9e5f6-...."          // optional — if present, schedule is assigned to this user only (not the company default)
}
```

**Errors**
- `404 Not Found` — company / branch / user not found
- `409 Conflict` — branch doesn't belong to company; user belongs to another company; schedule name already exists for that owner company

---

### 2. List work schedules

`GET /work-schedules`

**Query params** (`WorkScheduleQueryDto`) — `companyId` now filters by **attachment**, not ownership (so an admin sees every schedule usable in their company, whether they own it or it was shared with them).

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored for `admin` (auto-scoped to own company) |
| `branchId` | uuid | filters by the attachment's branch |
| `search` | string | matches `name` (case-insensitive `contains`) |
| `isDefault` | boolean | filters by the attachment's `isDefault` |
| `isActive` | boolean | filters by the template's `isActive` |
| `page` / `limit` | int | pagination, `limit` max 100 |

---

### 3. Get one work schedule

`GET /work-schedules/:id`

Returns the template plus **every company it's attached to** (see `companies[]` in the data model above) — the direct way to answer "which companies use this schedule".

**Errors**
- `404 Not Found`
- `403 Forbidden` — actor's company neither owns nor has this schedule attached

---

### 4. Update work schedule

`PATCH /work-schedules/:id` — **owner company only**

Edits the shared template fields. Cannot touch `companyId`, `branchId`, or `userId` (those live on attachments now).

```json
{
  "name": "Yangilangan nomi",
  "startTime": "08:30",
  "endTime": "17:30",
  "workDays": [1, 2, 3, 4, 5, 6],
  "graceMinutes": 10
}
```

**Errors** — `403 Forbidden` if actor isn't the owner company; `409 Conflict` on duplicate name; `404` if not found.

---

### 5. Toggle active status

`PATCH /work-schedules/:id/toggle-status` — **owner company only**

```json
{ "isActive": false }
```

Deactivates the template everywhere it's attached (affects every company using it). If `isActive` is omitted, it flips the current value.

---

### 6. Attach to another company

`POST /work-schedules/:id/companies` — **superadmin only** (crosses company boundaries)

```json
{
  "companyId": "d4f1a2b3-....",
  "branchId": "e5a2b3c4-....",   // optional, must belong to companyId
  "isDefault": false             // optional, default false
}
```

**Errors**
- `404 Not Found` — schedule / company / branch not found
- `409 Conflict` — already attached to that company

---

### 7. Detach from a company

`DELETE /work-schedules/:id/companies/:companyId` — that company's admin, or superadmin

Cannot detach the **owner** company (delete the schedule instead). Any users of that company currently on this schedule are reset to `workScheduleId: null` (they fall back to their company's default).

**Errors**
- `403 Forbidden` — admin targeting a company that isn't their own
- `409 Conflict` — `companyId` is the owner
- `404 Not Found` — not attached to that company

---

### 8. Set as a company's default

`PATCH /work-schedules/:id/companies/:companyId/set-default` — that company's admin, or superadmin

No request body. Marks this schedule as `isDefault: true` for `companyId` and clears `isDefault` on every other schedule attached to that same company. Does not affect other companies' defaults.

**Errors** — `404 Not Found` if not attached to that company; `403 Forbidden` if admin targets another company.

---

### 9. Assign to user

`PATCH /work-schedules/:id/assign-user`

```json
{ "userId": "c3a9e5f6-...." }
```

Sets `user.workScheduleId = id`. Requires the schedule to be **attached to the user's company** (owner or via attach) — otherwise `409 Conflict`.

---

### 10. Unassign from user

`PATCH /work-schedules/:id/unassign-user`

```json
{ "userId": "c3a9e5f6-...." }
```

Sets `user.workScheduleId = null`. The user then falls back to their company's `isDefault: true` attachment for attendance calculation, if one exists.

---

### 11. Delete work schedule

`DELETE /work-schedules/:id` — **owner company only**

Cascades: every `WorkScheduleCompany` attachment is deleted; any user still on this schedule (in any company) falls back to `workScheduleId: null`.

---

## Error format (all endpoints)

```json
{
  "statusCode": 409,
  "message": "Work schedule name already exists for this company",
  "error": "Conflict"
}
```

| Code | When |
|---|---|
| `403 Forbidden` | actor tries to touch a company/branch/schedule outside their scope |
| `404 Not Found` | company / branch / user / schedule / attachment not found |
| `409 Conflict` | duplicate name, branch/user mismatch, already attached, detaching the owner |

---

## How this ties into Attendance

`AttendanceService.findEmployeeOrThrow` resolves the *effective* schedule for a check-in/check-out as:

1. `user.workScheduleId` → the individually assigned schedule, if set.
2. Otherwise → the `WorkScheduleCompany` row where `companyId = user.companyId`, `isDefault: true`, and the linked schedule's `isActive: true`.
3. If neither exists, no late/early/overtime metrics are computed (only raw worked minutes).
