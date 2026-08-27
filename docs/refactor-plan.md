# Soddalashtirish — modul tahlili va reja

> **HOLAT: BAJARILDI.** Barcha 22 modul (`auth`/`turnstile` — faqat nom/sintaksis) `docs/code-style.md`
> bo‘yicha ko‘chirildi. Har modul: `tsc` toza, `eslint` toza (service+controller),
> `endpoint == @Roles == @ApiBearerAuth`, `npx jest` — 182 test o‘tadi.
> Umumiy helper'lar: `getCompanyId` / `getScope` / `checkAccess` / `getFile` / `checkUserCanLogin`.
> Quyidagi matn — tarixiy reja.

---

`docs/code-style.md` qoidalarini butun `src/modules/`ga qo‘llash. Namuna: `holiday` (bajarildi).

Hajm: **22 modul**, ~8 240 qator service kodi, ~140 endpoint / 21 controller.
Struktura hamma joyda bir xil: `create / findAll / findOne / update / delete` +
private `find<X>ByIdOrThrow`, `ensure*`, `normalize*`, `resolve*` helper'lar.

---

## 1. Nima o‘zgaradi (qoida bo‘yicha)

| # | Anti-pattern | Hozir | Yangi |
|---|---|---|---|
| A | spred-shart `...(cond ? { x } : {})` | **157 ta / 19 fayl** | `if (cond) obj.x = ...` |
| B | ternary ichida `await` | **41 ta / 15 fayl** | oddiy `if` bloki |
| C | nomlar `find*ByIdOrThrow` | 20 fayl | `get<X>ById` |
| C | nomlar `ensure*` | ~30 ta | `check*` |
| C | nomlar `assert*` | ~10 ta | `check*` |
| C | nomlar `resolve*` / `normalize*` | ~12 ta | `get*` / inline |
| D | `Prisma.Xxx(Where\|Select\|OrderBy)Input` | ~30 ta | fayl boshida qisqa `type` |
| D | `Prisma.InputJsonValue`, `Prisma.TransactionClient` | 15 ta | **qoldiriladi** (utility tip, alternativa yo‘q) |
| E | izohlar `//` | 27 ta | o‘chiriladi |
| F | `any` | 1 ta | 0 ga |
| G | controller class-level `@Roles` | **14 controller** | har endpointга ko‘chiriladi |
| G | controller class-level `@ApiBearerAuth` | **19 controller** | har endpointга ko‘chiriladi |
| H | `@ApiOperation` summary = `'Create branch - superadmin, admin (own company)'` | ~140 ta | `'superadmin, admin'` (faqat rollar) |
| I | `update` — spred orqali partial | ko‘p modul | `if` bloki bilan partial |

## 2. O‘ZGARMAYDI (tekshirilishi shart)

- `ResponseInterceptor` konverti.
- `findAll` javobi `{ items, total, page, limit, totalPages }` — **20 service'da bir xil**, saqlanadi.
  Istisnolar (o‘z holicha qoladi): `task` board/calendar ko‘rinishlari, `{ success, updatedCount }` (reorder).
- `delete` javobi `{ success: true, id }`.
- HTTP status kodlar — exception turlari o‘zgarmaydi (`ConflictException` "required"/"not in company"
  uchun g‘alati bo‘lsa ham qoldiriladi).
- `@Public()` endpoint'lar (`auth` 3 ta, `turnstile` 1 ta) — tegilmaydi.

## 3. Modullar — tier bo‘yicha

### Tier 1 — kichik, xavfsiz (~60–200 qator, domain mantiqi yo‘q)
`company` (158) · `branch` (177) · `department` (204) · `position` (253) · `setting` (161) ·
`app-version` (67) · `push-token` (199) · `refresh-token` (183)

- Sof CRUD + `find*ByIdOrThrow` + `ensureNameIsUnique` + `normalizeRequiredName`.
- Faqat A/B/C/D/E/G/H o‘zgarishlari. Xavf past.
- Test yo‘q → har birini qo‘lda o‘qib tekshirish.

### Tier 2 — o‘rta (~200–320 qator)
`advance` (280) · `salary-adjustment` (243) · `raw-attendance-log` (318) · `terminal` (238) ·
`notification` (301) · `holiday` (241 — **bajarildi**)

