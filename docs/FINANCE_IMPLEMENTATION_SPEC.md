# Chayxana POS — Moliya Implementatsiya Spetsifikatsiyasi

Bu hujjat [FINANCE_PLAN.md](./FINANCE_PLAN.md) dagi biznes qoidalarni aniq implementatsiya darajasiga tushiradi.

Bu yerda quyidagilar belgilangan:

1. schema o'zgarishlari
2. endpointlar
3. hisoblash formulalari
4. maxfiylik qoidalari
5. xatolik holatlari

## 1. Scope

V1 moliya moduli quyidagilarni qamrab oladi:

1. qarzga savdo
2. qarz qaytimi
3. immutable chiqimlar
4. chiqim reversal yozuvlari
5. owner uchun to'liq moliyaviy hisobot
6. admin uchun operatsion moliya ekranlari
7. owner uchun Telegram orqali kunlik hisobot

V1 ga kirmaydi:

1. ingredient tannarxi
2. avtomatik COGS
3. supplier ledger
4. payroll hisoblash formulalari
5. Excel/PDF export

## 2. Asosiy arxitektura qarori

Moliya ikkita alohida registr sifatida yuritiladi:

1. `Savdo registri`
2. `Pul oqimi registri`

### 2.1. Savdo registri

Savdo registri buyurtma qaysi kuni sotilganini ko'rsatadi.

Bu yerda quyidagilar aks etadi:

1. brutto savdo
2. chegirmalar
3. sof savdo
4. qarzga savdo
5. walkout
6. cancel

### 2.2. Pul oqimi registri

Pul oqimi registri real pul qaysi kuni kelganini ko'rsatadi.

Bu yerda quyidagilar aks etadi:

1. shu kuni naqd tushum
2. shu kuni karta tushum
3. bugun qaytgan eski qarzlar
4. shu kundagi chiqimlar

Bu ikki registr aralashtirilmaydi.

## 3. Schema o'zgarishlari

## 3.1. Mavjud `PaymentMethod` enum

Hozir:

1. `CASH`
2. `CARD`

Qo'shiladi:

3. `DEBT`

Yangi ko'rinish:

```prisma
enum PaymentMethod {
  CASH
  CARD
  DEBT
}
```

Qoidalar:

1. `DEBT` faqat `POST /api/orders/:id/mark-paid` da ishlatiladi
2. `DEBT` miqdori `0` dan katta bo'lsa qarz yozuvi yaratiladi

## 3.2. `ExpenseCategory` modeli

Chiqim turi va foydalanuvchi yozgan sabab bir-biridan alohida bo'ladi.

```prisma
model ExpenseCategory {
  id           String   @id @default(cuid())
  name         String
  displayOrder Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  expenses     Expense[]

  @@unique([name])
  @@index([isActive])
  @@index([displayOrder])
}
```

Seed qilinadigan boshlang'ich kategoriyalar:

1. Go'sht
2. Sabzavot
3. Ichimlik
4. Transport
5. Xo'jalik
6. Ishchilar oyligi
7. Avans
8. Boshqa

## 3.3. `ExpenseStatus` enum

```prisma
enum ExpenseStatus {
  ACTIVE
  REVERSED
  REVERSAL
}
```

## 3.4. `Expense` modeli

`Expense` immutable bo'ladi. Oddiy `edit` va `delete` bo'lmaydi.

```prisma
model Expense {
  id                String        @id @default(cuid())
  categoryId        String
  amount            Decimal
  reason            String
  note              String?
  occurredAt        DateTime
  status            ExpenseStatus @default(ACTIVE)
  reversedExpenseId String?
  createdById       String
  createdAt         DateTime      @default(now())

  category          ExpenseCategory @relation(fields: [categoryId], references: [id])
  reversedExpense   Expense?        @relation("ExpenseReversal", fields: [reversedExpenseId], references: [id])
  reversals         Expense[]       @relation("ExpenseReversal")
  createdBy         User            @relation(fields: [createdById], references: [id])

  @@index([occurredAt])
  @@index([categoryId])
  @@index([status])
  @@index([createdById])
}
```

