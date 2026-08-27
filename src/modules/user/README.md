# User moduli — to'liq qo'llanma

Xodimlar (userlar)ni boshqarish moduli. Barcha endpointlar `api/v1/users` prefiksi ostida ishlaydi va `Authorization: Bearer <token>` talab qiladi (public emas). `employee` roli tizimga login qila olmaydi (faqat terminal/turniket orqali), shuning uchun bu modulga amalda faqat `superadmin`, `admin`, `manager` kira oladi.

## 1. Rollar va ruxsatlar (to'liq matritsa)

| Amal | superadmin | admin (o'z kompaniyasi) | manager (o'z filiali, faqat `employee`) |
|---|---|---|---|
| Yaratish (`POST /users`) | ✅ istalgan rol | ✅ superadmindan tashqari (admin/manager/employee) | ❌ |
| Ro'yxat (`GET /users`) | ✅ hammasi | ✅ o'z kompaniyasi | ✅ o'z filiali, faqat `employee` |
| Bittasini ko'rish (`GET /users/:id`) | ✅ | ✅ o'z kompaniyasi | ✅ o'z filiali, faqat `employee` |
| **O'zini tahrirlash** (`PATCH /users/me`) | ✅ | ✅ | ✅ |
| Boshqani tahrirlash (`PATCH /users/:id`) | ✅ istalgan rol, istalgan maydon | ✅ o'z kompaniyasi, superadmindan tashqari | ✅ o'z filialidagi `employee`, lekin **role/companyId/branchId'ni o'zgartira olmaydi** |
| Status o'zgartirish (`toggle-status`) | ✅ | ✅ o'z kompaniyasi | ✅ o'z filialidagi `employee` |
| Blok qilish (`toggle-blocked`) | ✅ | ✅ o'z kompaniyasi | ✅ o'z filialidagi `employee` |
| Parol o'zgartirish (`change-password`) | ✅ | ✅ o'z kompaniyasi, superadmindan tashqari | ❌ |
| O'chirish (`DELETE /users/:id`) | ✅ | ✅ o'z kompaniyasi, superadmindan tashqari | ❌ |

**Superadmin himoyasi**: `superadmin` rolidagi userni faqat boshqa `superadmin` yaratishi/tahrirlashi/o'chirishi/parolini o'zgartirishi mumkin. `admin` yoki `manager` buni qilishga urinsa — `403 Forbidden`.

## 2. Endpointlar to'liq ro'yxati

Fayllar: [`user.controller.ts`](./user.controller.ts), [`user.service.ts`](./user.service.ts).

| Metod | Yo'l | Ruxsat | Tavsif |
|---|---|---|---|
| `POST` | `/users` | superadmin, admin | Yangi user yaratish |
| `GET` | `/users` | superadmin, admin, manager | User ro'yxati — filter, qidiruv, pagination, rol bo'yicha statistika bilan |
| `GET` | `/users/:id` | superadmin, admin, manager | Bitta userning **barcha** ma'lumotlari |
| `PATCH` | `/users/me` | superadmin, admin, manager | **O'zining** profilini tahrirlash |
| `PATCH` | `/users/:id` | superadmin, admin, manager | Boshqa userni tahrirlash |
| `PATCH` | `/users/:id/toggle-status` | superadmin, admin, manager | `isActive`ni almashtirish |
| `PATCH` | `/users/:id/toggle-blocked` | superadmin, admin, manager | `isBlocked`ni almashtirish |
| `PATCH` | `/users/:id/change-password` | superadmin, admin | Boshqa userning parolini o'zgartirish |
| `DELETE` | `/users/:id` | superadmin, admin | Userni o'chirish |

> Joriy foydalanuvchining o'z profilini **ko'rish** uchun `GET /api/v1/auth/me` ishlatiladi (`AuthController`, alohida modul) — bu ham to'liq user ma'lumotini qaytaradi.

> **Route tartibi muhim**: `PATCH /users/me` controllerda `PATCH /users/:id`dan **oldin** e'lon qilingan, aks holda Nest `me`ni `:id` sifatida qabul qilib, UUID xatosini qaytargan bo'lardi.

