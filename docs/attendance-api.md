# Attendance API

Base path: `/attendance`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: **not** set at controller level — each route declares its own `@Roles(...)` (see table below). Every route requires authentication; there is no `@Public()` endpoint in this controller.

The Attendance module has **three independent ingestion paths** that all feed the same per-day `Attendance` row:

1. **Terminal / turnstile devices** — physical hardware pushes events to `POST /turnstile/logs` (see `src/modules/turnstile`), which upserts `Attendance` directly. Not part of this controller.
2. **Operator-driven check-in/out** (`POST /attendance/check-in`/`check-out`) — `superadmin`/`admin`/`manager` check an employee in/out on their behalf (kiosk-style), one pair per employee per day.
3. **Employee self-service** (`POST /attendance/self/check-in`/`check-out`) — the employee checks themselves in/out from the app with a selfie. Unlike (2), **multiple visits per day are allowed** and each is stored as its own `AttendanceSession` row, while still updating the same daily `Attendance` summary.

Both (2) and (3) are face-verified via AWS Rekognition against the employee's stored reference photo (`User.faceImageUrl`). Late/early-leave/overtime minutes and their salary effect (`SalaryAdjustment`) are computed automatically from the employee's `WorkSchedule` on every check-in/check-out, regardless of which of the three paths produced it.

---

