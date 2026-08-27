# Kod uslubi (soddalashtirish qoidalari)

Namuna modul: `src/modules/holiday/` — `holiday.service.ts`, `holiday.controller.ts`.

Asosiy tamoyil: **kod bir ko‘rishda tushunarli bo‘lsin.** Sintaksis sodda, nomlar sodda.
`request` / `response` / HTTP status kodlar — **o‘zgarmaydi.**

---

## 1. O‘zgarmaydigan narsalar (qat'iy)

- `ResponseInterceptor` konverti — o‘sha holicha.
- `findAll` javobi: `{ items, total, page, limit, totalPages }`.
- `delete` javobi: `{ success: true, id }`.
- HTTP status kodlar: refactor'dan oldingi exception turlari saqlanadi
  (`ConflictException` bo‘lsa — `ConflictException` qoladi).
- Endpoint yo‘llari, DTO maydon nomlari, filtrlar xatti-harakati.

## 2. Nomlash

- Ingliz tili, qisqa, bir ko‘rishda tushunarli.
- Fe'llar: `get*`, `check*`, `build*`, `find*`.
  - `getXById(id)` — yozuvni oladi yoki `404`.
  - `checkCompany(id)` / `checkBranch(...)` — mavjudlik / tegishlilikni tekshiradi.
  - `buildDateFilter(...)` — filtr obyektini yasaydi.
- **Ishlatilmaydi:** `resolve*`, `ensure*`, `assert*`, `*OrThrow`, `normalize*`.
- Umumiy tenant-helper'lar (`src/common/utils/scope.util.ts`):
  - `getCompanyId(actor, dto.companyId)` — qaysi companyId'da ishlash.
  - `getScope(actor, { companyId, branchId })` — `{ companyId?, branchId? }` filtri.
  - `checkAccess(actor, record)` — yozuvga kirish huquqi (yo‘q bo‘lsa `403`).

## 3. Sintaksis

- 2 probel, single-quote, `;`, prettier (`npx eslint <fayl>` toza bo‘lsin).
- Metod tanasi **yuqoridan pastga chiziqli** o‘qiladi.
- Guard-clause: `if (!x) throw new NotFoundException('...')`.
- **Yo‘q:** ichma-ich ternary; ternary ichida `await`.
- **Yo‘q:** spred-shartli obyekt `{ ...(cond ? { x } : {}) }`.
  O‘rniga: avval obyekt, keyin `if (cond) obj.x = ...`.
- **Izoh yozilmaydi.** Kod o‘zi tushuntirsin.

## 4. Tiplar

- **`any` ishlatilmaydi.**
- Prisma'ning uzun generic tiplari ham shart emas
  (`Prisma.XxxWhereInput`, `Prisma.XxxUncheckedUpdateInput`).
- **`where` (list filtri)** — doim fayl boshida qisqa qo‘lda `type`.
  DTO'ga o‘xshamaydi (bu Prisma query shakli: `name: { contains, mode }`, `AND: [...]`).
  Misol: `HolidayFilter`, `DateFilter`.
- **`data` (create/update)**:
  - DTO ↔ baza ustunlari **1:1** bo‘lsa (transform yo‘q) → DTO'dan olinadi:
    `type XData = Partial<CreateXDto> & { updatedById: string };`
  - Transform / validatsiya bor bo‘lsa (`string → Date`, `trimToNull`, `null`) →
    qisqa alohida `type` (misol: `HolidayData`, 9 qator).
- Bu tiplar Prisma'ga strukturaviy mos keladi, `where` / `data` sifatida to‘g‘ridan-to‘g‘ri
  uzatiladi.

## 5. Controller

- `@ApiTags('...')` — faqat class ustida.
- `@ApiBearerAuth()` va `@Roles(...)` — **har endpoint metodi** ustida (class'da emas).
- `@ApiOperation({ summary: '<ruxsat berilgan rollar, vergul bilan>' })`
  — faqat rol ro‘yxati, o‘sha endpoint `@Roles(...)` bilan bir xil.
  Misol: `@ApiOperation({ summary: 'superadmin, admin, manager' })`.
  Rollar har xil bo‘lsa har endpoint o‘z ro‘yxatini oladi (`POST /request` → `'employee'`).
- Controller yupqa: DTO validatsiya → `@CurrentUser()` actor + dto ni service'ga uzatadi →
  service natijasini to‘g‘ridan-to‘g‘ri qaytaradi.

## 6. Service

- `PrismaService` to‘g‘ridan-to‘g‘ri inject qilinadi, repository qatlami yo‘q.
- Umumiy chegara helper'lari saqlanadi: `getCompanyId` / `getScope` / `checkAccess`,
  `ResponseInterceptor`, `GlobalExceptionFilter`.
- Private helper faqat **haqiqiy takror** uchun (2+ chaqiruv): "yoz yoki 404", "mavjudmi".
  1 marta ishlatiladigan mayda tekshiruv → metod ichida inline.
- **`update` = partial:** faqat body'da **kelgan** maydonlar yoziladi.
  ```ts
  const data: HolidayData = { updatedById: actor.sub };
  if (dto.name !== undefined) data.name = trimToNull(dto.name);
  if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
  ```
  Kelmagan maydonga tegilmaydi (qayta hisoblab yozilmaydi).
  Sana kabi validatsiya kelmagan tomonni `existing`dan oladi.
  `updatedById: actor.sub` doim yoziladi.
- `companyId` mantiqi (`getCompanyId` ichida):
  - `superadmin`: `dto.companyId` kelsa → o‘sha; bo‘lmasa → token `actor.companyId`;
    u ham bo‘lmasa → `400`.
  - boshqa rollar: doim token; `dto.companyId` farqli kelsa → `403`.

## 7. Pagination (bir xil naqsh)

```ts
const page = query.page ?? 1;
const limit = query.limit ?? 10;
const skip = (page - 1) * limit;
// ...
totalPages: Math.max(1, Math.ceil(total / limit)),
```

## 8. Xato xabarlari

- Ingliz tili, qisqa, sodda.
- Yaxshi: `'End date must be after start date'`, `'Branch is not in this company'`,
  `'Holiday not found'`, `'Company not found'`, `'Name is required'`.
- Yomon: uzun, modul nomi takrorlangan, ortiqcha `!` / `.` / probel.

---

## Modulni ko‘chirish tartibi (checklist)

1. Import yo‘llari: `common/config/...` (eski `congif` emas).
2. Scope helper nomlari: `getCompanyId` / `getScope` / `checkAccess`.
3. Service: ternary/spred yo‘q, guard-clause, izoh yo‘q, `any` yo‘q → qisqa `type`.
4. `update` — partial.
5. Controller: `@ApiBearerAuth` + `@Roles` + `@ApiOperation(summary=rollar)` har endpointда.
6. Xato xabarlari — qisqa ingliz.
7. Tekshir: `npx tsc --noEmit` (yangi xato yo‘q), `npx eslint <fayllar>` (toza),
   `npx jest` (182 test o‘tadi).
