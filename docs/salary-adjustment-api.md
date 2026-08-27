# Salary Adjustment API (Bonus / Penalty — outside monthly payroll)

Base path: `/salary-adjustments`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin`, `manager` (`@Roles(...)` on the whole controller) — `employee` has no access.

This is the standalone **"bonus/minus" (plus/penalty) module** — a one-off amount applied to an employee that has **no relation to `Payroll` or `Advance`** (see `docs/payroll-api.md` and `docs/advance-api.md`). Full CRUD: create, list, get one, update, delete. Each row is tagged with a `month` purely for reporting/filtering — creating or editing one does **not** touch any `Payroll` row's `totalBonus`/`totalPenalty`, and it isn't summed automatically anywhere except by whoever reads `GET /salary-adjustments` themselves.

This is the same table Attendance auto-writes to for late/early-leave/overtime penalties/bonuses (`docs/attendance-api.md`) — those rows are tagged with `reason: "AUTO_ATTENDANCE:..."` and get deleted/recreated automatically on every check-in/out. Rows you create through this API are ordinary, independent entries — they are never touched or deleted by the attendance flow.

---

## Scoping rules — who can see/manage what

Same shared helpers as the rest of the codebase. `SalaryAdjustment` has **no `branchId` column of its own** — branch scoping is applied indirectly through the related `employee.branchId`.

| Role | `companyId` | `branchId` (via `employee.branchId`) |
|---|---|---|
| `superadmin` | free — required on create (`400` if omitted) | free |
| `admin` | forced to own company; foreign value → `403` | free within own company — pass `branchId` to narrow to one branch, or omit for company-wide |
| `manager` | forced to own company | forced to own branch |

- **Create**: `employeeId` must belong to the resolved `companyId` (`409` otherwise) and pass `checkAccess`.
- **List / get one / update / delete**: same `assertRecordInScope` pattern as Payroll/Advance — superadmin/admin checked directly against the record's own `companyId`; manager additionally checked against the related employee's `branchId`.

---

## Data model (`SalaryAdjustment`)

```ts
{
  id: string;
  companyId: string;
  employeeId: string;
  type: 'bonus' | 'penalty';         // plus or minus
  category: AdjustmentCategory;       // default 'manual'
  amount: number;                      // always a positive magnitude — `type` decides plus/minus
  date: string;                        // ISO date
  month: string;                       // "YYYY-MM", derived from `date` if not sent explicitly
  reason: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}
```

`amount` is always stored as a **positive number** — whether it's added or subtracted from an employee's pay is determined entirely by `type` (`bonus` = plus, `penalty` = minus), not by the sign of `amount`.

`category` (`AdjustmentCategory` enum): `late | early_leave | absent | overtime | holiday_bonus | manual | other`. Default is `manual` — use that (or `other`) for ad-hoc bonuses/penalties created through this API; the other five values (`late`, `early_leave`, `overtime`, etc.) are what the Attendance module uses for its auto-generated rows, but nothing stops you from using them manually too if it fits your reporting needs.

There is **no unique constraint** — an employee can have any number of adjustments on the same day/month.

---

## Endpoints

### 1. Create adjustment (add a bonus or penalty)

`POST /salary-adjustments`

**Request body** (`CreateSalaryAdjustmentDto`)

```json
{
  "companyId": "b1e7c1b2-....",   // required for superadmin; auto-filled for admin/manager
  "employeeId": "3c9e5f6a-....", // required
  "type": "bonus",                // required: "bonus" (plus) or "penalty" (minus)
  "category": "manual",           // optional, default "manual"
  "amount": 150000,               // required, positive magnitude
  "date": "2026-06-08",           // required, ISO date
  "month": "2026-06",             // optional — auto-derived from `date` if omitted
  "reason": "Manual bonus"        // optional, max 1000 chars
}
```

For a **penalty/minus** example:
```json
{
  "employeeId": "3c9e5f6a-....",
  "type": "penalty",
  "category": "other",
  "amount": 50000,
  "date": "2026-06-08",
  "reason": "Damaged equipment"
}
```

On success, a notification is sent to the employee (`"Sizga {amount} so'm miqdorida bonus/jarima qo'llandi"` style message via `notificationTemplates.adjustmentApplied`).

**Errors**
- `400 Bad Request` — superadmin omitted `companyId`; invalid `date`/`amount`/`type`
- `403 Forbidden` — employee/company outside actor's scope
- `404 Not Found` — company or employee not found
- `409 Conflict` — employee doesn't belong to the resolved company

---

### 2. List adjustments

`GET /salary-adjustments`

**Query params** (`SalaryAdjustmentQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored/forced for admin & manager |
| `branchId` | uuid | free for admin within their company; forced for manager |
| `employeeId` | uuid | exact match |
| `type` | enum | `bonus` \| `penalty` |
| `category` | enum | `late`\|`early_leave`\|`absent`\|`overtime`\|`holiday_bonus`\|`manual`\|`other` |
| `month` | string | exact match, e.g. `"2026-06"` |
| `search` | string | case-insensitive `contains` on `reason` only |
| `dateFrom` / `dateTo` | date string | inclusive range filter on `date` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

