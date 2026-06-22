# Moliya hisob-kitobidagi xato — ildiz sabab tahlili

**Sana:** 2026-06-22
**Tekshirilgan kun:** 22.06.2026 (skrinshotlar shu kunga tegishli)
**Holat:** Tasdiqlangan xato (kod darajasida)

---

## 1. Qisqa xulosa

Moliya ekranlaridagi raqamlar tekshirildi. Ikki xil natija aniqlandi:

| Ko'rsatkich | Holati | Izoh |
|---|---|---|
| **Sof foyda (P&L)** = −2 547 950 | ✅ **To'g'ri** | Arifmetik jihatdan butunlay to'g'ri. Zarar katta, lekin sabab — bitta kunga tushib qolgan katta chiqimlar, kod xatosi emas. |
| **Kassa o'zgarishi** = +5 473 000 | ❌ **Noto'g'ri** | Haqiqiy kassa harakati taxminan **−380 000** bo'lishi kerak edi. +5,4 mln — soxta (fantom) raqam. |

**Asosiy xulosa:** Foyda hisobi (sof foyda) ishonchli. **Kassa / pul oqimi hisobi esa noto'g'ri** — bu xato **oldingi kunda kiritilgan xarid partiyasi bugun bekor qilinganda yoki o'chirilganda** yuzaga keladi.

---

## 2. Belgilar (skrinshotlardagi raqamlar)

### Admin "Kunlik moliya" (yuqori kartalar)
- SOTUV: 4 043 000 (381 ta porsiya)
- TAN NARXI: 3 244 950
- CHIQIM: 3 346 000
- SOF FOYDA: **−2 547 950** (Zarar)

### Owner "Moliyaviy hisobot" → Kunlik
- SOF FOYDA: **−2 547 950**
- KASSA O'ZGARISHI: **+5 473 000**
- Foyda hisobi: Sotuv 4 043 000 − Tan narxi 3 244 950 − Chiqim 3 346 000 = −2 547 950
- To'lov tekshiruvi: Chek summasi 4 235 000 = To'lovlar yig'indisi 4 235 000 → Farq **0**

### Pul oqimi (admin va owner)
```
KIRIM
  Naqd (sotuv)       4 121 000
  Karta (sotuv)         70 000
  Qarz qaytimi         116 000
  Jami kelgan       +4 307 000

KETGAN
  Xaridlar           1 244 000
  Chiqimlar         −2 410 000   ← MANFIY (mantiqsiz)
  Jami ketgan       −1 166 000   ← MANFIY (skrinshotda "−-1 166 000" deb chiqqan)

KASSA O'ZGARISHI    +5 473 000   ← soxta
```

**Diqqat qilinadigan belgi:** Chiqim (pul ketishi) **manfiy** chiqyapti. Chiqim hech qachon kassaga pul *kirita* olmaydi — bu mantiqan imkonsiz. Skrinshotdagi "−-1 166 000" (ikki marta minus) ham aynan shu manfiy qiymatning belgisi.

---

## 3. Raqamlar tekshiruvi (nega P&L to'g'ri)

| Hisob | Formula | Natija |
|---|---|---|
| Sof sotuv | Yalpi 4 115 000 − Chegirma 72 000 | 4 043 000 ✅ |
| Tan narxi (COGS) | Σ `OrderLine.cogsSnapshot` (FIFO) | 3 244 950 ✅ |
| Operatsion chiqim | Bugungi chiqim brutto 3 446 000 − kutilayotgan avanslar (SARDOR 80 000 + SARDORGA 20 000 = 100 000) | 3 346 000 ✅ |
| **Sof foyda** | 4 043 000 − 3 244 950 − 3 346 000 | **−2 547 950** ✅ |

Meal-sales jadvali ham mos keladi: JAMI Sotuv 4 307 000 − Tan narxi 3 244 950 = Foyda 1 062 050 (yalpi marja).