Qoidalar:

1. `ACTIVE` oddiy yozuv
2. `REVERSED` bekor qilingan original yozuv
3. `REVERSAL` original yozuvni nolga tushirish uchun yaratilgan qarshi yozuv

`REVERSAL` yozuvda:

1. `amount` original bilan bir xil saqlanadi
2. report yig'indisida manfiy sifatida hisoblanadi
3. `reversedExpenseId` orqali originalga bog'lanadi

Prisma modelda manfiylikni alohida flag bilan emas, `status` va report algoritmi bilan boshqaramiz. Bu DB yozuvni audit uchun sodda saqlaydi.

## 3.5. `DebtStatus` enum

```prisma
enum DebtStatus {
  OPEN
  PARTIAL
  PAID
}
```

## 3.6. `Debt` modeli

Bir buyurtmadan ko'pi bilan bitta qarz yozuvi chiqadi.

```prisma
model Debt {
  id              String     @id @default(cuid())
  orderId         String     @unique
  debtorName      String
  debtorPhone     String?
  note            String?
  originalAmount  Decimal
  remainingAmount Decimal
  openedAt        DateTime
  closedAt        DateTime?
  status          DebtStatus @default(OPEN)
  createdById     String
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  order           Order            @relation(fields: [orderId], references: [id])
  createdBy       User             @relation(fields: [createdById], references: [id])
  repayments      DebtRepayment[]

  @@index([status])
  @@index([openedAt])
  @@index([createdById])
  @@index([debtorName])
}
```

## 3.7. `DebtRepayment` modeli

Qarz qaytganda alohida yozuv tushadi.

```prisma
model DebtRepayment {
  id           String        @id @default(cuid())
  debtId        String
  amount        Decimal
  method        PaymentMethod
  paidAt        DateTime
  note          String?
  receivedById  String
  createdAt     DateTime     @default(now())

  debt          Debt         @relation(fields: [debtId], references: [id], onDelete: Cascade)
  receivedBy    User         @relation(fields: [receivedById], references: [id])

  @@index([debtId])
  @@index([paidAt])
  @@index([receivedById])
}
```

Qoidalar:

1. `method` bu yerda faqat `CASH` yoki `CARD`
2. `DEBT` repayment method sifatida ishlatilmaydi

## 3.8. `AuditAction` kengaytiriladi

Quyidagilar qo'shiladi:

```prisma
enum AuditAction {
  ...
  EXPENSE_CREATED
  EXPENSE_REVERSED
  DEBT_CREATED
  DEBT_PAYMENT_RECORDED
  DEBT_CLOSED
  REPORT_SENT
  REPORT_SEND_FAILED
}
```

## 4. Route va access qoidalari

## 4.1. Role policy

### `ADMIN` ruxsatlari

`ADMIN` quyidagilarga kira oladi:

1. expense category list
2. expense create
3. expense list
4. expense reversal
5. debt list
6. debt details
7. debt repayment create

`ADMIN` quyidagilarga kira olmaydi:

1. owner daily report
2. owner monthly report
3. Telegram settings

### `OWNER` ruxsatlari

`OWNER` hamma moliyaviy endpointlarga kira oladi.

## 4.2. Expense API

### `GET /api/expense-categories`

Roles:

1. `ADMIN`
2. `OWNER`

Response:

```ts
Array<{
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}>
```

### `GET /api/expenses?date=YYYY-MM-DD`

Roles:

1. `ADMIN`
2. `OWNER`

Response:

