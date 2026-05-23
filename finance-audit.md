# Chayxana POS — Moliyaviy oqim auditi

Sana: 2026-05-23
Branch: `main` (oxirgi commit: `a77bdcf`)
Hujjat doirasi: mahsulot yaratilishidan — buyurtma yopilishigacha — kunlik moliyaviy hisobotgacha bo'lgan butun zanjir. DB sxemasi, servislar, controllerlar va socket sinxroni tekshirildi.

---

## 1. Umumiy xulosa

Asosiy moliyaviy oqim **ishlamoqda va sxema bilan sinxron**. Schema, repository, service, controller va route qatlamlari aniq layered uslubda joylashgan; Prisma chaqiruvlari faqat `repositories/` ichida; barcha pul/zaxira o'zgartirishlari `$transaction` ichida atomik. Sotuv registri (kun bo'yicha sotilgan) va Pul oqimi registri (kun bo'yicha kassaga tushgan) FINANCE_IMPLEMENTATION_SPEC.md bo'yicha alohida hisoblanmoqda.

Asosiy nuqtalar:

- `Order.status` mashina: `DRAFT → SENT → CLOSED` (yagona yo'l `/confirm`), `SENT → WALKOUT`, `DRAFT|SENT → CANCELED`. Server tomonda atomik `updateMany` orqali himoyalangan (`order.repo.ts:setStatus`).
- Hisob-kitob formulasi (`billing.service.ts`): `subtotal = FOOD qatorlari`, `discount` faqat FOOD ga, `serviceCharge = SERVICE turidagi qatorlar`, `total = (subtotal − discount) + serviceCharge`. Chegirma cheklovlari `max_discount_percent` va `max_discount_amount` setting orqali tekshiriladi.
- Zaxira: `consumption.service.ts` retsept yoki `selfIngredient` orqali ingredientni atomik kamaytiradi; yetmasa `OUT_OF_STOCK` xatosi va butun tranzaksiya orqaga qaytadi.
- Qarz: `confirm` ichida `Payment.method = DEBT` bo'lsa, `Debt` yozuvi yaratiladi (`debt.service.ts:createFromClosedOrder`) — bitta buyurtmaga bitta qarz (`@unique orderId`).
- Chiqim: immutable; `ACTIVE / REVERSED / REVERSAL` holatlari; bekor qilish faqat shu kunning o'zida.
- Hisobot: `reports.service.ts` (owner) ikkala registrni sof ajratgan holda hisoblaydi; `finance.service.ts` (admin) — operatsion ko'rinish, foydani ko'rsatmaydi.
- Telegram: `scheduler.ts` har 60 soniyada `runScheduledDailyTelegram` va `runScheduledMonthlyTelegram` ni chaqiradi; setting flag orqali idempotent.

---

## 2. Mahsulot va menyu yaratilishi

### Modul: `menu.service.ts`, `menu.repo.ts`
- `createCategory` → `Category` yozuvi.
- `createItem(kind = FOOD | SERVICE)` → `MenuItem` yozuvi. `kind=SERVICE` ofitsiant xizmat haqi qatori sifatida qo'shiladi va hisob-kitobda alohida `serviceCharge` ga to'planadi.
- `createCombo` → `Combo` + `ComboComponent[]`. Buyurtmaga qo'shilganda har bir komponent alohida `OrderLine` ga aylanadi va bitta `comboGroupId` bilan birlashtiriladi.

### Modul: `ingredient.service.ts`, `recipe.service.ts`, `yield.service.ts`
- `Ingredient` mahsulot tarkibida ishlatiladigan xom-ashyo (`parentMenuItemId` orqali aniq taomga bog'langan, `@@unique([parentMenuItemId, name])`).
- `Recipe` taom uchun ingredient bog'lash va miqdor (recipe unit'da).
- `selfIngredient` — bevosita ingredientning o'zi taom sifatida sotiladigan holat (masalan portsiya go'sht).
- `yieldService.computeAll()` — har bir taom bo'yicha mavjud porsiya sonini hisoblab, mavjud bo'lmagan menyularni avtomatik beradi (`effectivelyAvertable=false`).

### Modul: `purchase.service.ts`
- `record(...)` atomik tranzaksiyada quyidagilarni bajaradi:
  1. `Expense` yozuvi yaratadi — `category = seed-cat-ingredients`, summa = xarid summasi.
  2. `Purchase` yozuvi `expenseId` bilan bog'lanadi.
  3. `Ingredient.currentStock` va `weightedAvgCost` yangilanadi:
     `newAvg = (oldStock·oldAvg + qty·unitCost) / (oldStock + qty)`.
  4. `IngredientMovement(type=PURCHASE)` yoziladi (ledger).
  5. `auditLog(PURCHASE_RECORDED)` `expenseId` bilan birga.
- `reverse(...)` — faqat shu kun, va agar `currentStock < quantityRecipeUnit` bo'lsa rad etadi (orqaga qaytarsa salbiy zaxira hosil bo'ladi). Mos `Expense` ham bir vaqtning o'zida `REVERSED` ga o'tib, qarama-qarshi `REVERSAL` yozuvi yaratiladi.