Demak P&L formulasi va raqamlari **bir-biriga to'liq bog'lanadi**. Zarar shunchaki katta lump (bir martalik) chiqimlar tufayli:
- QASSOBXOBAGA (qassob) 2 000 000
- SHUXRATAKAMGA 1 100 000
- METAN GAZGA 246 000

> **Ma'lumot kiritish bo'yicha eslatma (kod xatosi emas):** 2 000 000 lik "qassobga" to'lov **operatsion chiqim** sifatida kiritilgan, shuning uchun bugungi foydaga to'liq urilgan. Agar u **xarid (Xarid/ombor)** sifatida kiritilganda edi, omborga kirardi va faqat sotilgani sayin COGS sifatida hisobga olinardi. Bu — kategoriya tanlash masalasi, kod nuqsoni emas.

---

## 4. Ildiz sabab (asosiy xato)

### 4.1. Kassa formulasi

Kassa harakati quyidagicha hisoblanadi:

```
drawer (kassa)  = totalIn − totalOut
totalOut        = expensesNet = expenseGross − expenseReversal
```

Manbalar:
- `apps/master/src/main/server/services/finance.service.ts:125-127`
  ```ts
  const totalIn = cashIn.plus(cardIn).plus(debtRepaidCash).plus(debtRepaidCard).plus(expenseReturnsTotal);
  const totalOut = expensesNet;            // ← muammo shu yerda
  const drawerMovement = totalIn.minus(totalOut);
  ```
- Owner tarafi xuddi shunday: `apps/master/src/main/server/services/reports.service.ts:322`
  ```ts
  const cashflowBasedNet = realCashIn.minus(expenseNet);
  ```

### 4.2. `expenseReversal` qanday qilib brutto chiqimdan kattalashib ketadi

Xarid partiyasi **bekor qilinganda (`reverse`) yoki o'chirilganda (`delete`)** kod yangi **`REVERSAL`** statusli `Expense` yozuvini yaratadi va unga **`occurredAt: new Date()` — ya'ni BUGUNGI sana** qo'yadi:

- `apps/master/src/main/server/services/purchase.service.ts:330` (`reverse`)
- `apps/master/src/main/server/services/purchase.service.ts:466-471` (`delete` — to'liq partiya)
- `apps/master/src/main/server/services/purchase.service.ts:478-489` (`delete` — qisman, ishlatilmagan qismi)

Muhim farq:
- `reverse()` da **shu kun cheklovi bor** (`purchase.service.ts:263`): faqat bugun kiritilgan xaridni bekor qilish mumkin. Bunda original ham, REVERSAL ham bugungi kunda — ular bir-birini neytrallaydi (net = 0). Muammo yo'q.
- `delete()` da esa **shu kun cheklovi YO'Q** (`purchase.service.ts:382-394`). Demak **oldingi kunda kiritilgan partiyani bugun o'chirish mumkin.**

Oldingi kundagi partiya bugun o'chirilganda:
1. Original `Expense` (xarid puli) **o'zining eski kunida** turaveradi (`occurredAt` o'zgarmaydi).
2. Yangi `REVERSAL` yozuvi esa **bugungi kunga** tushadi.
3. Natijada **bugungi oynaga** REVERSAL (5 856 000) kiradi, lekin unga mos original (eski kunda) kirmaydi.
4. `expenseGross` (brutto) bunday REVERSALga mos originalni o'z ichiga olmaydi, `expenseReversal` esa o'sadi.
5. `expensesNet = gross − reversal` **manfiyga** tushadi.

Kunlik hisobda (`expense.service.ts:106-132`):
- `ACTIVE` va `REVERSED` → `gross` ga qo'shiladi
- `REVERSAL` → `reversal` ga qo'shiladi
- `net = gross − reversal`