Example — admin, all manual bonuses in June:
`GET /salary-adjustments?type=bonus&category=manual&month=2026-06`

Example — filter out the auto-generated attendance rows and see only what was created manually:
`GET /salary-adjustments?category=manual`

**Response `200`**: `{ items: SalaryAdjustment[], total, page, limit, totalPages }`, ordered `date desc, createdAt desc`. Empty `items: []` if nothing matches, not `404`.

---

### 3. Get one adjustment

`GET /salary-adjustments/:id`

**Response `200`** — single object, same shape as the data model above.

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

### 4. Update adjustment

`PATCH /salary-adjustments/:id`

**Request body** (`UpdateSalaryAdjustmentDto` — everything from create, all optional). Changing `type` flips it between bonus/penalty; changing `amount` replaces the stored magnitude. If `date` changes and `month` isn't explicitly given, `month` is recomputed from the new `date`.

Note: this also lets you edit an **auto-generated attendance adjustment** (`reason` starting with `AUTO_ATTENDANCE:...`) — but the next check-in/check-out for that same attendance record will delete and recreate it from scratch, discarding your manual edit. Prefer creating separate manual rows (`category: manual`/`other`) for anything you want to persist independently of attendance recalculation.

**Errors**: same set as create, plus `404` if the adjustment doesn't exist.

---

### 5. Delete adjustment

`DELETE /salary-adjustments/:id`

**Response `200`**: `{ "success": true, "id": "..." }`

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

## Error format (all endpoints)

```json
{ "statusCode": 409, "message": "Employee does not belong to the selected company", "error": "Conflict" }
```

| Code | When |
|---|---|
| `400 Bad Request` | superadmin omitted `companyId`; invalid `date`/`amount`/`type` |
| `403 Forbidden` | actor outside company/branch scope |
| `404 Not Found` | company / employee / adjustment not found |
| `409 Conflict` | employee doesn't belong to the resolved company |

---

## Relations & dependencies

- **`Payroll`** (`docs/payroll-api.md`) — **not** linked. `Payroll.totalBonus`/`totalPenalty` are plain client-supplied numbers on the payroll row; nothing sums `SalaryAdjustment` rows into them automatically. If you want a payroll's bonus/penalty totals to reflect what's here, sum `GET /salary-adjustments?employeeId=&month=&type=bonus` (and `type=penalty`) yourself and pass the totals in when creating/updating the payroll.
- **Attendance** (`docs/attendance-api.md`) — the *only* automatic writer to this table. Every check-in/check-out re-syncs (deletes + recreates) up to three rows per attendance record, tagged `reason: "AUTO_ATTENDANCE:<attendanceId>:<late|early_leave|overtime>"`, using the company's KPI template rates. Filter these out with `category` if you only want manually-created adjustments (`category=manual` or `category=other`).
- **Notifications** — every create sends the employee a notification describing the bonus/penalty and amount.