## Endpoint & role summary

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/attendance/kpi-template/:companyId` | `superadmin`, `admin` | Read a company's late/early/overtime penalty-bonus rates |
| `PUT` | `/attendance/kpi-template` | `superadmin`, `admin` | Create/update those rates |
| `POST` | `/attendance/check-in` | `superadmin`, `admin`, `manager` | Operator checks an employee in (face-verified) |
| `POST` | `/attendance/check-out` | `superadmin`, `admin`, `manager` | Operator checks an employee out (face-verified) |
| `POST` | `/attendance/self/check-in` | `employee` | Employee checks **themselves** in (face-verified) |
| `POST` | `/attendance/self/check-out` | `employee` | Employee checks **themselves** out (face-verified) |
| `GET` | `/attendance/self/sessions` | `employee` | List **own** check-in/out sessions |
| `GET` | `/attendance` | `superadmin`, `admin`, `manager` | List/filter/search daily attendance records |
| `GET` | `/attendance/:id` | `superadmin`, `admin`, `manager` | Get one day's attendance record |

`employee` only ever sees their own data, and only through the `self/*` routes — they have no access to `GET /attendance` / `GET /attendance/:id` (the operator-facing list/detail views).

---

## Scoping rules — who can see/do what

All read/write here goes through the same two helpers as the rest of the codebase (`src/common/utils/scope.util.ts`):

| Role | `companyId` | `branchId` | Effect |
|---|---|---|---|
| `superadmin` | free — any value, or omitted | free — any value, or omitted | sees/touches **any** company, **any** branch, **any** employee |
| `admin` | forced to the admin's own `companyId`; sending a different one throws `403` | **free within their own company** — can filter to one branch or omit to see the whole company | only their **own company**, any branch inside it |
| `manager` | forced to their own `companyId` | **forced to their own `branchId`**; sending a different one throws `403` | only their **own branch** |
| `employee` | n/a — `self/*` routes always operate on `actor.sub` | n/a | only their **own** records, never anyone else's |

- **List** (`GET /attendance`) and **get one** (`GET /attendance/:id`) both apply this scope — `findAll` via `resolveCompanyBranchScope`, `findOne` via `assertWithinScope` (checked against the found record's `companyId`/`branchId`).
- **Operator check-in / check-out**: scope is enforced against the *target employee*, not query params — `assertWithinScope(actor, employee)` throws `403` if the actor tries to check in/out an employee outside their own company (admin) or own branch (manager).
- **Self check-in / check-out / sessions**: no scope check needed — the target is always the caller (`actor.sub`), so identity is the only gate (`@Roles('employee')`).
- **KPI template**: `getKpiTemplate` uses `assertWithinScope`; `upsertKpiTemplate` uses `resolveScopedCompanyId` (superadmin **must** pass `companyId`; admin's is auto-filled from the JWT and any other value is rejected with `403`).
- If a non-superadmin actor has no `companyId` (or a manager with no `branchId`) on their JWT, every one of these calls throws `403 Forbidden` — an actor must be assigned before using this API.

---

## Data model

### `Attendance` — one row per employee per day (`@@unique([employeeId, date])`)

```ts
{
  id: string;                  // uuid
  companyId: string;           // uuid
  branchId: string | null;     // uuid, inherited from the employee
  employeeId: string;          // uuid
  terminalId: string | null;   // uuid — which device the event came from, if any

  date: string;                 // ISO date (calendar day, employee's company timezone)
  checkIn: string | null;       // ISO datetime — earliest check-in of the day
  checkOut: string | null;      // ISO datetime — latest check-out of the day

  status: AttendanceStatus;     // present | late | absent | early_leave | holiday | leave
  source: AttendanceSource;     // terminal | manual | import | mobile

  workStartTime: string | null; // "HH:mm" from the employee's WorkSchedule, snapshotted
  workEndTime: string | null;   // "HH:mm"

  workedMinutes: number;        // checkOut - checkIn, in minutes
  lateMinutes: number;
  earlyLeaveMinutes: number;
  overtimeMinutes: number;

  checkInImageUrl: string | null;   // set once, by whichever event first checked in
  checkOutImageUrl: string | null;  // overwritten by the latest checkout event
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}
```

Notes:
- `status` and the three `*Minutes` fields are **derived**, not sent by the client — they're recalculated on every check-in and check-out from `WorkSchedule.startTime/endTime/graceMinutes/workDays` plus any approved hourly `EmployeeLeave` at the start of the shift (which pushes the "must arrive by" line forward).
- If the employee has no active `WorkSchedule` for that day (inactive schedule, or the day isn't in `workDays`), late/early/overtime are all `0` and status falls back to `present`/`absent` based only on whether `checkIn`/`checkOut` exist.
- `AttendanceStatus.holiday` and `.leave` exist in the enum but are **not** set anywhere in `attendance.service.ts` today — nothing currently marks a day as `holiday` or `leave` automatically (see [Relations & dependencies](#relations--dependencies)).
- **Collapse rule**: no matter which of the three paths writes to it, `checkIn` only ever moves *earlier* and `checkOut` only ever moves *later* for a given day — "first arrival, last departure". Implemented once in `TurnstileService.getNextAttendanceTimes` (terminal path) and once in `AttendanceService.collapseAttendanceTimes` (self-service path); the operator check-in/out path instead hard-rejects a second call for the day (see below) rather than collapsing. `source` records whichever path last wrote to the row.

### `AttendanceSession` — one row per self-service visit (only written by the `self/*` routes)

```ts
{
  id: string;
  companyId: string;
  branchId: string | null;
  employeeId: string;
  attendanceId: string | null;   // the day's Attendance row this session rolled up into

  date: string;
  checkIn: string;               // ISO datetime
  checkOut: string | null;       // ISO datetime, null while the session is still open

  checkInImageUrl: string;
  checkOutImageUrl: string | null;
  checkInSimilarity: number;     // Rekognition similarity % at check-in
  checkOutSimilarity: number | null;

  workedMinutes: number;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
}
```

An employee can have **several** `AttendanceSession` rows on the same `date` (e.g. left for lunch and came back) — each is a fully independent check-in/check-out pair with its own verification photo and similarity score, on top of the single daily `Attendance` summary that all of them roll up into.

---

## Selfie upload — multipart file, not base64/URL

All four photo-taking endpoints (`check-in`, `check-out`, `self/check-in`, `self/check-out`) take the image as a **real file upload** (`multipart/form-data`, field name `file`) — the same mechanism as avatar/logo/face-image uploads (`imageUploadOptions('attendance')`, `src/common/upload/image-upload.util.ts`). Nothing accepts a base64 string or an image URL in the JSON body.

- 5MB max, `image/jpeg` / `image/png` / `image/webp` only (multer `fileFilter`).
- Saved to `uploads/attendance/<uuid>.<ext>` on local disk, served at `/uploads/attendance/<filename>`.
- If `file` is missing from the request, it fails fast with a clean `400 "file is required"` (`assertFileProvided`) before any DB/AWS work happens.
- **No S3 anywhere in this module.** AWS Rekognition only reads the uploaded file's bytes off disk for the one-shot `CompareFaces` call — it never stores or re-uploads the image itself.

---

## Face verification flow (shared by all 4 photo endpoints)

1. Load the employee, resolve their `faceImageUrl` (the reference photo, set once via `POST /users/:id/face-image`). Missing → `409 "Employee does not have a reference face image"`.
2. Read the just-uploaded selfie off disk into a buffer.
3. Call AWS Rekognition `CompareFaces` (`AwsFaceVerificationService.verifyAttendanceFace`) — source = the new selfie, target = the reference photo (fetched via `fetch()` if `faceImageUrl` is an `http(s)://` URL, or read directly from S3 if it's an `s3://bucket/key` string).
4. Compare against the company's configured `faceSimilarityThreshold` (see [KPI template](#kpi-template) below, default **90%**). Below threshold → `403 "Face verification failed"`.
5. On success, the local `uploads/attendance/...` URL and the measured similarity score are persisted.

**Reference photo must be an absolute URL.** `faceImageUrl` is uploaded to local disk the same way (`POST /users/:id/face-image`, category `faces`), and `buildUploadUrl()` prefixes it with the `APP_BASE_URL` env var so Rekognition's `fetch()` can resolve it — a bare relative path (`/uploads/faces/...`) would fail with "Failed to download reference face image". Set `APP_BASE_URL` to the server's real public URL (e.g. `https://api.yourdomain.com`) in production.

Required env vars: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (`AwsFaceVerificationService` throws `503` if any are missing). No S3 bucket or Rekognition collection env vars are needed — this is a one-shot `CompareFaces` between two images, not `IndexFaces`/face collections.

---

## Endpoints

### 1. Get KPI template

`GET /attendance/kpi-template/:companyId`

Roles: `superadmin`, `admin`

Returns the per-minute penalty/bonus rates used to auto-generate `SalaryAdjustment`s from lateness/early-leave/overtime, and the face-match threshold. If the company has never saved one, returns the **default template** (not `404`):

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

**Request body** (`AttendanceKpiTemplateDto`, JSON)

```json
{
  "companyId": "b1e7c1b2-....",        // required for superadmin; ignored/auto-filled for admin
  "latePenaltyPerMinute": 1000,        // optional, default 0
  "earlyLeavePenaltyPerMinute": 1000,  // optional, default 0
  "overtimeBonusPerMinute": 1000,      // optional, default 0
  "faceSimilarityThreshold": 90        // optional, default 90, range 0-100
}
```

Upserted into the generic `Setting` table under key `attendance_kpi_template` (one row per company, `ATTENDANCE_KPI_SETTING_KEY`).

**Errors**
- `400 Bad Request` — superadmin omitted `companyId`
- `403 Forbidden` — admin sent a `companyId` other than their own
- `404 Not Found` — company doesn't exist

---

### 3. Operator check-in

`POST /attendance/check-in`

Roles: `superadmin`, `admin`, `manager`
Content-Type: `multipart/form-data`

**Form fields** (`AttendanceCheckInDto` + `file`)

```
file: <binary>                              required — selfie/photo (image/jpeg|png|webp, ≤5MB)
employeeId: 3c9e5f6a-....                   required
terminalId: a2f8d3c4-....                   optional — must belong to the employee's company
eventTime: 2026-06-08T09:05:00.000Z         optional ISO datetime, defaults to now()
notes: "Late due to traffic"                optional, max 1000 chars
```

**What happens, in order:**
1. `assertFileProvided(file)` — `400` if no file was sent.
2. `assertWithinScope(actor, employee)` — actor must be allowed to touch this employee (own company for admin, own branch for manager).
3. Employee must exist, be `isActive`, not `isBlocked`, and have a `companyId` — otherwise `404`/`403`/`409`.
4. `terminalId` (if sent) must belong to the employee's company (`404`/`409` otherwise).
5. Face verification (see [above](#face-verification-flow-shared-by-all-4-photo-endpoints)) — `409` if no reference photo, `403` if similarity is too low.
6. If today's record already has a `checkIn`, throws `409 Conflict` ("already checked in").
7. Approved **hourly** leave covering shift start is looked up and used to shift the "late" threshold forward.
8. Late/early/overtime minutes and `status` are computed from the employee's `WorkSchedule`.
9. The `Attendance` row is created (or updated, if a check-out-only row already existed for today) inside a transaction, with `source: manual` (always, regardless of whether `terminalId` was supplied).
10. Any late/early/overtime `SalaryAdjustment`s from a previous check-in/out for the same day are deleted and recreated based on the new numbers (idempotent re-sync), using the KPI template's rates — a rate of `0` means no adjustment row is created for that category.
11. `checkInImageUrl` is set to the local `uploads/attendance/...` URL.
12. If the employee ended up late (and has no approved leave covering it), a push notification is sent.

**Response `200`** — same shape as the [`Attendance` data model](#attendance--one-row-per-employee-per-day-employeeid-date) above, plus:
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
- `400 Bad Request` — `file` missing; `eventTime` not a valid ISO date
- `403 Forbidden` — actor outside scope of the employee; employee inactive/blocked; face similarity below threshold
- `404 Not Found` — employee or terminal not found
- `409 Conflict` — employee has no company assigned; employee has no reference face photo; terminal belongs to a different company; already checked in today

---

### 4. Operator check-out

`POST /attendance/check-out`

Roles: `superadmin`, `admin`, `manager`
Content-Type: `multipart/form-data` — identical fields to check-in (`file`, `employeeId`, `terminalId?`, `eventTime?`, `notes?`).

Same scope/employee/terminal/face-verification checks as check-in (steps 1-5 above), then:
- Throws `409 Conflict` if there's no check-in yet for today ("must check in before check out").
- Throws `409 Conflict` if already checked out today.
- Recomputes metrics using the **existing** `checkIn` and the new `checkOut` time, re-syncs `SalaryAdjustment`s the same way as check-in.
- Sets `checkOutImageUrl` to the newly uploaded local URL.
- Sends a notification for every adjustment that was applied (bonus or penalty), not just for lateness.

**Response / Errors** — same shape and error set as check-in, with the "already checked in"/"must check in first" conditions swapped.

---

### 5. Self check-in

`POST /attendance/self/check-in`

Role: `employee` only
Content-Type: `multipart/form-data`

**Form fields** (`SelfAttendanceCheckInDto` + `file`)

```
file: <binary>          required — selfie (image/jpeg|png|webp, ≤5MB)
notes: "arrived early"  optional, max 1000 chars
```

`employeeId` is **never** sent — the target is always `actor.sub` (the caller checks themselves in, never anyone else).

**What happens, in order:**
1. `assertFileProvided(file)` — `400` if no file.
2. Employee is re-fetched from the DB fresh (not trusted from the JWT) — must be `isActive`, not `isBlocked`.
3. If the employee already has an **open** session today (an `AttendanceSession` with `checkOut: null`), throws `409 "You already have an open check-in for today. Check out first."` — unlike the operator flow, this check is at the **session** level, not the daily-row level, so a second visit the same day is allowed as long as the previous one was checked out.
4. Face verification, same as the operator flow.
5. A new `AttendanceSession` row is created (`checkIn: now`, `checkInImageUrl`, `checkInSimilarity`).
6. The day's `Attendance` row is created or updated using the first-in/last-out **collapse rule** — `checkIn` only moves earlier — and metrics/adjustments are recomputed, with `source: mobile`.
7. Late notification sent if applicable, same as the operator flow.

**Response `200`** — the `AttendanceSession` shape (see [data model](#attendancesession--one-row-per-self-service-visit-only-written-by-the-self-routes) above), **not** the `Attendance` shape:

```json
{
  "id": "7c1a....",
  "companyId": "b1e7c1b2-....",
  "branchId": "a2f8d3c4-....",
  "employeeId": "3c9e5f6a-....",
  "attendanceId": "5f2b6c1a-....",
  "date": "2026-06-08",
  "checkIn": "2026-06-08T04:05:00.000Z",
  "checkOut": null,
  "checkInImageUrl": "http://localhost:3000/uploads/attendance/....png",
  "checkOutImageUrl": null,
  "checkInSimilarity": 96.4,
  "checkOutSimilarity": null,
  "workedMinutes": 0,
  "notes": null,
  "createdAt": "2026-06-08T04:05:01.000Z",
  "updatedAt": "2026-06-08T04:05:01.000Z"
}
```

**Errors**
- `400 Bad Request` — `file` missing
- `403 Forbidden` — employee inactive/blocked; face similarity below threshold
- `409 Conflict` — employee has no company assigned; employee has no reference face photo; already has an open session today

---

### 6. Self check-out

`POST /attendance/self/check-out`

Role: `employee` only
Content-Type: `multipart/form-data` — identical fields to self check-in (`file`, `notes?`).

**What happens, in order:**
1. `assertFileProvided(file)` — `400` if no file.
2. Employee re-fetched fresh from the DB (same active/blocked check).
3. Finds the employee's currently **open** session for today (`checkOut: null`, most recent by `checkIn`); if none, `409 "You must check in before check out"`.
4. Face verification, same as check-in.
5. Closes that `AttendanceSession` (`checkOut`, `checkOutImageUrl`, `checkOutSimilarity`, `workedMinutes = checkOut - checkIn`).
6. Extends the day's `Attendance.checkOut` to the max of current/new (collapse rule — never moves earlier), recomputes metrics/adjustments, `source: mobile`.
7. Notifies the employee for every adjustment applied.

**Response `200`** — the closed `AttendanceSession`, same shape as self check-in's response but with `checkOut`/`checkOutImageUrl`/`checkOutSimilarity`/`workedMinutes` populated.

**Errors**
- `400 Bad Request` — `file` missing
- `403 Forbidden` — employee inactive/blocked; face similarity below threshold
- `409 Conflict` — no open session for today (must check in first)

---

### 7. List own sessions

`GET /attendance/self/sessions`

Role: `employee` only

**Query params** (`AttendanceSessionQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `dateFrom` / `dateTo` | ISO date | inclusive range filter on `date` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

Always filtered to `employeeId: actor.sub` — there is no parameter to view another employee's sessions. Ordered newest first (`date desc, checkIn desc`).

**Response `200`**

```json
{
  "items": [ /* AttendanceSession objects, see data model above */ ],
  "total": 3,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