"Halol tarix" qoidasi tufayli eski partiya `REVERSED` ga o'tsa ham, u **eski kun brutto**sida qolaveradi (o'sha kun hisobotini buzmaslik uchun). Lekin uning REVERSALi bugunga tushib, **bugungi net**ni eski partiya summasiga kamaytiradi — garchi bugun hech qanday haqiqiy pul harakati bo'lmasa ham.

### 4.3. Raqamlar bilan isbot

```
expenseGross (bugun, xaridlar bilan)  = 3 446 000 (operatsion) + 1 244 000 (bugungi xaridlar) = 4 690 000
expenseReversal (bugun)               = 5 856 000   ← eski kun partiyalarini bugun o'chirish natijasi
expensesNet = 4 690 000 − 5 856 000   = −1 166 000  ← MANFIY

drawer = totalIn − totalOut = 4 307 000 − (−1 166 000) = +5 473 000   ← soxta
```

`FinancePage` da ko'rsatilgan "Chiqimlar":
```
opExclPurchases = expensesNet − purchasesTotal = −1 166 000 − 1 244 000 = −2 410 000
```
(`apps/master/src/renderer/pages/FinancePage.tsx:459`) — skrinshotdagi −2 410 000 ga aynan mos.

Bugungi xaridlar jami 1 244 000 (3 partiya: SOMSA 10 → 300 000, SOMSA 12 → 444 000, ACHIQ GO'SHT → 500 000) va hammasi ACTIVE. Demak 5 856 000 lik REVERSALning **deyarli barchasi oldingi kunlardagi partiyalarni o'chirishdan** kelib chiqqan.

---

## 5. To'g'ri qiymat qanday bo'lishi kerak edi

Bugun haqiqatda kassadan ketgan pul = bugun haqiqatda kiritilgan xarajatlar va xaridlar:
```
To'g'ri totalOut  ≈ 4 690 000 (bugungi operatsion chiqim 3 446 000 + bugungi xaridlar 1 244 000)
To'g'ri drawer    ≈ 4 307 000 − 4 690 000 = −383 000   (kassa biroz kamayadi)
```

Eski partiyaning xarid puli **o'z kunida** allaqachon hisobga olingan; uni bugun qayta (manfiy) hisoblash noto'g'ri. Bugungi REVERSAL kassaga **0** ta'sir qilishi kerak edi (chunki bugun hech qanday pul qaytib kelmadi — bu shunchaki ombor/ma'lumot tuzatishi).

---

## 6. Ta'sir doirasi (qaysi ekranlar buzilgan)

Hammasi bitta `expensesNet` / `cashflowBasedNet` manbasidan oziqlanadi, shuning uchun quyidagilarning hammasi bir xil xatoga ega:

| Ekran / kanal | Maydon | Manba |
|---|---|---|
| Admin "Kunlik moliya" → Pul oqimi | Kassa o'zgarishi, Chiqimlar, Jami ketgan | `finance.service.ts:125-127`, `FinancePage.tsx:459,509,518` |
| Owner "Moliyaviy hisobot" → Kunlik | Kassa o'zgarishi | `reports.service.ts:322`, `ResultsSection.tsx:76` |
| Owner "Moliyaviy hisobot" → Kunlik | Jami ketgan pul | `CashflowSection.tsx:52` (`report.expenses.net`) |
| Owner "Moliyaviy hisobot" → Oylik | Har kunlik + jami Kassa o'zgarishi | `reports.service.ts:673,682` (oylik) |
| Owner "Umumiy" tab | Pul oqimi farqi | `reports.service.ts:920-983` (diapazon original bilan reversalni ajratib qolsa) |
| Telegram kunlik hisobot | Kassa o'zgarishi | `telegram-bot.service.ts:797` |
| Telegram oylik hisobot | Kassa o'zgarishi | `telegram-bot.service.ts` (oylik) |
| Kunlik PDF hisobot | Jami ketgan, Kassa | `pdf-report.ts:450,768` |

**Buzilmaganlar (to'g'ri ishlaydi):**
- Sof foyda (P&L) — chunki `operatingExpense` ingredient (xarid) kategoriyasini chiqarib tashlaydi, REVERSAL ham o'sha kategoriyada.
- Sotuv, chegirma, sof sotuv, COGS.
- To'lov tekshiruvi (Chek summasi vs To'lovlar, Farq = 0).
- Qarz (ochilgan/qaytgan/qoldiq).

---

## 7. Qayta ishlab chiqarish (reproduction) qadamlari

1. **1-kun:** Biror ingredient uchun katta xarid partiyasini kirit (masalan, "Go'sht" — 5 856 000 so'm). Hisobotlarni ko'r:
   - Pul oqimi: ketgan pul +5 856 000, kassa shunga kamayadi. ✅ To'g'ri.
2. **2-kun (ertasi):** O'sha partiya hali ishlatilmagan bo'lsa (yoki qisman), **Xaridlar** sahifasidan uni **"O'chirish"** (delete) qil. Sabab yoz.
3. **2-kun hisobotini och** (`Kunlik moliya` yoki `Moliyaviy hisobot → Kunlik`, sana = 2-kun):
   - "Chiqimlar" **manfiy** chiqadi.
   - "Jami ketgan" **manfiy** chiqadi.
   - "Kassa o'zgarishi" haqiqiydan ~5 856 000 ga **ko'p** chiqadi.

> Eslatma: `reverse` (bekor qilish) tugmasi shu kun cheklovi borligi uchun bu xatoni keltirib chiqarmaydi — faqat **`delete` (o'chirish)** orqali, oldingi kun partiyasida yuz beradi. Shuningdek qisman ishlatilgan partiyani o'chirsangiz, ishlatilmagan qism summasi bo'yicha kichikroq versiyasi yuzaga keladi.

---

## 8. Tuzatish yo'nalishlari (hali amalga oshirilmagan — muhokama uchun)

Pul harakati (kassa) hisobi faqat **haqiqiy** pul kirim/chiqimini aks ettirishi kerak. Oldingi kun xaridini bugun o'chirish — bu **ombor/ma'lumot tuzatishi**, bugungi kassaga **pul kirimi emas.** Mumkin variantlar:

1. **Eng toza yechim:** Pul oqimining `totalOut` qismini `expensesNet` orqali emas, balki **haqiqiy pul hodisalari** (bugungi ACTIVE chiqimlar + bugungi ACTIVE xaridlar; va faqat **shu kun** originali bo'lgan REVERSALlar) bo'yicha hisoblash. Eski kun originaliga tegishli REVERSAL bugungi kassaga ta'sir qilmasin.
2. **Sana asosida:** Xarid `delete`/`reverse` natijasidagi REVERSAL `Expense`ning kassa ta'sirini **original `occurredAt` kuniga** bog'lash (lekin "halol tarix" qoidasini buzmaslik kerak — eski kun hisobotini o'zgartirmaslik uchun ehtiyot bo'lish lozim). Shuning uchun 1-variant afzalroq.
3. **Faqat bugungi originalga cheklash:** Kassa hisobida REVERSAL summasini faqat shu kun ichida originali bo'lgan qismi bilan cheklash (cross-day REVERSALlarni kassadan chiqarib tashlash).

> **Tavsiya:** pul (kassa) matematikasiga tegishli o'zgarish kiritishdan oldin yondashuvni egasi bilan kelishib olish kerak. P&L (sof foyda) tarafiga tegmaslik kerak — u to'g'ri.

---

## 9. Egaga aytiladigan xulosa (oddiy til bilan)

- **Foyda hisobi to'g'ri.** −2 547 950 zarar — haqiqiy hisob; u katta chiqimlar (qassob 2 mln, oylik/avans 1,1 mln, gaz) bir kunga tushgani uchun shunday. (Agar qassobga to'lov "xarid" sifatida kiritilsa, kunlik zarar bunchalik katta ko'rinmaydi — bu ma'lumot kiritish masalasi.)
- **Kassa o'zgarishi noto'g'ri.** +5 473 000 — soxta raqam. Haqiqatda kassa taxminan −380 000 ga o'zgargan. Sabab: **oldingi kunda kiritilgan xarid bugun o'chirilganda, dastur uni bugungi kassaga pul kirimi deb hisoblab qo'yadi.**

---

## 10. TUZATILDI (2026-06-22)

Tuzatishning asosiy g'oyasi: **kassadan ketgan pul (`cashOut`) faqat shu kunning brutto chiqimidan, shu kun ichida bekor qilingan REVERSALlarni ayirib hisoblanadi.** Boshqa kunga tegishli REVERSALlar (oldingi kun xaridini o'chirish) kassaga ta'sir qilmaydi. Original chiqim o'z kunida qoladi ("halol tarix"), bugun esa soxta kirim paydo bo'lmaydi.

Formula: `cashOut(D) = expenseGross(D) − sameDayReversal(D)`, bunda `sameDayReversal` — REVERSAL yozuvlarning faqat originali ham shu kunda (`reversedExpenseId` shu kun ro'yxatida) bo'lganlari.

### O'zgargan joylar

- `expense.service.ts` `listByDate` — yangi `totals.sameDayReversal` va `totals.cashOut`; `byCategory` endi cross-day REVERSALlarni 0 deb hisoblaydi (soxta manfiylik yo'qoladi).
- `reports.service.ts`:
  - `dailyLedger` — `cashflow.cashOut` + `cashflow.drawerMovement` + `outflow.expenseSameDayReversal`; `ingredientPurchases` endi faqat `status: ACTIVE`.
  - `daily` — `cashflowBasedNet = realCashIn − cashOut`; DTO ga `cashflow.cashOut`, `expenses.sameDayReversal`, `checks.expenses.sameDayReversalAmount`, `cashflow.expenseReturns` qo'shildi.
  - `monthly` — har kunlik `cashflowNet` endi `cashOut` (same-day reversal) bo'yicha.
  - `summary` — cash `totalOut`/`farq` faqat diapazon ichidagi originali bor REVERSALlarni ayiradi; P&L `revenue` endi **FOOD only va chegirmadan keyin** (xizmat haqi va chegirma chiqarib tashlandi) + yangi `grossRevenue`/`discount` maydonlari.
- `finance.service.ts` `dailyForAdmin` — drawer `totalOut`/`movement` endi `cashOut` bo'yicha; `outflow.cashOut`/`expensesSameDayReversal`.
- `purchase.service.ts` `delete` (qisman) — REVERSAL endi `reversedExpense` ga bog'lanadi (same-day tekshiruvi ishlashi uchun).
- Renderer: `CashflowSection`, `GrandSummarySection`, `ResultsSection` (aniq izohlar), `FinancePage` (Pul oqimi + meal-table izohi), `ReportsPage` Umumiy (Chegirma qatori); `api/reports.ts` + `api/finance.ts` DTO.
- Telegram (`telegram-bot.service.ts`) kunlik/umumiy/Excel va PDF (`pdf-report.ts`) — barchasi `cashOut`/`sameDayReversal` ishlatadi.

### Tekshiruv

- `pnpm --filter @chayxana/master typecheck` — toza.
- `scripts/smoke-cashflow-reversal.ts` — haqiqiy servislarni vaqtinchalik SQLite ustida ishga tushiradi va tasdiqlaydi:
  - cross-day reversal: `cashOut = 3 346 000` (manfiy emas), kassa = `+775 000` (eski soxta `+6 631 000` emas).
  - same-day reversal hali ham nolga tushadi (control).
  - admin drawer va owner Umumiy cash-basis ham to'g'ri.