```ts
{
  date: string;
  items: Array<{
    id: string;
    categoryId: string;
    categoryName: string;
    amount: string;
    signedAmount: string;
    reason: string;
    note: string | null;
    occurredAt: string;
    status: 'ACTIVE' | 'REVERSED' | 'REVERSAL';
    reversedExpenseId: string | null;
    createdById: string;
    createdByName: string;
  }>;
  totals: {
    gross: string;
    reversal: string;
    net: string;
  };
}
```

Bu yerda:

1. `gross` faqat `ACTIVE`
2. `reversal` faqat `REVERSAL`
3. `net = gross - reversal`

### `POST /api/expenses`

Roles:

1. `ADMIN`
2. `OWNER`

Request:

```ts
{
  categoryId: string;
  amount: string;      // butun so'm
  reason: string;
  note?: string;
  occurredAt: string;  // ISO datetime
}
```

Validation:

1. `amount > 0`
2. `reason.trim().length >= 3`
3. `occurredAt` bo'sh bo'lmasligi kerak

Response:

```ts
{
  id: string;
  ...
}
```

### `POST /api/expenses/:id/reverse`

Roles:

1. `ADMIN`
2. `OWNER`

Request:

```ts
{
  note: string;
}
```

Qoidalar:

1. original yozuv `ACTIVE` bo'lishi kerak
2. bir yozuv bir marta reversal qilinadi
3. original `REVERSED` ga o'tadi
4. yangi `REVERSAL` yozuv yaratiladi

Oddiy `PATCH /api/expenses/:id` va `DELETE /api/expenses/:id` bo'lmaydi.

## 4.3. Debt API

### `GET /api/debts?status=OPEN|PARTIAL|PAID&date=YYYY-MM-DD`

Roles:

1. `ADMIN`
2. `OWNER`

Response:

```ts
{
  items: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    debtorName: string;
    debtorPhone: string | null;
    note: string | null;
    originalAmount: string;
    remainingAmount: string;
    repaidAmount: string;
    openedAt: string;
    closedAt: string | null;
    status: 'OPEN' | 'PARTIAL' | 'PAID';
  }>;
}
```

### `GET /api/debts/:id`

Roles:

1. `ADMIN`
2. `OWNER`

Response:

```ts
{
  id: string;
  order: {
    id: string;
    orderNumber: string;
    closedAt: string | null;
    totalSnapshot: string;
  };
  debtorName: string;
  debtorPhone: string | null;
  note: string | null;
  originalAmount: string;
  remainingAmount: string;
  status: 'OPEN' | 'PARTIAL' | 'PAID';
  repayments: Array<{
    id: string;
    amount: string;
    method: 'CASH' | 'CARD';
    paidAt: string;
    note: string | null;
    receivedByName: string;
  }>;
}
```

### `POST /api/debts/:id/repayments`

Roles:

1. `ADMIN`
2. `OWNER`

Request:

```ts
{
  amount: string;
  method: 'CASH' | 'CARD';
  paidAt?: string; // default now
  note?: string;
}
```

Validation:

1. `amount > 0`
2. `amount <= remainingAmount`
3. `debt.status !== PAID`

Behavior:

1. `DebtRepayment` yaratadi
2. `remainingAmount` kamayadi
3. `remainingAmount = 0` bo'lsa `Debt.status = PAID`
4. `closedAt = paidAt`

## 4.4. Order mark-paid o'zgarishi

Mavjud endpoint:

`POST /api/orders/:id/mark-paid`

Endi `payments` ichida `DEBT` ham bo'lishi mumkin.

Yangi request:

```ts
{
  payments: Array<{
    method: 'CASH' | 'CARD' | 'DEBT';
    amount: string;
    reference?: string;
  }>;
  debt?: {
    debtorName: string;
    debtorPhone?: string;
    note?: string;
  };
}
```

Qoida:

1. agar `payments` ichida `DEBT` bo'lsa `debt` bloki majburiy
2. `DEBT` payment summasi bo'yicha `Debt` yozuvi yaratiladi
3. buyurtma baribir `CLOSED` ga o'tadi
4. bu qarz bor `CLOSED` order bo'lishi mumkin

