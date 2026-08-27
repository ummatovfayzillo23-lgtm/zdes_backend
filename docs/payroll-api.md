# Payroll API

Base path: `/payrolls`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin`, `manager` (`@Roles(...)` on the whole controller) — `employee` has no access.

A `Payroll` row is one employee's salary summary for one calendar `month` (`"YYYY-MM"`, unique per `employeeId + month`). Unlike Attendance, **the money fields (`baseSalary`, `totalBonus`, `totalPenalty`, `totalAdvance`, `netSalary`) are not computed by the server** — whoever creates/updates a payroll sends these numbers directly. What *is* server-computed is the **payment progress**: `paidAmount` and `status` are only ever changed through the dedicated `PATCH /payrolls/:id/pay` endpoint, never through plain create/update.

---

## Endpoint & role summary

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/payrolls` | Create a payroll row for one employee/month (i.e. "add salary to an employee") |
| `GET` | `/payrolls` | List/filter payrolls |
| `GET` | `/payrolls/stats` | Aggregated statistics: paid / advance / remaining / totals |
| `GET` | `/payrolls/:id` | Get one payroll |
| `PATCH` | `/payrolls/:id` | Update a payroll's stored figures |
| `PATCH` | `/payrolls/:id/pay` | Record a payment (full or partial) against a payroll |
| `DELETE` | `/payrolls/:id` | Delete a payroll |

All seven routes are open to `superadmin`, `admin`, `manager` (with the scope differences below); none are open to `employee`.

---

## Scoping rules — who can see/manage what

Same shared helpers as the rest of the codebase. `Payroll` has **no `branchId` column of its own** — branch scoping for `manager` (and the optional `branchId` filter for `admin`) is applied indirectly through the related `employee.branchId`.

| Role | `companyId` | `branchId` (via `employee.branchId`) |
|---|---|---|
| `superadmin` | free — required on create (`400` if omitted) | free |
| `admin` | forced to own company; foreign value → `403` | free within own company — can pass `branchId` to narrow to one branch, or omit for company-wide |
| `manager` | forced to own company | forced to own branch |

- **Create**: `employeeId` must belong to the resolved `companyId` (`409` otherwise) and pass `checkAccess` (so a manager can only create payroll for an employee in their own branch).
- **List / stats**: filtered by the resolved scope plus any explicit `employeeId`/`month`/`status` filters.
- **Get one / Update / Delete / Pay**: the record is loaded first, then checked — for superadmin/admin directly against the payroll's own `companyId`; for manager, additionally against the related employee's `branchId` (a separate lookup, since Payroll itself has no branch column).

---

## Data model (`Payroll`)

