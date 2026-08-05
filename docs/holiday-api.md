# Holiday API

Base path: `/holidays`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin`, `manager` (`@Roles('superadmin', 'admin', 'manager')` on the whole controller — every endpoint is open to all three, scope differs per role)

A `Holiday` is a non-working date range (e.g. "Navruz bayrami", "New Year") that belongs to a company, optionally narrowed to one branch. It has no direct code dependency on Attendance or Payroll yet — see [Relations & dependencies](#relations--dependencies) at the bottom for exactly what that means today.

---

## Scoping rules — who can do what

Every endpoint uses the same two helpers from `src/common/utils/scope.util.ts`: `resolveScopedCompanyId` (resolves which `companyId` a write applies to) and `resolveCompanyBranchScope` (resolves the effective `{ companyId, branchId }` filter). The three roles behave differently through those helpers:

| Role | `companyId` | `branchId` | Can see/touch |
|---|---|---|---|
| `superadmin` | must be sent explicitly in the body/query | fully optional, any branch of any company | **any** company, **any** branch — no restriction |
| `admin` | ignored if sent — always forced to the admin's own `companyId` from the JWT; sending a different one throws `403` | optional — admin chooses: omit it for a **company-wide** holiday, or pick one branch of their own company | only their **own company**, any branch within it |
| `manager` | same as admin — forced to their own company | **forced to the manager's own `branchId`** — a manager can never create a company-wide holiday (`branchId: null`) and cannot target another branch (`403` if they try) | only their **own branch** |

This means the three roles form a strict hierarchy: superadmin (global) → admin (company-wide) → manager (single branch only).

---

## 1. Superadmin — full explanation

Superadmin is the only role that is not auto-scoped — every write must say explicitly which company (and optionally which branch) it applies to.

- **Create** (`POST /holidays`): `companyId` is **required** in the body (omitting it throws `400 Bad Request` — see `resolveScopedCompanyId`). `branchId` is optional: omit for a holiday that applies to the whole company, or set it to scope the holiday to one branch of that company.
- **List** (`GET /holidays`): `companyId`/`branchId` query params are used exactly as sent — no forced filter. Omitting both returns holidays across **every** company.
- **Get one / Update / Delete** (`:id`): no ownership check at all (`assertWithinScope` short-circuits for `superadmin`) — a superadmin can read, edit, or delete any holiday regardless of which company or branch it belongs to.
- On **update**, a superadmin may even move a holiday to a different company by sending a new `companyId` (and optionally a `branchId` that belongs to that new company).

In short: superadmin has no boundaries here — it is the platform-operator view across all tenants.

---

## 2. Admin (company) — full explanation

An admin's JWT carries a fixed `companyId`; every action is pinned to that company by the backend, not by what the admin sends.

- **Create** (`POST /holidays`): if the admin sends a `companyId` in the body, the backend accepts it **only if it matches their own company**, otherwise `403 Forbidden`. If omitted, it's auto-filled with the admin's `companyId`. `branchId` is fully optional and free to choose among the branches of their own company:
  - `branchId` omitted → **company-wide** holiday (applies to every branch/employee in the company).
  - `branchId` set → holiday scoped to that one branch only.
- **List** (`GET /holidays`): `companyId` query param is ignored/overridden — always forced to the admin's own company. `branchId` can be used to further narrow to one branch, or omitted to see every holiday in the company (company-wide + all branch-specific ones).
- **Get one / Update / Delete** (`:id`): allowed only if the holiday's `companyId` matches the admin's own company (checked via `assertWithinScope`); otherwise `403 Forbidden`. There is no branch restriction for admin — they can edit/delete a holiday scoped to any branch of their own company, or a company-wide one.
- On **update**, an admin cannot move a holiday to a different company (attempting a foreign `companyId` throws `403` the same as on create).

In short: an admin's world is exactly one company; inside it they have full control over both company-wide and per-branch holidays.

---

## 3. Manager (branch) — for completeness

Not explicitly asked for, but included since the controller allows it and the restriction is real: a manager is scoped one level tighter than admin — to a single branch.

- **Create**: `branchId` is always forced to the manager's own branch (`resolveCompanyBranchScope` overrides whatever — or nothing — was sent). A manager can **never** create a company-wide holiday.
- **List**: always filtered to the manager's own company **and** own branch.
- **Get one / Update / Delete**: allowed only if the holiday belongs to the manager's own company **and** own branch (`403` otherwise). A manager cannot touch a company-wide holiday (`branchId: null`) created by an admin/superadmin, even if it affects their branch's employees — only read access to it would come through `findAll`/`findOne` if scoping allowed it, but `assertWithinScope` blocks write/delete since a company-wide holiday's `branchId` is `null`, which doesn't equal the manager's `branchId`.

---

## Data model (`Holiday`)

```ts
{
  id: string;              // uuid
  companyId: string;       // uuid
  branchId: string | null; // uuid — null means company-wide
  name: string;
  startDate: string;        // ISO date, e.g. "2026-03-21"
  endDate: string;           // ISO date, must be >= startDate
  affectsSalary: boolean;    // default false — see Relations & dependencies below
  note: string | null;
  createdById: string | null; // actor.sub at creation time
  updatedById: string | null; // actor.sub at last update
  createdAt: string;
  updatedAt: string;
}
```

---

## Endpoints

### 1. Create holiday

`POST /holidays`

**Request body** (`CreateHolidayDto`)

```json
{
  "companyId": "b1e7c1b2-....",   // required for superadmin; ignored/auto-filled for admin & manager
  "branchId": "a2f8d3c4-....",    // optional for superadmin/admin; forced to actor's branch for manager
  "name": "Navruz bayrami",
  "startDate": "2026-03-21",
  "endDate": "2026-03-22",
  "affectsSalary": false,          // optional, default false
  "note": "Rasmiy davlat bayrami"  // optional, max 1000 chars
}
```

**Validation**
- `name`: string, 1-255 chars, required
- `startDate` / `endDate`: ISO date strings, required; `endDate >= startDate` or `400 Bad Request`
- `affectsSalary`: boolean, optional
- `note`: string, optional, max 1000 chars
- `companyId`, `branchId`: UUID, optional (see role rules above)

**Errors**
- `400 Bad Request` — `endDate` before `startDate`; superadmin omitted `companyId`
- `403 Forbidden` — admin/manager tried to target a company/branch outside their scope
- `404 Not Found` — company or branch not found
- `409 Conflict` — `branchId` doesn't belong to the resolved `companyId`

---

### 2. List holidays

`GET /holidays`

**Query params** (`HolidayQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored for admin/manager (auto-scoped) |
| `branchId` | uuid | ignored/forced for manager |
| `search` | string | matches `name` (case-insensitive `contains`) |
| `affectsSalary` | boolean | `true`/`false` |
| `dateFrom` / `dateTo` | date string | returns holidays whose `[startDate, endDate]` **overlaps** this range (not just holidays fully inside it) |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

