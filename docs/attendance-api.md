# Attendance API

Base path: `/attendance`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: **not** set at controller level — each route declares its own `@Roles(...)` (see table below). Every route requires authentication; there is no `@Public()` endpoint in this controller.

An `Attendance` record is one employee's check-in/check-out for one calendar `date` (unique per `employeeId + date`). It is created/updated only through `check-in` / `check-out` (face-verified) — there is no plain "create attendance" endpoint. Late/early-leave/overtime minutes and their salary effect (`SalaryAdjustment`) are computed automatically from the employee's `WorkSchedule` at check-in/check-out time.

---

## Endpoint & role summary

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/attendance/kpi-template/:companyId` | `superadmin`, `admin` | Read a company's late/early/overtime penalty-bonus rates |
| `PUT` | `/attendance/kpi-template` | `superadmin`, `admin` | Create/update those rates |
| `POST` | `/attendance/check-in` | `superadmin`, `admin`, `manager` | Face-verified check-in |
| `POST` | `/attendance/check-out` | `superadmin`, `admin`, `manager` | Face-verified check-out |
| `GET` | `/attendance` | `superadmin`, `admin`, `manager` | List/filter/search attendance records |
| `GET` | `/attendance/:id` | `superadmin`, `admin`, `manager` | Get one attendance record |

`employee` role never appears — attendance is recorded/viewed by staff (superadmin/admin/manager) on behalf of employees, e.g. from a terminal-operator or kiosk-adjacent flow, not self-service.

---

## Scoping rules — who can see/do what

All read/write here goes through the same two helpers as the rest of the codebase (`src/common/utils/scope.util.ts`):

| Role | `companyId` | `branchId` | Effect |
|---|---|---|---|
| `superadmin` | free — any value, or omitted | free — any value, or omitted | sees/touches **any** company, **any** branch, **any** employee |
| `admin` | forced to the admin's own `companyId`; sending a different one throws `403` | **free within their own company** — can filter to one branch or omit to see the whole company | only their **own company**, any branch inside it |
| `manager` | forced to their own `companyId` | **forced to their own `branchId`**; sending a different one throws `403` | only their **own branch** |

- **List** (`GET /attendance`) and **get one** (`GET /attendance/:id`) both apply this scope — `findAll` via `resolveCompanyBranchScope`, `findOne` via `assertWithinScope` (checked against the found record's `companyId`/`branchId`).
- **Check-in / check-out**: scope is enforced against the *target employee*, not query params — `assertWithinScope(actor, employee)` throws `403` if the actor tries to check in/out an employee outside their own company (admin) or own branch (manager).
- **KPI template**: `getKpiTemplate` uses `assertWithinScope`; `upsertKpiTemplate` uses `resolveScopedCompanyId` (superadmin **must** pass `companyId`; admin's is auto-filled from the JWT and any other value is rejected with `403`).
- If a non-superadmin actor has no `companyId` (or a manager with no `branchId`) on their JWT, every one of these calls throws `403 Forbidden` — an actor must be assigned before using this API.

---

## Data model (`Attendance`)

```ts
{
  id: string;                  // uuid
  companyId: string;           // uuid
  branchId: string | null;     // uuid, inherited from the employee at creation time
  employeeId: string;          // uuid
  terminalId: string | null;   // uuid — which device the event came from, if any
  date: string;                 // ISO date (calendar day, employee's company timezone)
  checkIn: string | null;       // ISO datetime
  checkOut: string | null;      // ISO datetime
  status: AttendanceStatus;     // present | late | absent | early_leave | holiday | leave
  source: AttendanceSource;     // terminal | manual | import
  workStartTime: string | null; // "HH:mm" from the employee's WorkSchedule, snapshotted
  workEndTime: string | null;   // "HH:mm"
  workedMinutes: number;        // checkOut - checkIn, in minutes
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;
  checkInImageUrl: string | null;   // S3 URL of the face-verification snapshot
  checkOutImageUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Notes:
- `status` and the three `*Minutes` fields are **derived**, not sent by the client — they're recalculated on every check-in and check-out from `WorkSchedule.startTime/endTime/graceMinutes/workDays` plus any approved hourly `EmployeeLeave` at the start of the shift (which pushes the "must arrive by" line forward).
- If the employee has no active `WorkSchedule` for that day (inactive schedule, or the day isn't in `workDays`), late/early/overtime are all `0` and status falls back to `present`/`absent` based only on whether `checkIn`/`checkOut` exist.
- `AttendanceStatus.holiday` and `.leave` exist in the enum but are **not** set anywhere in `attendance.service.ts` today — nothing currently marks a day as `holiday` or `leave` automatically (see [Relations & dependencies](#relations--dependencies)).

---

## Endpoints

### 1. Get KPI template

`GET /attendance/kpi-template/:companyId`

Roles: `superadmin`, `admin`

Returns the per-minute penalty/bonus rates used to auto-generate `SalaryAdjustment`s from lateness/early-leave/overtime. If the company has never saved one, returns the **default template** (not `404`):

```json
{
  "companyId": "b1e7c1b2-....",
  "latePenaltyPerMinute": 0,
  "earlyLeavePenaltyPerMinute": 0,
  "overtimeBonusPerMinute": 0,
  "faceSimilarityThreshold": 90
}
```

**Errors**
- `403 Forbidden` — admin requesting a `companyId` that isn't their own
- `404 Not Found` — company doesn't exist

---

### 2. Save KPI template

`PUT /attendance/kpi-template`

Roles: `superadmin`, `admin`

**Request body** (`AttendanceKpiTemplateDto`)

```json
{
  "companyId": "b1e7c1b2-....",   // required for superadmin; ignored/auto-filled for admin
  "latePenaltyPerMinute": 1000,        // optional, default 0
  "earlyLeavePenaltyPerMinute": 1000,  // optional, default 0
  "overtimeBonusPerMinute": 1000,      // optional, default 0
  "faceSimilarityThreshold": 90        // optional, default 90, range 0-100
}
```

Upserted into the generic `Setting` table under key `attendance_kpi_template` (one row per company). `faceSimilarityThreshold` is the minimum AWS Rekognition face-match confidence (%) required for check-in/check-out to succeed.

**Errors**
- `400 Bad Request` — superadmin omitted `companyId`
- `403 Forbidden` — admin sent a `companyId` other than their own
- `404 Not Found` — company doesn't exist

---

### 3. Check in

`POST /attendance/check-in`

Roles: `superadmin`, `admin`, `manager`

**Request body** (`AttendanceCheckInDto`)

```json
{
  "employeeId": "3c9e5f6a-....",       // required
  "terminalId": "a2f8d3c4-....",       // optional — must belong to the employee's company
  "imageBase64": "/9j/4AAQ...",         // required, raw base64 or data URI, min 10 chars
  "contentType": "image/jpeg",          // optional, defaults from the decoded image
  "eventTime": "2026-06-08T09:05:00.000Z", // optional ISO datetime, defaults to now()
  "notes": "Late due to traffic"        // optional, max 1000 chars
}
```

**What happens, in order:**
1. `assertWithinScope(actor, employee)` — actor must be allowed to touch this employee (own company for admin, own branch for manager).
2. Employee must exist, be `isActive`, not `isBlocked`, and have a `companyId` — otherwise `404`/`409`/`403`.
3. `terminalId` (if sent) must belong to the employee's company (`404`/`409` otherwise).
4. The employee must have a `faceImageUrl` (reference photo) — otherwise `409 Conflict`.
5. The submitted photo is compared against the reference photo via AWS Rekognition; if similarity is below the company's `faceSimilarityThreshold`, the verification service rejects it.
6. If today's record already has a `checkIn`, throws `409 Conflict` ("already checked in").
7. Approved **hourly** leave covering shift start is looked up and used to shift the "late" threshold forward.
8. Late/early/overtime minutes and `status` are computed from the employee's `WorkSchedule`.
9. The attendance row is created (or updated, if a check-out-only row already existed for today) inside a transaction.
10. Any late/early/overtime `SalaryAdjustment`s from a previous check-in/out for the same day are deleted and recreated based on the new numbers (idempotent re-sync), using the KPI template's rates — a rate of `0` means no adjustment row is created for that category.
11. The check-in image is uploaded to S3; its URL is stored as `checkInImageUrl`.
12. If the employee ended up late (and has no approved leave covering it), a push notification is sent.

**Response `200`** — same shape as the [data model](#data-model-attendance) above, plus:
```json
{
  "...": "...",
  "faceSimilarity": 96.4,
  "appliedAdjustments": [
    { "id": "...", "type": "penalty", "category": "late", "amount": 15000, "date": "2026-06-08", "month": "2026-06", "reason": "AUTO_ATTENDANCE:<attendanceId>:late" }
  ]
}
```

**Errors**
- `400 Bad Request` — `eventTime` not a valid ISO date; empty decoded image
- `403 Forbidden` — actor outside scope of the employee; employee inactive/blocked
- `404 Not Found` — employee or terminal not found
- `409 Conflict` — employee has no company assigned; employee has no reference face photo; terminal belongs to a different company; already checked in today; face similarity below threshold (raised inside the verification service)

---

### 4. Check out

`POST /attendance/check-out`

Roles: `superadmin`, `admin`, `manager`

**Request body** (`AttendanceCheckOutDto`) — identical shape to check-in (`employeeId`, `terminalId?`, `imageBase64`, `contentType?`, `eventTime?`, `notes?`).

Same scope/employee/terminal/face-verification checks as check-in (steps 1-5 above), then:
- Throws `409 Conflict` if there's no check-in yet for today ("must check in before check out").
- Throws `409 Conflict` if already checked out today.
- Recomputes metrics using the **existing** `checkIn` and the new `checkOut` time, re-syncs `SalaryAdjustment`s the same way as check-in.
- Uploads the check-out photo, stores `checkOutImageUrl`.
- Sends a notification for every adjustment that was applied (bonus or penalty), not just for lateness.

**Response / Errors** — same shape and error set as check-in, with the "already checked in"/"must check in first" conditions swapped.

---

### 5. List attendance

`GET /attendance`

Roles: `superadmin`, `admin`, `manager`

**Query params** (`AttendanceQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored/forced for admin & manager (see scoping table) |
| `branchId` | uuid | free for admin within their company; forced for manager |
| `employeeId` | uuid | exact match on one employee |
| `search` | string | text search across the employee's `firstName`, `lastName`, `login`, `phone`, `employeeNo` (case-insensitive `contains`) — use this to find an employee by name without knowing their id |
| `terminalId` | uuid | exact match |
| `status` | enum | `present`\|`late`\|`absent`\|`early_leave`\|`holiday`\|`leave` |
| `dateFrom` / `dateTo` | ISO date | inclusive range filter on `date` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

`employeeId` and `search` can be combined with the other filters (all `AND`ed together); if you only know the employee's name, use `search` instead of `employeeId`.

Example — superadmin, all late arrivals in June for one company:
`GET /attendance?companyId=b1e7c1b2-....&status=late&dateFrom=2026-06-01&dateTo=2026-06-30`

Example — admin, searching their own company's employees by name (no need to send `companyId`, it's forced automatically):
`GET /attendance?search=aziz&branchId=a2f8d3c4-....`

**Response `200`**

```json
{
  "items": [
    {
      "id": "5f2b6c1a-....",
      "companyId": "b1e7c1b2-....",
      "branchId": "a2f8d3c4-....",
      "employeeId": "3c9e5f6a-....",
      "employee": {
        "id": "3c9e5f6a-....",
        "firstName": "Aziz",
        "lastName": "Karimov",
        "employeeNo": "EMP-0042",
        "phone": "+998901234567",
        "avatarUrl": null
      },
      "terminalId": "a2f8d3c4-....",
      "date": "2026-06-08",
      "checkIn": "2026-06-08T04:05:00.000Z",
      "checkOut": "2026-06-08T13:10:00.000Z",
      "status": "late",
      "source": "manual",
      "workStartTime": "09:00",
      "workEndTime": "18:00",
      "workedMinutes": 545,
      "lateMinutes": 5,
      "earlyLeaveMinutes": 0,
      "overtimeMinutes": 0,
      "checkInImageUrl": "https://....",
      "checkOutImageUrl": "https://....",
      "notes": null,
      "appliedAdjustments": [ ],
      "createdAt": "2026-06-08T04:05:01.000Z",
      "updatedAt": "2026-06-08T13:10:02.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

If nothing matches the filters, this returns `"items": [], "total": 0` — **not** a `404`.

**Errors**
- `403 Forbidden` — `companyId`/`branchId` outside the actor's scope; actor has no `companyId`/`branchId` assigned

---

### 6. Get one attendance record

`GET /attendance/:id`

Roles: `superadmin`, `admin`, `manager`

**Response `200`** — same shape as one item in the list above (includes `employee` and `appliedAdjustments`, omits `faceSimilarity` since it's not stored).

**Errors**
- `404 Not Found` — no attendance with that id
- `403 Forbidden` — record belongs to a company/branch outside the actor's scope

---

## Error format (all endpoints)

```json
{
  "statusCode": 409,
  "message": "Employee already checked in for this date",
  "error": "Conflict"
}
```

| Code | When |
|---|---|
| `400 Bad Request` | invalid `eventTime`; empty decoded image; superadmin omitted required `companyId` on KPI template save |
| `403 Forbidden` | actor outside their company/branch scope; employee inactive/blocked; face similarity below threshold |
| `404 Not Found` | employee / terminal / company / attendance record not found |
| `409 Conflict` | already checked in/out today; check-out attempted before check-in; employee has no reference face photo; employee has no company; terminal belongs to a different company |

---

## Relations & dependencies

- **`SalaryAdjustment`** — check-in/check-out auto-create/replace adjustment rows tagged with `reason: "AUTO_ATTENDANCE:<attendanceId>:<late|early_leave|overtime>"`, using the KPI template's per-minute rates. These feed into `payroll` module calculations; deleting/re-running check-in/out re-syncs them idempotently (old auto rows for that attendance are deleted before new ones are created).
- **`WorkSchedule`** — supplies `startTime`, `endTime`, `graceMinutes`, `workDays` used to compute lateness/overtime. If the employee has no schedule assigned directly, the company's **default** `WorkSchedule` (`WorkScheduleCompany.isDefault = true`) is used instead.
- **`EmployeeLeave`** — an **approved** leave covering the day suppresses the "absent" reminder notification entirely; an approved **hourly** leave at shift start shifts the lateness threshold forward by that many hours.
- **`Terminal`** — optional link to the physical device; must belong to the same company as the employee.
- **`RawAttendanceLog`** — a separate module/table for raw terminal event ingestion; not read or written by this controller's endpoints (check-in/out here are the "manual/app" path, `source: manual`).
- **Background job** (not an HTTP endpoint): `AttendanceService.remindAbsentAndNoCheckoutEmployees` runs every 30 minutes (`@Cron(CronExpression.EVERY_30_MINUTES)`) and pushes "you're absent" / "you forgot to check out" notifications to employees past their scheduled end time with no matching attendance state, skipping anyone with an approved leave for that day.
- **Holiday** — as noted in `docs/holiday-api.md`, `Holiday` is **not** currently consumed by this service; a holiday does not automatically set `AttendanceStatus.holiday` or suppress lateness/absence calculations today.