```ts
{
  id: string;
  companyId: string;
  employeeId: string;
  month: string;              // "YYYY-MM"
  baseSalary: number;         // default 0 — client-supplied
  totalBonus: number;         // default 0 — client-supplied
  totalPenalty: number;       // default 0 — client-supplied
  totalAdvance: number;       // default 0 — client-supplied (see note below)
  netSalary: number;          // default 0 — client-supplied, this is the payable amount
  paidAmount: number;         // default 0 — server-managed, only changes via PATCH /payrolls/:id/pay
  status: 'draft' | 'confirmed' | 'partially_paid' | 'paid' | 'cancelled';
  paidAt: string | null;      // set automatically on every payment
  paidById: string | null;    // last user who recorded a payment
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Important — `totalAdvance` on this row is just a number you type in**, not a live sum of that employee's `Advance` records. If you want the *actual* advance total taken during the month, use `GET /payrolls/stats`, which sums the real `Advance` table independently (see below) rather than trusting this field.

---

## Payment status — how it's derived

`status` starts at `draft` (or whatever you set on create/update) and is **only** advanced automatically by `PATCH /payrolls/:id/pay`:

- Each call adds `amount` to `paidAmount`.
- If the new `paidAmount < netSalary` → status becomes `partially_paid`.
- If the new `paidAmount >= netSalary` → status becomes `paid`.
- `paidAt` and `paidById` are updated to "now" / the calling actor on **every** payment call (so they always reflect the *last* payment, not necessarily the first or the final one).
- A single payroll can receive **multiple partial payments** over time (e.g. 2,000,000 now, 2,200,000 later) — there's no limit on the number of `pay` calls, only on the total not exceeding `netSalary`.
- `draft`/`confirmed`/`cancelled` are **not** touched by the payment logic — they're set manually via `POST`/`PATCH` and are meant as a pre-payment workflow (draft → confirmed) or a terminal "voided" state (`cancelled`), independent of `paidAmount`.

---

## Endpoints

### 1. Create payroll (add salary to an employee)

`POST /payrolls`

**Request body** (`CreatePayrollDto`)

```json
{
  "companyId": "b1e7c1b2-....",   // required for superadmin; auto-filled for admin/manager
  "employeeId": "3c9e5f6a-....", // required
  "month": "2026-06",             // required
  "baseSalary": 4000000,
  "totalBonus": 500000,
  "totalPenalty": 100000,
  "totalAdvance": 200000,
  "netSalary": 4200000,
  "status": "draft",              // optional, default "draft"
  "paidAt": "2026-06-30T10:00:00.000Z",  // optional — rarely set on create, use the pay endpoint instead
  "paidById": "c3a9e5f6-...."     // optional, any existing user id
}
```

`paidAmount` **cannot** be set on create — it always starts at `0`; use `PATCH /payrolls/:id/pay` to record payments.

**Errors**
- `400 Bad Request` — superadmin omitted `companyId`
- `403 Forbidden` — employee/company outside actor's scope
- `404 Not Found` — company/employee/paidById not found
- `409 Conflict` — a payroll already exists for this `employeeId` + `month`; employee doesn't belong to the resolved company; empty/missing `month`

---

### 2. List payrolls

`GET /payrolls`

**Query params** (`PayrollQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored/forced for admin & manager |
| `branchId` | uuid | free for admin within their company (filters via `employee.branchId`); forced for manager |
| `employeeId` | uuid | exact match |
| `month` | string | exact match, e.g. `"2026-06"` |
| `status` | enum | `draft`\|`confirmed`\|`partially_paid`\|`paid`\|`cancelled` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

**Response `200`**: `{ items: Payroll[], total, page, limit, totalPages }` — empty `items: []` if nothing matches, not `404`.

---

### 3. Payroll statistics

`GET /payrolls/stats`

**Query params** (`PayrollStatsQueryDto`): `companyId?`, `branchId?`, `employeeId?`, `month?` — same scoping as the list endpoint (superadmin free, admin own-company, manager own-branch).

Example — admin, June company-wide summary:
`GET /payrolls/stats?month=2026-06`

Example — superadmin, one branch:
`GET /payrolls/stats?companyId=b1e7c1b2-....&branchId=a2f8d3c4-....&month=2026-06`

**Response `200`**

```json
{
  "month": "2026-06",
  "employeeCount": 24,
  "totalBaseSalary": 96000000,
  "totalBonus": 4000000,
  "totalPenalty": 800000,
  "totalNetSalary": 99200000,
  "totalPaid": 72000000,
  "totalRemaining": 27200000,
  "totalAdvance": 5300000,
  "statusBreakdown": {
    "draft": 2,
    "confirmed": 3,
    "partially_paid": 10,
    "paid": 8,
    "cancelled": 1
  }
}
```

Field meaning (this directly answers "how much salary has been given, how much advance was taken, how much remains, and the total"):
- `totalNetSalary` — sum of `netSalary` across matching payroll rows (the "umumiy"/total payable).
- `totalPaid` — sum of `paidAmount` (how much has actually been paid out so far, "berilgan").
- `totalRemaining` — `totalNetSalary - totalPaid`, floored at 0 ("qolgan").
- `totalAdvance` — **independent of any `Payroll.totalAdvance` field** — this is the real sum of `Advance.amount` rows for the same company/branch/employee/month scope, i.e. actual advances taken ("avans olgan").
- `employeeCount` — number of payroll rows matched (not distinct employees across months, if `month` is omitted).
- `statusBreakdown` — count of payroll rows per status within the same filters.

If `month` is omitted, figures are summed across **all months** matching the other filters.

---

### 4. Get one payroll