## 4.5. Reports API

Owner-only bo'lib qoladi:

1. `GET /api/reports/daily?date=YYYY-MM-DD`
2. `GET /api/reports/monthly?month=YYYY-MM`

`ADMIN` bu endpointlarda `403 FORBIDDEN` oladi.

## 5. Report DTO

## 5.1. Daily report DTO

```ts
{
  date: string;
  sales: {
    closedOrders: number;
    canceledOrders: number;
    walkoutOrders: number;
    grossSales: string;
    discounts: string;
    netSales: string;
    debtSales: string;
    serviceCharge: string;
  };
  cashflow: {
    orderCash: string;
    orderCard: string;
    debtRepaymentsCash: string;
    debtRepaymentsCard: string;
    realCashIn: string;
  };
  expenses: {
    gross: string;
    reversal: string;
    net: string;
    byCategory: Array<{
      categoryId: string;
      categoryName: string;
      amount: string;
    }>;
  };
  results: {
    salesBasedProfit: string;
    cashflowBasedNet: string;
  };
  debtSnapshot: {
    openedTodayCount: number;
    openedTodayAmount: string;
    repaidTodayAmount: string;
    outstandingTotal: string;
  };
  walkouts: Array<...>;
  cancellations: Array<...>;
}
```

## 5.2. Monthly report DTO

```ts
{
  month: string;
  totals: {
    grossSales: string;
    discounts: string;
    netSales: string;
    debtSales: string;
    realCashIn: string;
    expensesNet: string;
    salesBasedProfit: string;
    cashflowBasedNet: string;
    outstandingDebtEndOfMonth: string;
  };
  daily: DailyReport[];
}
```

## 6. Aniq hisoblash formulalari

Quyidagi formulalar kodda aynan shu ma'noda ishlatiladi.

## 6.1. Savdo bloki

Kun `D` uchun:

1. `grossSales(D)`
   - `closedAt` kuni `D` bo'lgan `CLOSED` orderlar `subtotalSnapshot` yig'indisi

2. `discounts(D)`
   - o'sha orderlar `discountAmountSnapshot` yig'indisi

3. `netSales(D)`
   - `grossSales(D) - discounts(D)`

4. `debtSales(D)`
   - `closedAt` kuni `D` bo'lgan `CLOSED` orderlar ichidagi `Payment.method = DEBT` summalari yig'indisi

5. `serviceCharge(D)`
   - `serviceChargeSnapshot` yig'indisi

## 6.2. Pul oqimi bloki

1. `orderCash(D)`
   - `closedAt` kuni `D` bo'lgan `CLOSED` orderlarda `Payment.method = CASH`

2. `orderCard(D)`
   - `closedAt` kuni `D` bo'lgan `CLOSED` orderlarda `Payment.method = CARD`

3. `debtRepaymentsCash(D)`
   - `paidAt` kuni `D` bo'lgan `DebtRepayment.method = CASH`

4. `debtRepaymentsCard(D)`
   - `paidAt` kuni `D` bo'lgan `DebtRepayment.method = CARD`

5. `realCashIn(D)`
   - `orderCash(D) + orderCard(D) + debtRepaymentsCash(D) + debtRepaymentsCard(D) + expenseReturnsTotal(D)`
   - `expenseReturnsTotal(D)` — `receivedAt` kuni `D` bo'lgan `ExpenseReturn.amount` yig'indisi (avans/zalog qaytimi kassaga qaytadi).
   - Bu formula bitta util `lib/finance-formulas.ts:computeRealCashIn` orqali ADMIN va OWNER javoblarida bir xil hisoblanadi.

## 6.3. Chiqim bloki

1. `expenseGross(D)`
   - `occurredAt` kuni `D` bo'lgan `Expense.status = ACTIVE` yig'indisi

2. `expenseReversal(D)`
   - `occurredAt` kuni `D` bo'lgan `Expense.status = REVERSAL` yig'indisi

