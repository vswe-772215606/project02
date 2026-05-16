# PRD 06 — Debt reconciliation timing

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Domain (finance, settlement, period boundaries)
- **Related code:** `apps/master/src/main/server/services/debt.service.ts`, `…/services/reports.service.ts` (`buildDebtLedger`), `…/services/order.service.ts` (`markPaid` → debt creation), `apps/master/prisma/schema.prisma` (Debt, DebtRepayment, Payment, Order)
- **Related docs:** `docs/FINANCE_PLAN.md` (§2.1, §2.2), `docs/FINANCE_IMPLEMENTATION_SPEC.md`, `docs/FINANCE_REPORTING_CLARITY_PLAN.md`

---

## 1. Context

Chayxana allows **debt sales**: a customer eats, the bill is approved, and at payment time the admin records a `Payment(method: DEBT)` instead of (or in addition to) cash/card. This creates a `Debt` row linking the customer's name + phone to the unpaid amount (`order.service.ts:734-788`, `debt.service.ts:54-94`). Later, the debt can be repaid in installments via `DebtRepayment` rows (`debt.service.ts:124-202`).

The FINANCE_PLAN is explicit that debt is **not** the same as revenue: §2.1 lists "savdo bo'ldi" (sale happened) and "qarz qaytdi" (debt returned) as distinct categories. The schema reflects this: `Order.closedAt` records when the sale closed, but the money may not have arrived. `DebtRepayment.paidAt` records when the money actually arrived.

The unresolved question — and the source of recurring confusion in the reports module — is **on which date does which number live**:

| Event | Date used in current reports | Notes |
|---|---|---|
| Order closed with full debt payment | `Order.closedAt` | Counts as a "sale" on day X even though no cash came in. |
| Order closed with mixed cash + debt | `Order.closedAt` | The cash portion counts as cash received on X; the debt portion is an opened debt on X. |
| Debt fully repaid on day Y | `DebtRepayment.paidAt` | Counts as cash/card inflow on Y. Original sale stays on X. |
| Debt partially repaid on day Y | `DebtRepayment.paidAt` | Inflow on Y; debt's `remainingAmount` drops. |
| Debt opened today but already partial-paid same day | both | Both events on same date — reconciles naturally. |

The current implementation in `reports.service.ts` `buildDebtLedger` (lines 224-280) handles this correctly for the *debt ledger view* — it computes `openedToday`, `repaidToday`, and `remainingAtDayEnd` per debt. The numbers reconcile within a day. **Across days, however, the conceptual model isn't documented anywhere**, and downstream consumers (the daily Telegram summary, the monthly report, future tax/accounting export) keep re-discovering the rule.

Concrete questions that currently have no written answer:

1. **Monthly revenue:** does the December monthly report count an order that was sold on 28 December and fully repaid in January as December revenue (sale-date basis) or January (cash-date basis)?
2. **Debt write-off:** what happens to a debt that's been open for 6 months and the customer never returns? Today there is no write-off path. The debt sits forever on the books.
3. **Repayment by debt:** `debtService.recordRepayment` rejects `method: DEBT` (`debt.service.ts:132-134`). Good. But can a customer repay an old debt with *another* new debt? Today, no: only CASH or CARD. Reasonable. Worth locking.
4. **Cross-period closing:** if month-end cash totals are reported on the 1st of next month for the prior month, do late-arriving repayments shift the prior month's numbers retroactively?
5. **Debt for walkout?** Today walkout creates *no* debt (no `Payment` row). The waiter has no obligation to the customer they lost. Is that always right? In some chayxana cultures the waiter is responsible for the walkout amount.

Operationally, the chayxana cares about both views:

- **Sales view** (accrual): "we sold 5,000,000 UZS of food this month" — uses `Order.closedAt`.
- **Cash view**: "we received 4,200,000 UZS of cash + 600,000 UZS of card this month" — uses `Payment.createdAt` and `DebtRepayment.paidAt`.

Both views must be derivable. The current code derives them implicitly. We need to make the rule explicit and add a few missing pieces (write-off, period close).

