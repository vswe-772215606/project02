# Money rules — design

**Date:** 2026-09-30 · **Status:** decided by Barkamol on 2026-09-30; nothing implemented
**Base:** `feat/auto-update` (v0.1.4, the build the customer runs)
**Inputs:** the 2026-09-30 finance audit — the Money Map
(<https://claude.ai/artifact/5fWhB6Fb3tAs6aM1ZwVkYS>) and the finance test report
(<https://claude.ai/artifact/Bnz1wr84tywTLPDaRnuMSR>). Issue numbers below are the Money Map's.
**Builds on:** `2026-08-14-money-model-design.md` (D1–D8). D3, D4 and its §4 are confirmed here,
not reopened; numbering continues from D8.
**Supersedes:** the "Roles" line in `CLAUDE.md` and `PRD_FOUNDATION.md` FIN-7 (ADMIN may now see
profit — D18); the midnight day boundary in `server/lib/time.ts` (D11).

## 1. Why

The audit found the ledger core right and 40 defects around it. Four of its seven root causes
were money rules nobody had settled. This settles them.

**Governing constraint (Barkamol):** admins do not read notes. When the system's cash differs
from the cash in hand, the admin concludes the system is broken. Every cash figure must match the
drawer on its own, never through a note that explains a gap.

## 2. Decisions

| # | Question | Decision | Issues |
|---|---|---|---|
| D9 | What "Kassa" means | Cash only, on every screen, Telegram message and report. Card is its own line. | 2, 11, 13 |
| D10 | Is an expense cash or card | The expense form gets a Naqd/Karta toggle, preset to Naqd. A Karta expense reduces profit, not the drawer. | 2 |
| D11 | When a trading day ends | 05:00 Tashkent. 00:00–05:00 belongs to the evening before. Bills keep their real date and time; only reports group by trading day. | 22 |
| D12 | Is the drawer counted | Yes. The admin closes each day with a cash count. | FIN-1, FIN-2 |
| D13 | A forgotten expense found after close | Written to the day the cash left. That day's expected cash, difference and profit are corrected, and the owner gets a Telegram correction message. | 5, 25 |
| D14 | Bad debts and lost advances | A write-off button on Qarzlar for OWNER and ADMIN; every write-off messages the owner. A write-off, nasiya or avans, books its loss on the write-off day. | 18, 21, 31 |
| D15 | How food cost reaches profit | Tan narx × portions only (confirms D4 and money-model §8). Food bought at the bazaar is filed as "Mahsulot xaridi": it leaves the till and never reaches profit a second time. | 3, 4 |
| D16 | How waiter pay leaves the till | The payout record of money-model §4, entered by the admin at every payout. Not automatic at close. | 6 |
| D3 | Discount control | Confirmed: free-form, no cap, reason mandatory. The "Maksimal" setting and the Chegirmalar page go. | 15 |
| D17 | What the words mean | One meaning each, everywhere — §3.9. | 9, 11, 12, 13, 25 |
| D18 | May ADMIN see profit | Yes: profit, tan narx totals and per-dish margins. Waiters see none of it. | 20, 32 |
| D19 | The printed bill | Food, then discount, then Xizmat haqi, then total, then one line per payment leg. | 1 |
| D20 | Change for cash | An optional "Olindi" field on the ticket shows "Qaytim". | F6 |
| D21 | When the owner's report goes out | When the day is closed, with the count in it. On by default. | 22 |

## 3. What each decision means

### 3.1 Kassa is cash (D9, D10)

- `Kassa o'zgarishi = naqd Kirim − naqd Chiqim`. Card sales and card repayments are a "Karta"
  line. Nasiya is neither.
- `Expense` gains a payment method, Naqd by default. Chiqim is shown split Naqd/Karta; Kassa uses
  the naqd part.
- Every figure that labels cash plus card as the till is recomputed or relabelled:
  `reports.service.ts:1209-1225`, `FinanceDrawerPanel.tsx:37`, `/bugun`, the PDF, Excel.

### 3.2 The trading day (D11)

- One helper decides the trading day, and every day-range query uses it: `server/lib/time.ts`
  (`localDayRangeFor` and its callers), the waiter "today" stats in `me.controller.ts`, Telegram,
  the PDF, Excel.
- Receipts and document timestamps keep the real Tashkent date and time.
- Past data regroups once: bills between 00:00 and 05:00 move to the evening before in every
  report.

### 3.3 Closing the day (D12)

```
Ertalab kassada  = the previous close's "Ertaga qoladi"
Kutilgan         = Ertalab kassada + naqd Kirim − naqd Chiqim
Sanaldi          = typed by the admin
Farq             = Sanaldi − Kutilgan
Ertaga qoladi    = typed by the admin
Egasiga berildi  = Sanaldi − Ertaga qoladi
```

- Saved with who closed and when. The handover to the owner is not Chiqim; it only sets the next
  day's opening cash.
- On a shortage the close screen offers "Kiritilmagan xarajat qo'shish" and names unpaid waiter
  Qoldiq, so a forgotten entry is made before the day closes.
- Closing sends the owner's report (D21).

### 3.4 Correcting a closed day (D13)

- The expense form defaults to today. Choosing a closed day is an explicit correction, never a
  side effect of the page's date filter, which is how issue 5 happens today.
- A correction recomputes that day's Kutilgan, Farq and profit, writes an audit row, and messages
  the owner: what, who, profit before and after.
- An entry on a closed day can be undone the same way; the same-day-only undo rule
  (`EXPENSE_REVERSAL_SAME_DAY_ONLY`) is lifted for corrections.

### 3.5 Write-offs (D14)

- Qarzlar gains "Hisobdan chiqarish" for OWNER and ADMIN (`debt.routes.ts` already allows both).
- The loss is a Xarajat line on the write-off day. The nasiya ledger shows "hisobdan chiqarildi",
  never "to'landi". Cash is untouched.
- A payment later made on a written-off debt is Kirim on that day and comes back into profit.
- An avans write-off books on the write-off day, not the day the avans was given
  (`expense.service.ts:382-386`).

### 3.6 Food cost (D15)

- The expense form gains "Mahsulot xaridi" beside ordinary expenses; today
  `ExpenseCreateDialog.tsx:49` files everything as "Operatsion".
- D4 is built as money-model §6 specifies: a FOOD dish cannot be saved without a tan narx; dishes
  that have none keep selling, flagged in Ombor, with a count on the finance screen.

### 3.7 Waiter pay (D16)

Built as money-model §4: `WaiterPayout`, Ishlagan · Berilgan · Qoldiq per waiter. A payout is
naqd Chiqim and never Xarajat. Partial and weekly payouts work.

### 3.8 Discount (D3 confirmed)

As money-model §3. The alert at 50 000 or more carries the reason and who gave the discount.

### 3.9 Vocabulary (D17)

| Word | Means | On the tested day |
|---|---|---|
| Sotuv | Food after discount (Sof sotuv). Never includes Xizmat haqi. | 165 000 |
| Xizmat haqi | The waiters' money; always its own line | 25 000 |
| Kirim | All money received | 180 000 |
| Chiqim | All money paid out: expenses, Mahsulot xaridi, avans, waiter payouts | 170 000 |
| Xarajat | What reduces profit: operating expenses and write-offs | 40 000 |
| Kassa | The naqd part of Kirim − Chiqim | −40 000 |
| Foyda | Sotuv − Tan narx − Xarajat | 52 000 |

Every screen, Telegram command, PDF and Excel shows these fields from the server's day ledger
instead of working out its own (test report cause 5).

### 3.10 ADMIN visibility (D18)

- ADMIN may read profit, tan narx totals and per-dish margins; `/api/finance/daily` needs no
  role-filtered DTO.
- Waiter apps still receive no tan narx or food cost (`order.repo.ts:10-22, 41-48`).

### 3.11 The bill (D19)

```
Osh            2 x 45 000    90 000
Ovqat jami                   90 000
Chegirma                    -10 000
Xizmat haqi (3 kishi)        15 000
UMUMIY                       95 000
To'lov: Naqd                 95 000
```

Nasiya prints `Nasiya: <debtor> <amount>`. Several legs print one line each. ASCII only, as
today.

### 3.12 Qaytim (D20)

An optional "Olindi" beside the Naqd leg; the ticket shows `Qaytim = Olindi − Naqd`. Not stored
and not printed; the payment recorded is unchanged.

### 3.13 The owner's report (D21)

- Sent when the day is closed, with Kutilgan, Sanaldi, Farq and Egasiga berildi.
- On by default once Telegram is configured; today `daily_report_telegram_enabled` is not seeded
  on a packaged install.
- Not closed by 05:00: sent at 05:00, marked "kun yopilmadi". Till off: sent at the next start.
- Logged as sent only when Telegram accepts it.

## 4. Defects that need no decision — defaults

Fixed as below unless Barkamol says otherwise.

- Tasdiqlash re-checks the order status inside the transaction, so a bill is charged and printed
  once (26).
- Repayments update the balance atomically (29).
- The server refuses negative and fractional payment legs and more than one Nasiya leg (27, 28).
  Avans returns are whole so'm.
- Stale-draft cleanup cancels instead of deleting, returns the stock and records it (7).
- PIN lockout applies to the waiter who mistyped, not the whole floor.
- Printing happens after the transaction commits, or with a timeout, so a slow print cannot hold
  the SQLite write lock.
- A discount typed after a Karta or Nasiya leg shrinks that leg instead of blocking Tasdiqlash (16).
- Undoing a Keldi payment takes back its stock and the tan narx it set (19).
- Keldi payments raise the large-expense alert (23).
- A repeat add after a price change is a new line at the new price (35).
- The waive-Xizmat-haqi switch is removed (38; money-model §9).
- Line changes on a sent order write an audit row: who, what, how much (24; D8).
- Undoing an open avans leaves profit alone (30).
- Waiter apps show the charged total once a bill closes (17).
- Sets show their price in the admin picker (36). `/omborxona` splits into several messages (37).
  Document dates use Tashkent time whatever the machine clock (34). Money groups with spaces
  everywhere (33).

## 5. Finance e2e expectations that change

In `../project02-finance-e2e/apps/master/e2e/`, untracked until STATE item 2 versions it:

- `03-discount.test.ts`: "a typed discount above Maksimal is refused" and "a preset above
  Maksimal cannot be created" are withdrawn (D3). The reason test stays.
- `04-stock-cost.test.ts`: "selling a dish with no tan narx books its food cost" becomes "the
  finance screen counts dishes without a tan narx" (money-model §6).
- `05-expenses.test.ts`: "an expense cannot be booked into a day that has already closed" becomes:
  a correction to a closed day is explicit, messages the owner, writes an audit row and can be
  undone (D13).
- `07-day.test.ts`: the "Chiqim" test keeps its rule with the D17 meaning (Chiqim 170 000,
  Xarajat 40 000). The `/bugun` money-in test uses Kirim and the cash-only Kassa.
- `08-staff-access.test.ts`: "ADMIN does not receive profit" is withdrawn (D18). "ADMIN cannot
  open the owner report" follows §6.
- `01-bill.test.ts`: the two receipt tests assert the D19 layout.
- Any test that builds a day across midnight uses the 05:00 boundary (D11).

## 6. Still open — assumed until Barkamol says otherwise

- Hisobot (`reports.routes.ts:8`, OWNER only today) opens to ADMIN as well, since profit is no
  longer owner-only.
- A closed day may be corrected however far back, since every correction messages the owner.

## 7. Slices

Each gets its own design and plan. Suggested order:

1. **Server guards** (§4) — no decision needed; the highest risk of real loss.
2. **One vocabulary and a cash-only Kassa** (D9, D17, D18, D19).
3. **The expense form** (D10, D15, D13): Naqd/Karta, Mahsulot xaridi, explicit corrections.
4. **The trading day** (D11).
5. **Closing the day** (D12, D21): the count, the handover, the report at close.
6. **Waiter payouts** (D16) and **write-offs** (D14).
7. **Discount** (D3) and **Qaytim** (D20).
