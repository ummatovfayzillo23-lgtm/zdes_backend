# Advance API

Base path: `/advances`
Auth: Bearer JWT required (`@ApiBearerAuth`)
Roles: `superadmin`, `admin`, `manager` (`@Roles(...)` on the whole controller) — `employee` has no access (an employee cannot request or view their own advances through this API).

An `Advance` is a cash advance paid out to an employee on a given `date`, tagged with a `month` (`"YYYY-MM"`) for reporting. Multiple advances per employee per month are allowed — there is **no unique constraint**, unlike `Payroll`'s one-row-per-employee-per-month rule.

---

## Scoping rules — who can see/manage what

Same shared helpers as the rest of the codebase. `Advance` has **no `branchId` column of its own** — branch scoping is applied indirectly through the related `employee.branchId`.

| Role | `companyId` | `branchId` (via `employee.branchId`) |
|---|---|---|
| `superadmin` | free — required on create (`400` if omitted) | free |
| `admin` | forced to own company; foreign value → `403` | free within own company — pass `branchId` to narrow to one branch, or omit for company-wide |
| `manager` | forced to own company | forced to own branch |

- **Create**: `employeeId` must belong to the resolved `companyId` (`409` otherwise) and pass `assertWithinScope` — a manager can only create an advance for an employee in their own branch.
- **List / get one / update / delete**: same pattern as Payroll's `assertRecordInScope` — superadmin/admin checked directly against the advance's own `companyId`; manager additionally checked against the related employee's `branchId`.

---

## Data model (`Advance`)

```ts
{
  id: string;
  companyId: string;
  employeeId: string;
  amount: number;             // >= 0, 2 decimal places
  date: string;                // ISO date, when the advance was paid out
  month: string;                // "YYYY-MM", derived from `date` if not sent explicitly
  note: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**No validation against remaining salary** — creating an advance never checks the employee's `baseSalary` or how much they've already been advanced this month. Any amount can be recorded regardless of prior advances or salary. If you need to know how much has already been advanced before deciding whether to allow another one, check `GET /payrolls/stats` (`totalAdvance`) or `GET /advances?employeeId=&month=` yourself first — the server won't stop you from over-advancing.

---

## Endpoints

### 1. Create advance (add advance to an employee)

`POST /advances`

**Request body** (`CreateAdvanceDto`)

```json
{
  "companyId": "b1e7c1b2-....",   // required for superadmin; auto-filled for admin/manager
  "employeeId": "3c9e5f6a-....", // required
  "amount": 500000,               // required, >= 0
  "date": "2026-06-08",           // required, ISO date
  "month": "2026-06",             // optional — auto-derived from `date` (UTC year-month) if omitted
  "note": "Advance for travel expenses" // optional, max 1000 chars
}
```

**What happens:**
1. `companyId` resolved (`resolveScopedCompanyId`) and verified to exist.
2. Employee resolved and checked to belong to that company + within actor's scope.
3. `month` derived from `date` if not explicitly given.
4. Advance row created.
5. Two notifications are sent: one to the employee ("Sizga {amount} so'm miqdorida avans qo'shildi"), and one "oversight" notification to the company/branch's admin/manager chain.

**Errors**
- `400 Bad Request` — superadmin omitted `companyId`; invalid `date`/`amount`
- `403 Forbidden` — employee/company outside actor's scope
- `404 Not Found` — company or employee not found
- `409 Conflict` — employee doesn't belong to the resolved company

---

### 2. List advances

`GET /advances`

**Query params** (`AdvanceQueryDto`)

| Param | Type | Notes |
|---|---|---|
| `companyId` | uuid | ignored/forced for admin & manager |
| `branchId` | uuid | free for admin within their company; forced for manager |
| `employeeId` | uuid | exact match |
| `month` | string | exact match, e.g. `"2026-06"` |
| `dateFrom` / `dateTo` | ISO date | inclusive range filter on `date` |
| `page` / `limit` | int | pagination, `limit` max 100, default 10 |

Example — admin, all advances for one employee in June:
`GET /advances?employeeId=3c9e5f6a-....&dateFrom=2026-06-01&dateTo=2026-06-30`

**Response `200`**: `{ items: Advance[], total, page, limit, totalPages }`, ordered `date desc, createdAt desc`. Empty `items: []` if nothing matches, not `404`.

---

### 3. Get one advance

`GET /advances/:id`

**Response `200`** — single `Advance` object.

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

### 4. Update advance

`PATCH /advances/:id`

**Request body** (`UpdateAdvanceDto` — everything from create, all optional). If `date` changes and `month` isn't explicitly given in the same request, `month` is recomputed from the new `date`.

**Errors**: same set as create, plus `404` if the advance doesn't exist.

---

### 5. Delete advance

`DELETE /advances/:id`

**Response `200`**: `{ "success": true, "id": "..." }`

**Errors**: `404 Not Found`; `403 Forbidden` outside scope.

---

## Error format (all endpoints)

```json
{ "statusCode": 409, "message": "Employee does not belong to the selected company", "error": "Conflict" }
```

| Code | When |
|---|---|
| `400 Bad Request` | superadmin omitted `companyId`; invalid `date`/`amount` |
| `403 Forbidden` | actor outside company/branch scope |
| `404 Not Found` | company / employee / advance not found |
| `409 Conflict` | employee doesn't belong to the resolved company |

---

## Relations & dependencies

- **`Payroll`** (`docs/payroll-api.md`) — an advance is **not** automatically reflected in any payroll row. `Payroll.totalAdvance` is a separate, manually entered number; `GET /payrolls/stats` is the one place that sums real `Advance` rows independently for reporting.
- **Notifications** — every create sends two: one to the employee, one "oversight" copy to their company/branch's admin/manager chain (`NotificationService.notifyOversight`), so advances are visible to management even without checking this API directly.
- No relation to Attendance or SalaryAdjustment — advances are purely a manual HR/finance action, not derived from attendance behavior.