`GET /payrolls/:id`

**Response `200`** — single `Payroll` object (see data model above).

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

### 5. Update payroll

`PATCH /payrolls/:id`

**Request body** (`UpdatePayrollDto` — everything from create, all optional). Re-validates company/employee/month/paidById exactly like create if present, and re-checks the unique `employeeId+month` constraint (excluding itself).

Use this to correct `baseSalary`/`totalBonus`/`totalPenalty`/`totalAdvance`/`netSalary` figures, or to manually set `status` to `confirmed`/`cancelled`. **Do not** use this to record a payment — it does not touch `paidAmount` and does not recompute `partially_paid`/`paid`; use the `pay` endpoint below for that. (Note: if you change `netSalary` *after* payments have already been recorded, `status` is not automatically re-evaluated against the new `netSalary` — it stays whatever the last `pay` call set it to.)

**Errors**: same set as create, plus `404` if the payroll doesn't exist.

---

### 6. Record a payment

`PATCH /payrolls/:id/pay`

**Request body** (`RecordPayrollPaymentDto`)

```json
{ "amount": 2000000 }
```

`amount` must be `> 0`, up to 2 decimal places. Adds to `paidAmount`; recomputes `status` (`partially_paid` or `paid`, see [Payment status](#payment-status--how-its-derived) above); sets `paidAt: now()` and `paidById: <calling actor>`.

**Response `200`** — the updated `Payroll` object.

**Errors**
- `400 Bad Request` — `amount <= 0`, or `paidAmount + amount` would exceed `netSalary` ("Payment amount exceeds the remaining balance")
- `403 Forbidden` — outside actor's scope
- `404 Not Found` — payroll doesn't exist
- `409 Conflict` — payroll's `netSalary` is `0` (nothing to pay against); payroll `status` is `cancelled`

Example flow for a 4,200,000 salary paid in two installments:
```
PATCH /payrolls/:id/pay { "amount": 2000000 }
→ paidAmount: 2000000, status: "partially_paid"

PATCH /payrolls/:id/pay { "amount": 2200000 }
→ paidAmount: 4200000, status: "paid"
```

---

### 7. Delete payroll

`DELETE /payrolls/:id`

**Response `200`**: `{ "success": true, "id": "..." }`

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

## Error format (all endpoints)

```json
{ "statusCode": 409, "message": "Payroll already exists for this employee and month", "error": "Conflict" }
```

| Code | When |
|---|---|
| `400 Bad Request` | superadmin omitted `companyId`; payment `amount <= 0` or exceeds remaining balance |
| `403 Forbidden` | actor outside company/branch scope |
| `404 Not Found` | company / employee / payroll / paidById not found |
| `409 Conflict` | duplicate `employeeId` + `month`; employee doesn't belong to the resolved company; missing `month`; paying a payroll with `netSalary <= 0` or `status: cancelled` |

---

## Relations & dependencies

- **`Advance`** (`docs/advance-api.md`) — **not** joined automatically into any `Payroll` row's `totalAdvance` field; only `GET /payrolls/stats` independently sums the real `Advance` table. If you want a payroll's stored `totalAdvance` to match reality, you must total up that employee's advances for the month yourself (or read them via `GET /advances?employeeId=&month=`) and pass the number in on create/update.
- **`SalaryAdjustment`** (`docs/attendance-api.md`, late/early/overtime auto-adjustments) — also **not** read by Payroll. `totalBonus`/`totalPenalty` here are plain client-supplied numbers, unrelated to the `SalaryAdjustment` rows that Attendance auto-creates. If you want payroll bonus/penalty to reflect actual attendance adjustments, sum `GET /salary-adjustments?employeeId=&month=` yourself before creating/updating the payroll.
- **`User.baseSalary`** — a reference field on the employee profile (`docs/employees-api.md`), not read automatically when creating a payroll; the `baseSalary` on the `Payroll` row is independent and must be entered explicitly.
- In short: **Payroll is a ledger you fill in, not a calculator** — Attendance, Advance, and SalaryAdjustment all produce data that's relevant to payroll, but nothing in this codebase currently pulls them together automatically except the read-only `stats` endpoint's `totalAdvance` figure.