### 8. List attendance (operators)

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
      "source": "mobile",
      "workStartTime": "09:00",
      "workEndTime": "18:00",
      "workedMinutes": 545,
      "lateMinutes": 5,
      "earlyLeaveMinutes": 0,
      "overtimeMinutes": 0,
      "checkInImageUrl": "http://localhost:3000/uploads/attendance/....png",
      "checkOutImageUrl": "http://localhost:3000/uploads/attendance/....png",
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

### 9. Get one attendance record

`GET /attendance/:id`

Roles: `superadmin`, `admin`, `manager`

**Response `200`** — same shape as one item in the list above (includes `employee` and `appliedAdjustments`, omits `faceSimilarity` since it's not stored on `Attendance`).

**Errors**
- `404 Not Found` — no attendance with that id
- `403 Forbidden` — record belongs to a company/branch outside the actor's scope

---

## KPI template

Stored as a `Setting` row (`key: "attendance_kpi_template"`, `ATTENDANCE_KPI_SETTING_KEY`), one per company. Defaults if never configured (`DEFAULT_ATTENDANCE_KPI_TEMPLATE`):

| Field | Default | Meaning |
|---|---|---|
| `latePenaltyPerMinute` | `0` | Money penalty per minute late |
| `earlyLeavePenaltyPerMinute` | `0` | Money penalty per minute left early |
| `overtimeBonusPerMinute` | `0` | Money bonus per minute worked past schedule |
| `faceSimilarityThreshold` | `90` | Minimum Rekognition similarity % to accept a check-in/out photo (0-100) |

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
| `400 Bad Request` | `file` missing on a photo endpoint; invalid `eventTime`; superadmin omitted required `companyId` on KPI template save |
| `403 Forbidden` | actor outside their company/branch scope; employee inactive/blocked; face similarity below threshold |
| `404 Not Found` | employee / terminal / company / attendance record not found |
| `409 Conflict` | already checked in/out today (operator path); check-out attempted before check-in; already has/lacks an open session (self-service path); employee has no reference face photo; employee has no company; terminal belongs to a different company |

---

## Relations & dependencies

- **`SalaryAdjustment`** — every check-in/check-out (operator or self-service) auto-creates/replaces adjustment rows tagged with `reason: "AUTO_ATTENDANCE:<attendanceId>:<late|early_leave|overtime>"`, using the KPI template's per-minute rates. These feed into `payroll` module calculations; re-running check-in/out re-syncs them idempotently (old auto rows for that attendance are deleted before new ones are created).
- **`WorkSchedule`** — supplies `startTime`, `endTime`, `graceMinutes`, `workDays` used to compute lateness/overtime. If the employee has no schedule assigned directly, the company's **default** `WorkSchedule` (`WorkScheduleCompany.isDefault = true`) is used instead.
- **`EmployeeLeave`** — an **approved** leave covering the day suppresses the "absent" reminder notification entirely; an approved **hourly** leave at shift start shifts the lateness threshold forward by that many hours.
- **`Terminal`** — optional link to the physical device on the operator path; must belong to the same company as the employee. Not used by the self-service path (there's no `terminalId` field on `SelfAttendanceCheckInDto`/`OutDto`).
- **`RawAttendanceLog`** — a separate module/table for raw terminal event ingestion; not read or written by this controller's endpoints.
- **`AttendanceSession`** — only produced by the `self/*` routes; the operator (`check-in`/`check-out`) and terminal paths never create session rows, only the daily `Attendance` summary.
- **`User.faceImageUrl`** — the reference photo both photo-taking paths compare against; set via `POST /users/:id/face-image` (`superadmin`/`admin` only — see `docs/employees-api.md`).
- **Background job** (not an HTTP endpoint): `AttendanceService.remindAbsentAndNoCheckoutEmployees` runs every 30 minutes (`@Cron(CronExpression.EVERY_30_MINUTES)`) and pushes "you're absent" / "you forgot to check out" notifications to employees past their scheduled end time with no matching attendance state, skipping anyone with an approved leave for that day.
- **Holiday** — as noted in `docs/holiday-api.md`, `Holiday` is **not** currently consumed by this service; a holiday does not automatically set `AttendanceStatus.holiday` or suppress lateness/absence calculations today.

---

## Key file reference

| Concern | File |
|---|---|
| Schema (`Attendance`, `AttendanceSession`, enums) | `prisma/schema.prisma` |
| Controller | `src/modules/attendance/attendance.controller.ts` |
| Service (check-in/out, self-service, KPI, metrics, cron) | `src/modules/attendance/services/attendance.service.ts` |
| AWS Rekognition face compare | `src/modules/attendance/services/aws-face-verification.service.ts` |
| Selfie/local upload storage | `src/common/upload/image-upload.util.ts` (category `'attendance'`) |
| KPI defaults / setting key | `src/modules/attendance/constants/attendance.constants.ts` |
| DTOs | `src/modules/attendance/dto/*.ts` |
| Terminal ingestion (separate path, same `Attendance` table) | `src/modules/turnstile/turnstile.service.ts` |
| Demo/seed data generator | `src/modules/attendance/services/attendance-demo-seed.service.ts` |
| Notification templates used here | `src/modules/notification/notification.templates.ts` (`attendanceLate`, `attendanceAbsent`, `attendanceNoCheckout`, `adjustmentApplied`) |