Example: `GET /holidays?dateFrom=2026-03-01&dateTo=2026-03-31`

**Response `200`**

```json
{
  "items": [
    {
      "id": "5f2b6c1a-....",
      "companyId": "b1e7c1b2-....",
      "branchId": null,
      "name": "Navruz bayrami",
      "startDate": "2026-03-21T00:00:00.000Z",
      "endDate": "2026-03-22T00:00:00.000Z",
      "affectsSalary": false,
      "note": "Rasmiy davlat bayrami",
      "createdById": "c3a9e5f6-....",
      "updatedById": "c3a9e5f6-....",
      "createdAt": "2026-02-01T06:00:00.000Z",
      "updatedAt": "2026-02-01T06:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

### 3. Get one holiday

`GET /holidays/:id`

**Response `200`** — same shape as a single item above.

**Errors**
- `404 Not Found`
- `403 Forbidden` — outside actor's company/branch scope

---

### 4. Update holiday

`PATCH /holidays/:id`

**Request body** (`UpdateHolidayDto` — every field from create, all optional)

```json
{
  "name": "Navruz bayrami (yangilangan)",
  "endDate": "2026-03-23",
  "affectsSalary": true
}
```

**Errors** — same as create, plus `404` if the holiday itself doesn't exist, `403` if outside scope.

---

### 5. Delete holiday

`DELETE /holidays/:id`

**Response `200`**

```json
{ "success": true, "id": "5f2b6c1a-...." }
```

**Errors**
- `404 Not Found`
- `403 Forbidden` — outside actor's scope

---

## Error format (all endpoints)

```json
{
  "statusCode": 409,
  "message": "Branch does not belong to the selected company",
  "error": "Conflict"
}
```

| Code | When |
|---|---|
| `400 Bad Request` | `endDate` before `startDate`; superadmin omitted required `companyId` |
| `403 Forbidden` | actor tries to touch a company/branch outside their scope |
| `404 Not Found` | company / branch / holiday not found |
| `409 Conflict` | `branchId` doesn't belong to the resolved `companyId` |

---

## Relations & dependencies

- **`Company` → `Holiday[]`** (`prisma/schema.prisma`): every holiday belongs to exactly one company (`onDelete: Cascade` — deleting a company deletes its holidays).
- **`Branch` → `Holiday[]`**: optional — `branchId` is nullable (`onDelete: SetNull` — deleting a branch does not delete its holidays, it just un-scopes them to company-wide).
- **`createdById` / `updatedById`**: store the acting user's id (`actor.sub`) as plain `String?` columns — there is **no** Prisma relation to `User` for these fields, so they are not `include`-able; they're for audit trail only.
- **Attendance / Payroll — currently *not* wired up**: `affectsSalary` is stored on every holiday, and there's a matching `affectsSalary` flag on `EmployeeLeave` too, but as of this codebase **neither `attendance.service.ts` nor the `payroll` module reads `Holiday` at all** — there is no code today that automatically marks an attendance record as `holiday` status or excludes/includes holiday days from salary calculations. The flag is captured for future use (or manual/reporting purposes) but is not yet consumed anywhere. If you need holidays to actually affect attendance status (`AttendanceStatus.holiday`) or payroll totals, that logic still needs to be built.
- **`Setting`** (`src/modules/setting`): unrelated to holidays directly, but relevant to note that company-level configuration in this codebase generally lives either as first-class fields (like `Company.timezone`) or in the generic `Setting` key/value table — holidays are a first-class model, not a `Setting` entry.