**Sinxronlik holati**: Xarid → Chiqim → Zaxira → Ledger to'liq atomik. Audit yozuvida `expenseId` keltirilgani uchun forensic tahlil mumkin. Tegishli yagona kichik nuans: `seed-cat-ingredients` kategoriya seedda mavjud bo'lishi shart, aks holda xarid `NotFound` xatosi beradi.

---

## 3. Buyurtma hayot sikli

### 3.1 DRAFT bosqichi
- `createDraft(...)` — DINE_IN uchun jadval majburiy, TAKEAWAY uchun esa jadval bo'lmasligi kerak. Bir stolda faqat bitta faol buyurtma (`P2002` → `Conflict`).
- `addLine` — agar shu menuItem ID bilan faol qator bo'lsa, **avtomatik birlashtiradi** (`updateQuantity`), yo'q bo'lsa yangi yaratadi. FOOD bo'lsa `consumptionService.consume` chaqiriladi; SERVICE bo'lsa zaxira ishlatilmaydi.
- `updateLineQuantity` — delta hisoblanadi: musbat delta → `consume`, manfiy delta — **faqat DRAFT bo'lganda** `restore`.
- `cancelLine` — qator `isCanceled=true` ga o'tadi, va faqat DRAFT bosqichida zaxira qaytariladi (`maybeRestoreLineStock`).

### 3.2 SENT bosqichi
- `send(...)` atomik `updateMany(where status=DRAFT)` orqali optimistik o'tkazadi. Faol qator yo'q bo'lsa `Validation` xatosi.
- SENT da admin qo'shimcha qator qo'shishi mumkin (zaxira consumesi davom etadi).
- `cancelLine` / `cancelOrder` SENT da ham mumkin, **lekin zaxira qaytarilmaydi** (taom tayyorlangan deb hisoblanadi). ⚠ Buyurtma yuborilgandan keyin admin qo'shgan yangi qatorlar bekor qilinganda ham qaytarilmaydi (consvariv, lekin haqiqatda taom tayyor emasligi mumkin). `fix/finance-soft-close-and-recipes` filiali bu kamchilikni `line.createdAt > order.sentAt` mantig'i bilan tuzatadi.

### 3.3 CLOSED bosqichi — `confirm(...)`
Bu yagona `SENT → CLOSED` yo'li. Atomik tranzaksiya 30 soniya `timeout` bilan:

1. `getOrderOrThrow` — yangi order ma'lumotini oladi, status `SENT` ekanini tekshiradi.
2. `payments` ichida `DEBT` bo'lsa va `debt.debtorName` bo'sh bo'lsa → `DEBT_METADATA_REQUIRED` (400).
3. `billingService.computeTotals(...)` — totalsni hisoblaydi; chegirma cheklovi tekshiriladi.
4. Tekshiruv: `sum(payments.amount) === total` — bo'lmasa `PAYMENT_MISMATCH` (400).
5. `orderRepo.setApproval` (approvedAt, approvedById, discountId, serviceChargeWaived) → `applyTotals` (snapshot).
6. `paymentRepo.createMany(...)` — barcha to'lov satrlari.
7. Agar DEBT bor bo'lsa: `debtService.createFromClosedOrder(...)` — `Debt` (`originalAmount = remainingAmount = debt summasi`, `openedAt = closedAt`) va `DEBT_CREATED` audit yozuvi.
8. `printService.printBill(order, tx)` — **bloklovchi**. Print xatosi bo'lsa butun tranzaksiya orqaga qaytadi va status SENT da qoladi. (PrintJob row tranzaksiyaga ulanadi, aks holda SQLite write-lock deadlock bo'lar edi.)
9. `orderRepo.setClosed(closedAt)` — agar boshqa thread orqali holat o'zgargan bo'lsa, `IllegalStateTransition`.
10. `auditService.log(ORDER_CONFIRMED, …)` va `socket: order:closed` admin/waiter xonalariga.