## 3. `PATCH /users/me` — o'zini tahrirlash

Har qanday autentifikatsiyadan o'tgan foydalanuvchi (`superadmin`/`admin`/`manager`) shu endpoint orqali **faqat o'zining** profilini tahrirlaydi. Nishon user hech qachon `id` orqali berilmaydi — token ichidagi `actor.sub` ishlatiladi, shuning uchun boshqa userni tahrirlash imkonsiz.

DTO: [`UpdateOwnProfileDto`](./dto/update-own-profile.dto.ts) — quyidagi maydonlar bilan cheklangan:

```
firstName, lastName, middleName, phone, email,
address, passportSerial, dateOfBirth, avatarUrl
```

**Ruxsat etilmagan** (o'zi o'zgartira olmaydigan) maydonlar: `role`, `companyId`, `branchId`, `departmentId`, `positionId`, `managerId`, `workScheduleId`, `employeeNo`, `baseSalary`, `isActive`, `isBlocked`, `login`, `password` — bularni faqat superadmin/admin (`PATCH /users/:id` orqali) o'zgartira oladi.

```http
PATCH /api/v1/users/me
Authorization: Bearer <har_qanday_token>
Content-Type: application/json

{
  "firstName": "Aziz",
  "phone": "+998901234567",
  "avatarUrl": "https://cdn.example.com/avatars/aziz.png"
}
```

## 4. `PATCH /users/:id` — boshqa userni tahrirlash

- **superadmin** — istalgan userni, istalgan maydonini (rol, kompaniya, filial dahil) o'zgartira oladi.
- **admin** — o'z kompaniyasidagi (`checkAccess`) `admin`/`manager`/`employee`larni to'liq tahrirlaydi; `dto.companyId` boshqa qiymatga o'zgartirilsa yoki nishon/berilgan rol `superadmin` bo'lsa — `403`.
- **manager** — o'z filialidagi `employee` userlarni tahrirlaydi (ism, telefon, email, manzil, bo'lim, lavozim, tug'ilgan sana va h.k.), **lekin quyidagi maydonlarni o'zgartirishga urinsa — `403 "Manager cannot change role, company or branch"`**: `role`, `companyId`, `branchId`.

Bu mantiq `user.service.ts`dagi `update()` metodida amalga oshirilgan:
```ts
if (
  actor.role === 'manager' &&
  (dto.role !== undefined || dto.companyId !== undefined || dto.branchId !== undefined)
) {
  throw new ForbiddenException('Manager cannot change role, company or branch');
}
```

## 5. `GET /users` — ro'yxat: filterlar, pagination, statistika

### Query parametrlari (`UserQueryDto`)

| Parametr | Tur | Izoh |
|---|---|---|
| `companyId` | UUID | superadmin uchun ixtiyoriy filtr; admin/manager uchun avtomatik o'z kompaniyasiga majburlanadi |
| `branchId` | UUID | superadmin/admin uchun ixtiyoriy filtr; manager uchun avtomatik o'z filialiga majburlanadi |
| `departmentId` | UUID | Bo'lim bo'yicha filtr |
| `positionId` | UUID | Lavozim bo'yicha filtr |
| `role` | `UserRole` | Rol bo'yicha filtr — **manager uchun e'tiborsiz qoldiriladi**, har doim `employee` majburlanadi |
| `isActive` | boolean | Faol/nofaol |
| `isBlocked` | boolean | Bloklangan/bloklanmagan |
| `search` | string | `login`, `firstName`, `lastName`, `phone`, `email`, `employeeNo` bo'yicha qisman qidiruv (case-insensitive) |
| `page` | int, default `1` | Sahifa raqami |
| `limit` | int, default `10`, max `100` | Sahifadagi elementlar soni |

### Javob formati