- `getScope` + `checkAccess` + `getCompanyId` faol ishlatiladi.
- `notification`/`push-token`/`refresh-token` — `userId` orqali scope (companyId emas), alohida e'tibor.
- Xavf o‘rta.

### Tier 3 — katta / domain og‘ir
| Modul | Qator | Test | E'tibor |
|---|---|---|---|
| `payroll` | 386 | yo‘q | oylik hisob-kitob, `stats`, `partially_paid` holati, `Decimal` |
| `work-schedule` | 486 | yo‘q | ko‘p-kompaniyali (`WorkScheduleCompany`), assign/unassign, `isDefault` |
| `user` | 605 | yo‘q | rol o‘zgartirish qoidalari, superadmin himoyasi, `me` endpoint'lar, avatar/face |
| `employee-leave` | 620 | yo‘q | `request` vs `direct grant`, approve/reject, `employee` o‘zini ko‘radi |
| `task` | 721 | **bor** (182 test shu yerda) | board/calendar projeksiyalar, `self`/`my`, assignee'lar |
| `attendance` | 1459 | qisman | AWS face verification, `AttendanceSession`, KPI template, demo-seed |

- Bu yerda `update` partial semantikasi va scope tekshiruvlarини **method-by-method** solishtirish kerak.
- `task` — test bor, refactor'dan keyin `npx jest` yashil qolishi shart.
- `attendance` — eng katta, oxirida, alohida sessiyada.

### Alohida (ehtiyot)
- `auth` (`auth.service` 248, `token.service`, `password.service`) — `checkUserCanLogin`,
  JWT logikasi. Faqat nom/sintaksis, **logikaga tegилмайди**.
- `turnstile` (260) — qurilma webhook, `x-turnstile-secret`. Ehtiyot.
- `attendance-demo-seed` (153) — faqat dev seed.

## 4. Xavf reyestri

| Xavf | Ta'sir | Kamaytirish |
|---|---|---|
| Class→method `@Roles` ko‘chirishда bitta endpoint unutilsa | `RolesGuard`: `@Roles` yo‘q = **har autentifikatsiyalangan user o‘tadi** → ruxsat teshigi | Har controllerда endpoint soni = `@Roles` soni ekanini tekshirish (grep). Diff'ni ko‘zdan kechirish |
| spred → `if` o‘girishда typo | filtr/`data` noto‘g‘ri → boshqa natija | `npx tsc` + bor test + qo‘lda o‘qish; kichik modullardan boshlash |
| `update` partial — ba'zi modul yuborilmagan maydonni qayta hisoblaydi (holiday'da branch shундай edi) | yon-ta'sir yo‘qoladi/qo‘shiladi | Har `update`ни eski kod bilan yonma-yon solishtirish |
| exception turi almashib qolsa (409↔400) | javob status o‘zgaradi | Qoida #1: turlarni saqlash. Diff'da `Exception` so‘zini tekshirish |
| `@ApiOperation` summary o‘zgarishi | faqat Swagger matni, runtime 0 | xavfsiz |
| `Prisma.XxxWhereInput` → qo‘l `type` strukturaviy mos kelmasa | `tsc` xatosi (runtime emas) | `tsc` darrov ko‘rsatadi |
| test qamrovi past (faqat `auth`, `task`) | regressiya sezilmay qolishi | har modulni qo‘lda diff-review; iloji bo‘lsa Swagger'дан 1-2 endpoint qo‘lда sinash |

## 5. Tavsiya etilgan tartib

1. **Tier 1** (8 modul) — bittalab: service + controller, `tsc`+`eslint`+`jest`, diff-review, tasdiq.
2. **Tier 2** (5 modul, `holiday` tayyor).
3. **Tier 3** — `payroll` → `work-schedule` → `user` → `employee-leave` → `task` (test bilan) → `attendance` (oxiri, alohida).
4. `auth` / `turnstile` — faqat nom/sintaksis, ehtiyot bilan.
5. Oxirida: `docs/roles.md` va `src/modules/user/README.md`da eski helper nomlarини yangilash.

## 6. Har modul uchun qadam (checklist)

`docs/code-style.md` § "Modulni ko‘chirish tartibi" ga qarang. Qisqacha:
`import config` → helper nomlar → `if` bloklari → partial `update` → controller dekoratorlar →
qisqa ingliz xatolar → `tsc` + `eslint <fayllar>` + `jest`.