### 3.4 Terminal va xato yo'llari
- `markWalkout(...)` — `SENT → WALKOUT` faqat admin. Zaxira qaytarilmaydi (taom iste'mol qilindi). Audit metadata da `totalSnapshot` saqlanadi.
- `cancelOrder(...)` — `DRAFT` yoki `SENT` dan `CANCELED` ga. Faqat DRAFT da zaxira qaytariladi. Reason majburiy.
- `reprintBill(...)` — CLOSED va WALKOUT uchun. `RECEIPT_REPRINTED` audit.

**Sinxronlik holati**: Order zanjiri ehtiyotkorlik bilan yozilgan. To'lov yig'indisi qattiq tekshiriladi, qarz metadata majburiy, print xatosi butunlikni saqlaydi. Bitta og'rinarli joy — print bloklovchi bo'lganligi sababli, printer uzilgan bo'lsa admin buyurtmani CLOSED qila olmaydi. (Bu intentional: chek chiqmasa, buyurtma yopilmaydi.)

---

## 4. Chiqim moduli (`expense.service.ts`)

- **Yaratish** (`create`): summa > 0; agar `categoryId` berilmasa `seed-cat-operational` ga tushadi; `repayable=true` bo'lsa "avans/zalog" rejimida — qaytim olinmaguncha pul kassada chiqib ketgan ammo P&L da `operating` ga kirmaydi.
- **Reverse** (`reverse`): faqat shu kun, status `ACTIVE` va hech bekor qilinmagan bo'lsa. `REVERSAL` yozuvi qarama-qarshi summa bilan yaratiladi (status orqali signed amount: `REVERSAL → −amount`).
- **Return** (`recordReturn`): `repayable=true` chiqim qaytarish — `ExpenseReturn` yozuvi. Yig'indi original summadan oshmasligi tekshiriladi.
- **Write-off** (`writeOff`): faqat `repayable`. Qaytarib olishdan voz kechilgan summa loss sifatida P&L ga kiritiladi.

### Yig'indi hisoblash mantig'i (`listByDate`)
- `gross = ACTIVE + REVERSED` (formal yig'indi)
- `reversal = REVERSAL` summalari
- `net = gross − reversal` (kassa drenaji)
- `operating = (non-repayable ACTIVE+REVERSED) + (written-off repayable ning qaytmagan qismi) − REVERSAL` (P&L uchun)
- `pendingRepayable = (repayable, written-off emas) summalar — qaytim` (receivable, expense emas)

**Sinxronlik holati**: Schemada `ExpenseStatus`, `repayable`, `writtenOffAt`, `purchaseId` to'liq mavjud. Service immutability ni hurmat qiladi (PATCH/DELETE endpoint yo'q). `EXPENSE_IMMUTABLE` xato kodi `errors.ts` da mavjud. Auditda har bir holat (`EXPENSE_CREATED`, `EXPENSE_REVERSED`, `EXPENSE_RETURN_RECEIVED`, `EXPENSE_WRITTEN_OFF`) yoziladi.

---

## 5. Qarz moduli (`debt.service.ts`)

- **Yaratilish**: faqat `order.service.confirm` orqali, `Payment.method=DEBT` qatorisi va `debt.debtorName` bo'lsa. Bitta order = bitta qarz (`@unique orderId`).
- **Repayment** (`recordRepayment`): faqat `CASH | CARD` (DEBT method rad etiladi); summa > 0 va `<= remainingAmount`. To'liq to'langanda `status=PAID`, `closedAt=paidAt`, va `DEBT_CLOSED` audit yoziladi.
- **Write-off** (`writeOff`): qoldiq summani loss sifatida belgilash. Sabab matni majburiy (`Validation`). Audit metadata: `originalAmount`, `remainingAtWriteOff`.

**Sinxronlik holati**: `DebtStatus.WRITTEN_OFF` enumda mavjud (specdan ortiq, lekin foydali). Hisobotda `outstanding` hisoblanishida write-off lar nolga tenglashtiriladi (`reports.service.ts:buildDebtLedger`) — to'g'ri.

---

## 6. Hisobot moduli

### 6.1 Owner Daily Z-Report — `reports.service.daily(date)`
Bir nechta parallel so'rovlar bilan boshlanadi: closed/canceled/walkout orderlar, expense summary, debtlar (kun oxirigacha barcha ochiq qarzlar).

Hisoblashlar (`FINANCE_IMPLEMENTATION_SPEC.md §6` bo'yicha):

| Maydon | Formula | Implementatsiya |
| --- | --- | --- |
| `grossSales` | Σ `subtotalSnapshot` CLOSED orderlar bo'yicha (closedAt = D) | `reports.service.ts:306` |
| `discounts` | Σ `discountAmountSnapshot` | `:307` |
| `netSales` | `grossSales − discounts` | `:371` |
| `debtSales` | Σ `Payment.amount` WHERE method=DEBT | `:311` |
| `serviceCharge` | Σ `serviceChargeSnapshot` | `:308` |
| `orderCash` / `orderCard` | Σ Payment CASH/CARD | `:309-310` |
| `debtRepaymentsCash` / `debtRepaymentsCard` | Σ DebtRepayment paidAt=D | `:354-359` |
| `realCashIn` | `orderCash + orderCard + debtRepaymentsCash + debtRepaymentsCard` | `:372` |
| `expense.net` / `operating` / `pendingRepayable` | `expenseService.listByDate(D)` | `:373-377` |
| `salesBasedProfit` | `netSales − operating` | `:378` |
| `cashflowBasedNet` | `realCashIn − expenseNet` | `:379` |
| `outstandingTotal` | Σ `remainingAmount` kun oxirida (write-off ni 0 deb hisoblab) | `buildDebtLedger` |

Qo'shimcha `checks` bloki: `billedTotal vs paymentTotal` ayirmasini ko'rsatadi (debugging uchun).

### 6.2 Owner Monthly — `reports.service.monthly(monthStart)`
Har bir kun uchun `daily(D)` chaqiradi va totalsni jamlaydi. ⚠ Ketma-ket, oydagi 28–31 ta query — kichik bir lokatsiya uchun normal, kelajakda agregat query'ga olib chiqilishi mumkin.

### 6.3 Admin Daily Cash Flow — `finance.service.dailyForAdmin(date)`
Yopilgan orderlar, qarz qaytimlari, xaridlar, chiqimlar, va kassa harakati (`drawerMovement = totalIn − totalOut`). Foydani ko'rsatmaydi (admin owner-only ekranga kira olmaydi).

### 6.4 Telegram — `telegram-bot.service.ts` + `finance-report.service.ts`
- Bot Telegraf orqali ishga tushadi, faqat `owner_telegram_chat_id` chati javob beradi (middleware).
- Buyruqlar: `/bugun /kecha /hafta /oylik /oy /sana /oldin /qarzlar /xarajatlar /omborxona /pdf /yordam`. Inline tugmalar ham mavjud.
- PDF (`/pdf`) — `pdf-report` modulida server tomonda PDFKit bilan tuziladi (renderer DOM screenshot emas).
- Scheduler: har 60 soniyada `daily_report_telegram_enabled` flag va `daily_report_telegram_time` (default `23:30`) ni tekshiradi; o'tib ketgan bo'lsa va `daily_report_last_sent_date` boshqacha bo'lsa, yuboradi va flag yangilanadi. Monthly — oyning 1-kuni `monthly_report_telegram_time` (default `09:00`) dan keyin.
- Xato bo'lsa `REPORT_SEND_FAILED` audit yozuvi, success da `REPORT_SENT`.

**Sinxronlik holati**: Spec bilan to'liq mos. RBAC `reports.routes.ts` da owner-only (`requireRole('OWNER')`).

---

## 7. RBAC va Audit

| Endpoint | Ruxsat |
| --- | --- |
| `/api/orders` POST/items/lines/send | WAITER, OWNER |
| `/api/orders/:id/confirm` | ADMIN, OWNER |
| `/api/orders/:id/mark-walkout` | ADMIN, OWNER |
| `/api/orders/:id/reprint-bill` | ADMIN, OWNER |
| `/api/finance/*` | ADMIN, OWNER |
| `/api/expenses/*` | ADMIN, OWNER |
| `/api/debts/*` | ADMIN, OWNER |
| `/api/reports/daily|monthly` | **OWNER** |

Audit `AuditAction` enum specdan kengaytirilgan: `EXPENSE_RETURN_RECEIVED`, `EXPENSE_WRITTEN_OFF`, `DEBT_WRITTEN_OFF`, va xom-ashyo lifecycle action lar (`INGREDIENT_*`, `PURCHASE_*`, `RECIPE_*`, `STOCKTAKE_*`, `WASTE_RECORDED`).

---

## 8. Sinxronlik tekshiruvi — DB ↔ Service ↔ Controller

| Yo'nalish | Tekshirildi | Holat |
| --- | --- | --- |
| Schema enum'lari (PaymentMethod, ExpenseStatus, DebtStatus) ↔ TS kod | `@prisma/client` import barcha servisda mavjud | ✅ |
| `Order.subtotalSnapshot` / `discountAmountSnapshot` / `serviceChargeSnapshot` ↔ report hisoblari | snapshot maydonlari closedAt da yoziladi va reportlar shularga tayanadi | ✅ |
| `Payment.method=DEBT` ↔ `Debt` yaratilishi | `confirm` ichida bir tranzaksiyada birga | ✅ |
| `Expense.purchaseId` ↔ Xarid reverse → Expense reverse | `purchase.service.reverse` ichida atomik | ✅ |
| `Ingredient.currentStock` ↔ `IngredientMovement` ledger | har bir kamaytirish/oshirishda movement yozuvi | ✅ |
| `Order.status` o'tishlari ↔ `updateMany(where status=expectedFrom)` | Race condition'dan himoyalangan | ✅ |
| Print xato → tranzaksiya rollback | Print `tx` bilan birga | ✅ |
| Socket emit `order:*` ↔ TanStack Query cache invalidation | renderer `useSocket` orqali | ✅ |
| Scheduler idempotency ↔ `*_last_sent_*` settinglari | har yuborishdan keyin yangilanadi | ✅ |

---

## 9. Aniqlangan kamchiliklar va tavsiyalar

### 9.1 Hujjat va kod nomuvofiqligi (kichik)
- `FINANCE_IMPLEMENTATION_SPEC.md §4.4` da `POST /api/orders/:id/mark-paid` deyilgan, kod esa `/confirm` ishlatadi. `decisions.md` `/confirm` ga to'g'ri tushadi. **Tavsiya**: spec'ni `confirm` ga yangilash.
- Bir nechta eski PRD hujjatlarida `mark-paid` qoldiqlari bor (`docs/prd/*`, `docs/agent-plans/*`).

### 9.2 Time-zone xavf-xatari
- `reports.service.dayBounds(date)` va `finance.service.dayRange(date)` `setHours(0,0,0,0)` ishlatadi — server **mahalliy** TZ'sida. Master Windows kompyuterda Asia/Tashkent bo'lsa to'g'ri, ammo agar boshqa TZ'da ishlasa kun chegarasi siljiydi.
- `fix/finance-soft-close-and-recipes` filialida `lib/date.ts` ichida Asia/Tashkent qattiq biriktirilgan. **Tavsiya**: o'sha filialni `main` ga birlashtirish.

### 9.3 Post-SENT zaxira tiklanmasligi
- Admin SENT order ga qator qo'shgandan keyin uni bekor qilsa, zaxira qaytarilmaydi (`maybeRestoreLineStock` faqat DRAFT da). Bu konservativ, lekin yangi qo'shilgan qator hali tayyorlanmagan bo'lishi mumkin.
- `fix/finance-soft-close-and-recipes` da `line.createdAt > order.sentAt` mantig'i qo'shilgan — birlashtirilishi tavsiya etiladi.

### 9.4 Outflow ikki marta hisoblash xavfi
- `finance.dailyForAdmin` da `purchasesTotal` alohida ko'rsatilgan, ammo xaridning Expense yozuvi `gross` ichida ham bor. Ayni paytda `totalOut` faqat `gross − reversal` dan olinadi, ya'ni qo'sh hisob yo'q. ⚠ Ammo agar kelajakda UI tomonda `purchasesTotal + expensesNet` formulasi qo'shilsa — qo'sh hisob bo'ladi.

### 9.5 Walkout buckling `updatedAt` bo'yicha
- Reportda `walkoutOrders` `updatedAt: { gte, lt }` bilan filtirlanadi. Walkout belgilanganidan keyin order qayta o'zgartirilsa (masalan reprint), `updatedAt` siljishi mumkin. **Tavsiya**: alohida `walkoutAt` yoki `canceledAt` ga o'xshash markaziy ustun.

### 9.6 Walkout `markedBy` noaniq
- Report `walkouts[].markedBy = order.approvedById ?? 'unknown'` — lekin walkout approval flow'dan o'tmaydi. Audit log to'g'ri `userId` ga ega. **Tavsiya**: report `markedBy` ni `auditLog.WALKOUT_MARKED.userId` dan olish yoki schemaga `walkoutById` qo'shish.

### 9.7 Print bloklash UX
- Printer uzilgan bo'lsa `confirm` butunlay rad etadi. Lokal chayxana uchun mantiqiy, ammo printer uzoq vaqt ishlamasa kunlik moliyaviy yopilish butun to'xtaydi. **Tavsiya**: "print xatosi → keyinroq qayta urinish" rejimi (lekin spec hozir aniq blocking deydi, shuning uchun spec o'zgartirilmasa o'zgartirmaslik kerak).

### 9.8 Birlashtirilmagan branchlar
Asosiy o'zgarishlar `main` da hali yo'q, lekin ishlab chiqilgan:
- `fix/draft-table-occupancy` — yuborilmagan draftlar stolni egallamasligi.
- `fix/finance-soft-close-and-recipes` — Daily Soft-Close (`DailyClose` model), `sentAt`, `isAdjustment`, TZ-lock, double-count fix, post-send stock fix.

**Tavsiya**: ushbu ikkala filialni audit qilib `main` ga olib o'tish.

---

## 10. Tekshirilgan fayllar (asosiy)

```
apps/master/prisma/schema.prisma
apps/master/src/main/server/services/{order,billing,debt,expense,purchase,
                                      consumption,reports,finance,
                                      finance-report,telegram-bot,
                                      print,menu,ingredient,recipe,yield}.service.ts
apps/master/src/main/server/repositories/{order,payment,debt,expense,
                                         purchase,ingredient,
                                         ingredientMovement,recipe,menu}.repo.ts
apps/master/src/main/server/routes/{orders,debt,expense,finance,reports,
                                    purchase,ingredient}.routes.ts
apps/master/src/main/server/controllers/orders.controller.ts
apps/master/src/main/server/lib/{errors,scheduler,socket-events}.ts
docs/FINANCE_IMPLEMENTATION_SPEC.md
docs/agent-plans/00-shared/decisions.md (issored)
```

---

## 11. Yakuniy hukm

**Asosiy moliyaviy zanjir ishlab turibdi va specga sinxron.** Atomiklik, RBAC, audit, snapshot mantig'i va ikki registr (savdo / pul oqimi) ajratish to'g'ri implementatsiya qilingan. Ortda qolgan kichik nuanslarni hal qilish uchun ikkita ochiq filial allaqachon mavjud — ularni birlashtirish keyingi qadam. Yangi spec o'zgarishlari kerak emas; mavjud spec hujjati `confirm` endpoint nomiga va Asia/Tashkent TZ qaroriga moslashtirilishi tavsiya etiladi.