```jsonc
{
  "items": [ /* USER_SELECT bo'yicha to'liq user obyektlari, pastga qarang */ ],
  "total": 47,          // joriy filtrlar bo'yicha jami son
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "stats": {             // <-- YANGI: rol bo'yicha statistika
    "superadmin": 1,
    "admin": 3,
    "manager": 8,
    "employee": 35
  }
}
```

`stats` — joriy scoping va filtrlar (kompaniya/filial/bo'lim/lavozim/holat/qidiruv) doirasida, lekin **`role` filtridan mustaqil ravishda** har bir rol bo'yicha jami sonni ko'rsatadi (Prisma `groupBy` orqali, `user.service.ts`dagi `findAll()`). Masalan, `manager` chaqirganda natija har doim faqat `{ employee: N, boshqalari: 0 }` ko'rinishida bo'ladi, chunki manager boshqa rollarni umuman ko'ra olmaydi.

## 6. Userning to'liq ma'lumotlari (`USER_SELECT`)

Har bir `GET`/`PATCH` javobida qaytariladigan to'liq maydonlar ro'yxati (`user.service.ts`):

```
id, login, role,
companyId, branchId, departmentId, positionId, managerId, workScheduleId,
employeeNo, firstName, lastName, middleName,
phone, email, address, passportSerial, dateOfBirth,
avatarUrl,               // <- profil rasmi (URL)
faceDeviceUserId, faceImageUrl,   // <- yuzni tanish uchun rasm URL (attendance/turnstile)
baseSalary,
isActive, isBlocked,
createdAt, updatedAt
```

**Rasm haqida**: user obyektida ikkita rasm maydoni bor —
- `avatarUrl` — foydalanuvchi profil rasmi (o'zi `PATCH /users/me` orqali o'zgartira oladi);
- `faceImageUrl` — yuzni tanish (face recognition) uchun mo'ljallangan referens rasm, attendance check-in/check-out'da solishtiriladigan rasm (faqat superadmin/admin `PATCH /users/:id` orqali o'zgartira oladi, `employee`'ning o'zi emas).

`passwordHash` hech qachon javobda qaytarilmaydi (select ro'yxatida yo'q).

## 7. Company/Branch scoping mantig'i

Scoping umumiy `src/common/utils/scope.util.ts` yordamchi funksiyalari orqali amalga oshiriladi:

- **`getScope(actor, requested)`** — `GET /users` uchun: `superadmin` so'ralgan filtrlarni o'zgarishsiz qabul qiladi; `admin` uchun `companyId` majburiy `actor.companyId`ga almashtiriladi; `manager` uchun ham `companyId`, ham `branchId` majburiy `actor.companyId`/`actor.branchId`ga almashtiriladi. Doiradan tashqari qiymat so'ralsa — `403`.
- **`getCompanyId(actor, providedCompanyId)`** — `POST /users` uchun: `superadmin`da `companyId` DTOda berilishi shart emas (chunki `User.companyId` nullable); `admin`da avtomatik `actor.companyId` bilan to'ldiriladi, boshqa qiymat yuborsa — `403`.
- **`checkAccess(actor, target)`** — mavjud yozuv ustida amal (`findOne`/`update`/`toggle-*`/`delete`/`me`) bajarishdan oldin: `admin` uchun `target.companyId !== actor.companyId` bo'lsa `403`; `manager` uchun qo'shimcha `target.branchId !== actor.branchId` bo'lsa ham `403`.
- **Manager + rol cheklovi** (faqat User modulida, `assertUserWithinScope` orqali) — manager uchun nishon userning `role !== 'employee'` bo'lsa, scoping to'g'ri bo'lsa ham — `403`.

## 8. DTO'lar (`./dto/`)

- **`CreateUserDto`** — `login`, `password` majburiy; qolgan hammasi ixtiyoriy.
- **`UpdateUserDto`** — `CreateUserDto`dan `password`siz, barcha maydonlar ixtiyoriy (`PartialType`). `PATCH /users/:id` uchun.
- **`UpdateOwnProfileDto`** — `CreateUserDto`dan faqat profil maydonlari (`PickType`): `firstName`, `lastName`, `middleName`, `phone`, `email`, `address`, `passportSerial`, `dateOfBirth`, `avatarUrl`. `PATCH /users/me` uchun.
- **`UserQueryDto`** — `companyId`, `branchId`, `departmentId`, `positionId`, `role`, `isActive`, `isBlocked`, `search`, `page`, `limit`.
- **`ToggleUserStatusDto`** — ixtiyoriy `isActive` (berilmasa, hozirgi qiymat teskarisiga o'giriladi).
- **`ToggleUserBlockedDto`** — ixtiyoriy `isBlocked` (xuddi shunday).
- **`ChangePasswordDto`** — `newPassword` majburiy.

## 9. Xatolik holatlari (barchasi HTTP status bilan)

| Holat | Status | Xabar |
|---|---|---|
| Token yo'q/noto'g'ri | 401 | `Bearer token is required` / `Invalid token signature` / `Token expired` |
| Rol ruxsat etilmagan | 403 | `You do not have access to this resource` |
| Boshqa kompaniya/filial ma'lumotiga urinish | 403 | `You cannot access another company's data` / `...branch's data` |
| Manager boshqa rolga tegishli userga urinishi | 403 | `Manager can only manage employee-role users` |
| Manager role/companyId/branchId o'zgartirmoqchi | 403 | `Manager cannot change role, company or branch` |
| superadminni yaratish/tahrirlash/o'chirishga urinish | 403 | `Cannot create/modify/delete a superadmin user` |
| User topilmadi | 404 | `User not found` |
| Login/email/employeeNo band | 409 | `Login already exists` / `Email already exists` / `Employee number already exists in this company` |

## 10. Misollar

### Admin o'z kompaniyasida employee yaratadi (companyId yubormasdan)
```http
POST /api/v1/users
Authorization: Bearer <admin_token>

{ "login": "aziz.karimov", "password": "StrongPass123", "role": "employee", "branchId": "<own-branch-uuid>" }
```
→ `companyId` avtomatik admin kompaniyasiga o'rnatiladi.

### Manager o'z filialidagi xodimlar ro'yxatini statistika bilan ko'radi
```http
GET /api/v1/users?page=1&limit=20
Authorization: Bearer <manager_token>
```
→ Faqat manager filialidagi `employee`lar, `stats.employee = N`, qolgan rollar `0`.

### Manager xodimning telefon raqamini tahrirlaydi (ruxsat)
```http
PATCH /api/v1/users/:employeeId
Authorization: Bearer <manager_token>

{ "phone": "+998907654321", "positionId": "<uuid>" }
```
→ ✅ o'tadi (`role`/`companyId`/`branchId` yuborilmagan).

### Manager xodimni boshqa filialga ko'chirishga urinadi (taqiqlangan)
```http
PATCH /api/v1/users/:employeeId
Authorization: Bearer <manager_token>

{ "branchId": "<boshqa-filial-uuid>" }
```
→ `403 "Manager cannot change role, company or branch"`.

### Har qanday rol o'zining profilini yangilaydi
```http
PATCH /api/v1/users/me
Authorization: Bearer <istalgan_token>

{ "firstName": "Yangi ism", "avatarUrl": "https://..." }
```

## 11. Bog'liq fayllar

- Scoping utilitalari: [`src/common/utils/scope.util.ts`](../../common/utils/scope.util.ts)
- Rol/guard mexanizmi: [`src/common/guards/roles.guard.ts`](../../common/guards/roles.guard.ts), [`src/common/guards/access-token.guard.ts`](../../common/guards/access-token.guard.ts)
- JWT payload: [`src/modules/auth/interfaces/auth-user-payload.interface.ts`](../auth/interfaces/auth-user-payload.interface.ts) — `sub`, `login`, `role`, `companyId`, `branchId`, `faceDeviceUserId`
- O'zini ko'rish (profil o'qish): `GET /api/v1/auth/me` — [`src/modules/auth/controllers/auth.controller.ts`](../auth/controllers/auth.controller.ts)