3. `expenseNet(D)`
   - `expenseGross(D) - expenseReversal(D)`

## 6.4. Yakuniy natijalar

1. `salesBasedProfit(D)`
   - `netSales(D) - expenseNet(D)`

2. `cashflowBasedNet(D)`
   - `realCashIn(D) - expenseNet(D)`

## 6.5. Qarz holati

1. `openedTodayAmount(D)`
   - `openedAt` kuni `D` bo'lgan `Debt.originalAmount` yig'indisi

2. `repaidTodayAmount(D)`
   - `paidAt` kuni `D` bo'lgan `DebtRepayment.amount` yig'indisi

3. `outstandingTotal(D_end)`
   - kun oxiri holatiga barcha `Debt.remainingAmount` yig'indisi

## 7. Qarz qaytgandagi tarixiy ko'rinish

Bu yerda ikki xil ko'rinish bo'ladi.

### 7.1. Order detail ekrani

Order detail ichida:

1. original qarz summasi
2. qolgan qarz
3. repayment tarixi
4. `to'landi` yoki `qisman to'landi` holati

Bu foydalanuvchiga "aynan nima olgani va qancha qarz bo'lgani" ni ko'rsatadi.

### 7.2. Tarixiy report

Eski kun reporti qayta ochilganda:

1. `debtSales` o'sha eski kunda o'z joyida turadi
2. debt holati order detailda yangilangan bo'lishi mumkin
3. lekin repayment summasi eski kunga retroaktiv ko'chirilmaydi

Bu ataylab shunday qoldiriladi. Aks holda bugungi real pul oqimi yashirinib qoladi.

## 8. Telegram yuborish qoidasi

Telegram hisobot:

1. faqat `OWNER`
2. kuniga 1 marta scheduler orqali
3. internet bo'lmasa `REPORT_SEND_FAILED` audit yozuvi tushadi
4. keyin retry qilinadi

Ownerga yuboriladigan minimal bloklar:

1. brutto savdo
2. chegirmalar
3. sof savdo
4. qarzga savdo
5. real tushgan pul
6. bugun qaytgan qarz
7. kunlik chiqimlar
8. savdo bo'yicha foyda
9. pul oqimi bo'yicha natija

## 9. Error code qo'shimchalari

Quyidagi error kodlar kerak bo'ladi:

1. `DEBT_METADATA_REQUIRED`
2. `DEBT_ALREADY_EXISTS`
3. `DEBT_NOT_OPEN`
4. `DEBT_OVERPAY`
5. `EXPENSE_IMMUTABLE`
6. `EXPENSE_ALREADY_REVERSED`
7. `EXPENSE_REVERSAL_INVALID`

## 10. Verification senariylari

Implementatsiyadan keyin kamida quyidagilar tekshiriladi:

1. 100% naqd savdo
2. 100% karta savdo
3. 100% qarz savdo
4. qisman naqd + qisman qarz
5. qarzga yozilgan order detail ko'rinishi
6. qarzning qisman qaytishi
7. qarzning to'liq yopilishi
8. bugun qaytgan qarzning cashflow reportda ko'rinishi
9. eski savdo reporti retroaktiv pul bilan buzilmasligi
10. oddiy expense yaratish
11. expense reversal
12. admin report endpointga kira olmasligi
13. owner report endpointga kira olishi
14. Telegram yuborish muvaffaqiyatli logi
15. Telegram yuborish xatosi audit logi

## 12. Soft-close (kunni yopish)

Kunlik moliyaning rasmiy raqamlari `DailyClose` modeli orqali snapshot qilinadi.

### 12.1. Maqsad

- Yopish paytidagi raqamlar audit / Telegram report uchun "haqiqat manbai".
- Yopilgandan keyin baribir kechagi chiqim yoki xarid kelishi mumkin — lekin
  asl snapshot o'zgarmaydi. Yangi yozuvlar `isAdjustment=true` bilan
  alohida ko'rsatiladi.