**Doc-vs-code observation:** `FINANCE_PLAN.md` §2.2 mandates that financial records are **immutable**: "saqlangan moliyaviy yozuv oddiy `edit` qilinmaydi, oddiy `delete` qilinmaydi, faqat yangi qarshi yozuv bilan bekor qilinadi" (saved financial records are not edited or deleted; they are reversed by a counter-entry). The current `Debt.remainingAmount` field is **mutated** on each repayment (`debt.service.ts:167-171`). This is a real conceptual gap. The repayments themselves are immutable rows, so the *audit trail* is intact — but the `Debt` row's running balance is not. PRD 06 needs to either accept this divergence (with rationale) or fix it.

## 2. Goals / Non-goals

### Goals

- Document the **sale-date vs cash-date** rule once. Decide which is the default for the daily / monthly reports.
- Specify the **debt write-off** flow (when, by whom, how it's recorded).
- Lock the rule for **cross-period repayments**: do they shift prior-period revenue, or stay in the period they arrived?
- Reconcile §2.2 of FINANCE_PLAN (immutable ledger) with the current `Debt.remainingAmount` mutation pattern — either justify the deviation or fix it.
- Define the **dead-letter** state for debts that are never repaid.

### Non-goals

- General accounting / tax export. Out of scope; this PRD ensures the data model supports it later.
- Multi-currency. Single-currency UZS, locked.
- Customer loyalty / credit profiles. The `debtorName` + `debtorPhone` fields stay as free-text identification.
- Partial walkout (customer paid some, walked on the rest). Out of scope.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Debt creation | `order.service.ts:761-775` → `debt.service.ts:54-94` | At `markPaid` time, if any `Payment` has `method: DEBT`, a single `Debt` row is created. Sale is on `Order.closedAt`; debt's `openedAt` is the same instant. |
| One debt per order | `debt.service.ts:63-66` | Enforced by `debtRepo.findByOrderId` returning the existing row and throwing `DebtAlreadyExists`. So an order has 0 or 1 debt. |
| Repayment | `debt.service.ts:124-202` | Records `DebtRepayment(amount, method: CASH|CARD, paidAt, note, receivedById)`. Updates `Debt.remainingAmount` and `status` (`OPEN → PARTIAL → PAID`). Mutates running balance. |
| Overpay rejected | `debt.service.ts:148-150` | `amount > remainingAmount` throws `DebtOverpay`. |
| Debt-by-debt rejected | `debt.service.ts:132-134` | Repayment can only be CASH or CARD. |
| Daily ledger | `reports.service.ts:224-280` | Builds per-debt row with `openedToday`, `repaidToday`, `remainingAtDayEnd`. Filters to debts that were touched today OR still have non-zero balance. |
| Cross-day | None | No "period close" snapshot. Yesterday's numbers are recomputed from raw rows on every call. |
| Write-off | None | No `WRITTEN_OFF` debt status. `DebtStatus` enum is `OPEN | PARTIAL | PAID`. |
| Audit | `debt.service.ts:80-91, 174-198` | `DEBT_CREATED`, `DEBT_PAYMENT_RECORDED`, `DEBT_CLOSED`. No write-off audit because no write-off feature. |
| Settlement boundary | None | No concept. |

### Implicit current behaviour

- The system today is *accrual* for sales: revenue is on `Order.closedAt`.
- Cash flow is captured separately via `Payment.createdAt` and `DebtRepayment.paidAt`.
- Both views are queryable but not formalised in a "period close" sense; every report is computed from raw rows.

## 4. Options

### Option A — Lock the accrual model; add write-off; keep mutable balance

Codify what the system already does. Be explicit:

- **Sale-date basis**: revenue = sum of `totalSnapshot` for orders with `status = CLOSED` and `closedAt` in the period. Debt-paid orders count here.
- **Cash-date basis**: cash received = sum of `Payment.amount` (non-DEBT) where `Payment.createdAt` in period, plus sum of `DebtRepayment.amount` where `paidAt` in period.
- **Both views in reports.** The daily report shows accrual (today's revenue) and cash (today's actual cash inflow) side by side. The owner already implicitly sees this; we name it.
- **Write-off:** add `DebtStatus.WRITTEN_OFF`. New endpoint `POST /api/debts/:id/write-off` (owner-only). Sets status, sets `closedAt`, audits `DEBT_WRITTEN_OFF`. Remaining balance becomes a loss event (see PRD 05 — if Option C is adopted there, write-off creates a `LossLedger` row).
- **Mutable `remainingAmount`** stays. Justification: it's a derived cache for fast queries; the immutable truth is `originalAmount - sum(repayments)`. Document that and add a startup-time integrity check that reconciles.
- **No period close**: reports are always recomputable from raw rows. Late-arriving repayments naturally land in the cash period of the `paidAt` date.

**Pros:** smallest change. Matches what the system already does. Codifies the gap with §2.2 explicitly as a known caching choice.
**Cons:** the §2.2 immutability principle is bent. If we ever need formal accounting, the cached `remainingAmount` is a small risk.

### Option B — Stricter immutability: drop `Debt.remainingAmount`, always compute

Remove the mutable balance column. Every query that needs current balance computes `originalAmount - SUM(repayments.amount)`.

- **Pros:** fully aligned with §2.2. No cache to go stale.
- **Cons:** every list-debts endpoint becomes a join + sum. Reports get slower (probably acceptable at our volume). Sorts by `remainingAmount` need a subquery. Some loss of ergonomics.

### Option C — Period-close model with frozen snapshots

Introduce a "period close" concept. Daily-close at end of day: snapshot all debt balances into a `DebtBalanceSnapshot(debtId, asOf, remainingAmount)` table. Reports for prior periods read snapshots, not raw rows.

- **Pros:** historical reports are immutable. Late-arriving repayments don't retroactively change prior-period numbers (or do, depending on policy — controllable).
- **Cons:** big infrastructure for our volume. Snapshot table grows monotonically. Real-time queries still need raw computation. Mostly accounting-grade complexity we don't need yet.

### Option D — Move debt to a separate ledger entirely

Promote debt and repayment from "auxiliary tables on Order" to first-class `Ledger` entries (matching the LossLedger proposal in PRD 05 Option C). Every financial movement — sale, cash receipt, debt-open, debt-repay, write-off, refund — is a ledger row. Reports are pure aggregations of the ledger.

- **Pros:** matches FINANCE_PLAN §2.1 + §2.2 cleanly. Future-proof for accounting / tax export.
- **Cons:** large rewrite. Justified only if the chayxana grows into multi-location or formal accounting.

## 5. Decision matrix

| Dimension | A (lock current + write-off) | B (drop cached balance) | C (period snapshots) | D (full ledger) |
|---|---|---|---|---|
| Codifies the rule | Yes | Yes | Yes | Yes |
| Supports write-off | Yes (add status) | Yes (add status) | Yes | Yes |
| Honours §2.2 immutability | Partially | Yes | Yes (frozen snapshots) | Yes |
| Late-repayment retro-changes prior reports | Yes (cash-date moves with the row) | Yes | Configurable | Configurable |
| Query performance | Same as today | Slightly worse | Best (prior periods) | Best |
| Schema change | Small (enum value) | Drop column | Add table | Major |
| Effort | S | S | M | L |

## 6. Open questions

1. **What does the owner want as the *primary* monthly headline?** Accrual revenue (sales-date basis) is the conventional restaurant-management answer. Cash-basis is the conventional bookkeeping answer. We need to pick which one is the default, even though both will be shown.
2. **Late-repayment retro-policy:** if a December debt is repaid on 2 January, does the December cash report change when we re-run it on the 5th? Today: no (cash report uses `paidAt`). But some owners think of "the December books" as a fixed thing. Option C is the answer if so.
3. **Write-off authority:** owner-only, admin-only, or both? Recommend owner-only (it's a financial decision, not an operational one).
4. **Statute of limitations / auto-write-off:** should debts older than N days auto-flag for review? Today: no automation, debts sit forever.
5. **Customer identity:** today `debtorName + debtorPhone` are free-text fields on the Debt row. Two debts for "Akmal 901112233" are unlinked. Is that OK for v1? Probably yes, but it complicates any future "outstanding debt by customer" view.
6. **Walkout-as-debt:** should an admin be able to convert a walkout into a debt ("we know who they were")? Today the conversion path is to cancel the walkout and re-create the order with a debt payment. Awkward but possible. Worth specifying.

## 7. Recommendation

**Option A** as the immediate move (write the rule down, add `WRITTEN_OFF` status). **Promote to Option D** only when bundled with the LossLedger work proposed in PRD 05 Option C.

Rationale:

- The current behaviour is already mostly right. The visible gap is the absence of write-off (a real operational issue: debts accumulate forever) and the absence of a documented rule (so every contributor re-derives it).
- Option B's "drop the cache" is cleaner but unnecessary at current volumes and creates UX regressions (sorting debts by balance).
- Option C's period-snapshot is over-engineered for a single chayxana.
- Option D is the right destination eventually — coupling it with COGS / LossLedger (PRD 05) is the natural moment.

Default primary view in monthly reports: **accrual** (sales-date basis), with cash view shown adjacent. Cross-period repayments **do not retroactively change** the source period (because revenue was attributed at `closedAt` and cash is attributed at `paidAt` — these are independent).

## 8. Rollout

### Phase 1 — codify Option A

1. **Schema:** add `DebtStatus.WRITTEN_OFF`. Add `Debt.writtenOffAt`, `Debt.writtenOffById`, `Debt.writeOffReason`.
2. **Service:** `debtService.writeOff({ debtId, actorUserId, reason })` — owner-only at the route layer. Sets status, fields, audits `DEBT_WRITTEN_OFF`. Remaining amount becomes a "loss" event (Option A of PRD 05 surfaces it; Option C of PRD 05 inserts a LossLedger row).
3. **Reports:** include written-off totals in the daily and monthly summary. Always shown to owner; admin sees count but not amount.
4. **Documentation in `decisions.md`:** new "Settlement" section. Specify accrual vs cash views, write-off semantics, late-repayment policy.
5. **Integrity check:** boot-time job that validates, for every non-WRITTEN_OFF debt, `Debt.remainingAmount == Debt.originalAmount - SUM(repayments)`. Logs warnings on drift. Cheap, runs in seconds.

### Phase 2 — UI surfaces

- Debts page gains a "Yopish (yo'qotish sifatida)" / "Close as loss" action for owner. Confirmation modal asks for reason.
- Filter for `WRITTEN_OFF` debts.
- Monthly report shows three lines per period: revenue (accrual), cash received, debt outstanding at period end. Plus "written off this period."

### Phase 3 (bundled with PRD 05 Option C → PRD 06 Option D)

- Migrate debt + repayment + write-off events into the unified `LossLedger` / `FinanceLedger`. Reports re-pointed.
- Add corrections via counter-entry pattern (per FINANCE_PLAN §2.2).
- Cross-period close rules can be tightened (Option C-style snapshot) if the owner ever asks for it.

### Audit additions

- `DEBT_WRITTEN_OFF` with `{ debtId, originalAmount, remainingAtWriteOff, reason }`.
- Optional later: `DEBT_AGE_REVIEWED` for an owner-initiated periodic review action.

### Observability

- Daily Telegram summary: "Qarz qoldig'i (umumiy): X UZS, bugun ochildi: Y, bugun qaytdi: Z." Already partially present; ensure the wording is unambiguous about accrual vs cash.
- Weekly Telegram alert when total open-debt exceeds N% of monthly revenue.

### Rollback

- Adding `WRITTEN_OFF` and the new columns is additive. Reverting is a single migration.
- The bigger Option D rewrite, if ever pursued, has its own rollback plan in that PRD.