### 12.2. Schema

```prisma
model DailyClose {
  id              String   @id @default(cuid())
  date            String   @unique  // YYYY-MM-DD, Asia/Tashkent
  closedAt        DateTime @default(now())
  closedByUserId  String
  snapshot        Json
  note            String?
  closedBy        User     @relation("DailyCloseActor", fields: [closedByUserId], references: [id])
}
```

`Expense.isAdjustment` va `Purchase.isAdjustment` (default `false`) — soft-close
ehtiyojlari uchun.

### 12.3. Avtomatik bayroq

`POST /api/expenses` va `POST /api/purchases` (xarid):

1. agar `occurredAt > now()` → reject (`Chiqim/Xarid sanasi kelajakka qaratib bo'lmaydi`).
2. agar `DailyClose` shu `dayKey(occurredAt)` uchun mavjud → `isAdjustment=true`.
3. aks holda → `isAdjustment=false`.

### 12.4. Endpointlar

- `POST /api/finance/daily-close` — **OWNER only**. Body: `{ date?: 'YYYY-MM-DD', note? }`.
  Default sana — bugun (Asia/Tashkent). Yopilgan kun qaytadan yopilmaydi.
- `POST /api/finance/daily-reopen` — **OWNER only**. Body: `{ date, reason }`.
  `DAILY_REOPENED` audit yozuvi tushadi.

### 12.5. GET javobi (`/api/finance/daily`, `/api/reports/daily`)

```ts
{
  ...current,        // hozirgi (real-time) raqamlar
  closed: null | {
    closedAt, closedByName, note,
    snapshot: { /* yopilgan paytdagi to'liq raqamlar */ }
  },
  adjustments: {
    expenseCount, expenseTotal,
    purchaseCount, purchaseTotal,
    expenses: [...],
    purchases: [...],
  }
}
```

Renderer hozirgi raqamlardan snapshot raqamini ayirib delta ko'rsatadi.

### 12.6. AuditAction

- `DAILY_CLOSED` — yopilganda.
- `DAILY_REOPENED` — qayta ochilganda (reason talab qilinadi).

## 13. Outflow shakli (double-count fix)

`GET /api/finance/daily` va `/api/reports/daily` javobida `outflow`:

```ts
outflow: {
  expensesNonPurchase: string,   // xaridlardan boshqa chiqimlar (net)
  purchasesTotal: string,        // xaridlar (Expense ham, Purchase ham)
  expensesTotal: string,         // = expensesNonPurchase + purchasesTotal
  purchasesCount: number,
  // ... eski tafsilotlar (gross, reversal, operating, pendingRepayable)
}
```

Renderer'da hech qachon `expensesNet + purchasesTotal` bilan qo'shilmaydi —
`Purchase` ham bog'liq `Expense` ga ega bo'lgani uchun, expensesNet ichida
allaqachon hisoblangan.

## 14. TZ (vaqt zonasi)

- Production: `process.env.TZ = 'Asia/Tashkent'` server boot'da o'rnatiladi
  (`apps/master/src/main/index.ts` ning birinchi qatori).
- Yagona util `apps/master/src/main/server/lib/date.ts` — `dayStart`,
  `dayEnd`, `dayRange`, `dayKey`. Hamma servis shu funksiyalarni chaqiradi.
- Eskidan har bir servis ichida `setHours(0,0,0,0)` qilingan dublikatlar
  bekor qilingan.

## 11. Implementatsiya tartibi

Kod yozishda quyidagi tartib saqlanadi:

1. `decisions.md` yangilash
2. `schema.md` yangilash
3. `api-contract.md` yangilash
4. Prisma schema va migration
5. repo/service/controller/routes
6. report service kengaytirish
7. renderer API
8. admin debt/expense UI
9. owner report UI
10. Telegram scheduler
11. verification
