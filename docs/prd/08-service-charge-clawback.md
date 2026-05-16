# PRD 08 — Service charge clawback rules

- **Status:** Draft
- **Author / date:** auto-generated 2026-05-15
- **Area:** Domain (payroll, waiter trust, finance attribution)
- **Related code:** `apps/master/src/main/server/services/billing.service.ts`, `…/services/order.service.ts` (approve, markWalkout, cancelOrder), `…/services/reports.service.ts` (per-waiter aggregation)
- **Related docs:** `docs/agent-plans/00-shared/decisions.md` (§ "Bills, discounts, service charge"), `docs/FINANCE_PLAN.md` §2.3 ("Xizmat haqi")

---

## 1. Context

Chayxana applies a **fixed-amount service charge** per bill (settings key `service_charge_amount`, default 10,000 UZS). Per `decisions.md` and `FINANCE_PLAN.md §2.3`:

- The service charge is **not restaurant revenue.**
- It is **passed through to the waiter** who served the table.
- Owners may **waive** it per-order at approval time (`serviceChargeWaived: Boolean` on `Order`, set in `approve`, `order.service.ts:670-732`).

That's the spec. The code matches it for the **happy path**: when an order closes (CLOSED), the service charge appears on the bill, in the payment, and is later visible in the per-waiter section of the daily report.

What happens on the **unhappy paths** is unspecified:

| Outcome | Did food get cooked? | Did money come in? | Should waiter still get service charge? |
|---|---|---|---|
| CLOSED (paid in full) | Yes | Yes | Yes — happy path |
| CLOSED with debt | Yes | No (or partial) | ??? — money may arrive later or never |
| WALKOUT | Yes | No | ??? — waiter "failed" to collect |
| CANCELED before any line was cooked | No | N/A | ??? — but bill was never approved anyway |
| CANCELED after cook started | Yes (some lines) | N/A | ??? — service was rendered for the cooked lines |
| Service charge waived | Either | Either | 0 — owner-decided |

Today's code:

- `billingService.computeTotals` (`billing.service.ts:73-87`) sets `serviceCharge = serviceChargeWaived ? 0 : settings.get('service_charge_amount')`. So the bill total either includes 10,000 or doesn't.
- For WALKOUT: the order keeps its `serviceChargeSnapshot` (set at approval). The waiter's per-day report (in `reports.service.ts`, the per-waiter aggregation) currently includes that snapshotted service charge **in the waiter's earned-service column even though the customer didn't pay it**. This is the most operationally contested behaviour: the waiter shows up at end of day expecting their tip, the owner does the math, finds out the customer walked, and now there's a disagreement.
- For CANCEL: the bill was never approved, so there's no service charge to claw back. But if PRD 05's Option A is adopted and cooked-line value becomes visible, the question of "did the waiter still earn a partial service charge for the cooked portion" surfaces.
- For debt: the service charge is part of the bill total, which is paid via `Payment(method: DEBT)`. The waiter's number includes it. If the debt is never repaid, the waiter still got credit for the service charge in the daily report. The cash is just an IOU.

The locked decision is silent on all of these. The result is that the waiter trust gradient is fragile: waiters perceive the system as "they take the tip when the customer doesn't pay" or "they pay me on a sale that never returned money." Neither feels right.

This PRD locks the rules.

## 2. Goals / Non-goals

### Goals

- Specify, for each terminal order outcome, whether the waiter's service-charge credit is recognised, clawed back, or partially recognised.
- Specify whether service-charge credit is **earned at approval** or **earned at money-receipt**. (This is the meta-question that underlies all the others.)
- Provide an audit trail when service-charge credit is reversed.
- Surface the rule in the per-waiter daily report so waiters can see *why* their number is what it is.

### Non-goals

- The service charge **amount** or its computation. Locked: fixed UZS per order.
- Tipping above the service charge. Out of scope; not modelled.
- Cash tips paid directly to waiters in person. Out of scope; not visible to the system.
- Service-charge revenue-share between waiters and other staff. Single-waiter-per-order model is locked.

## 3. Current state (code-grounded)

| Concern | File / lines | Behaviour |
|---|---|---|
| Service charge amount | `billing.service.ts:76-78` | `settings.get('service_charge_amount')` (default 10,000 UZS). |
| Waiver | `order.service.ts:687-688, 712-720`, `billing.service.ts:76` | Boolean on Order; if true → 0 charge; audited as `SERVICE_CHARGE_WAIVED`. |
| Snapshot on approval | `order.service.ts:688-694` | `orderRepo.applyTotals` writes `serviceChargeSnapshot` along with other totals. |
| Inclusion in bill total | `billing.service.ts:79` | `total = netFood + serviceCharge`. So `totalSnapshot` includes service charge. |
| Per-waiter report attribution | `reports.service.ts` (waiter aggregation, not shown) | Sums `serviceChargeSnapshot` of orders by waiter. Includes WALKOUT, CLOSED, debt-paid. **Does not exclude unpaid orders.** |
| Walkout effect on service charge | None (no clawback) | The snapshot stays; the waiter row stays. |
| Cancel effect | N/A | Service charge is only computed on approve. Cancelled-before-approve orders have null `serviceChargeSnapshot`. |

### Implicit current rule

The waiter is credited at **approval time** (when the bill is approved by admin, regardless of whether money has arrived). Walkouts and debts both leak into waiter credit even though no cash arrived.

## 4. Options

### Option A — Earn at approval; never claw back

Lock the current behaviour. The waiter earned the service charge by serving the food; whether the customer paid is a finance issue, not a payroll issue.

- **Pros:** simplest; matches "service charge is for service rendered." Waiter trust is high; numbers don't fluctuate.
- **Cons:** the chayxana eats walkouts entirely; the waiter has no financial incentive to prevent them. Cultural mismatch: in many Uzbek restaurants, the waiter is *expected* to be responsible for collection.

### Option B — Earn at cash receipt; defer on debt/walkout

Service charge is credited to the waiter only when the corresponding money arrives. For walkouts: no credit. For debts: credit when repaid. For partial repayment: pro-rate the service charge.

- **Mechanism:**
  - Don't include `serviceChargeSnapshot` in waiter aggregation directly.
  - Compute waiter service-charge earnings as `sum(payment.serviceShare)` where `payment.serviceShare = payment.amount × (serviceChargeSnapshot / totalSnapshot)` for non-debt payments, and `0` for DEBT payments.
  - On `DebtRepayment`: contribute proportional service share to the original-order's waiter for the period of `paidAt`.
- **Pros:** aligns waiter pay with cash actually received. Owner doesn't pay tips on phantom revenue.
- **Cons:** waiter's daily number is no longer "what they earned today." A repayment of a December debt on 2 January credits the waiter on 2 January, possibly to a waiter who no longer works at the chayxana. Need a rule for that.

### Option C — Hybrid: earn at approval, claw back on walkout only

Service charge is credited at approval, but **explicitly reversed** when the order is marked WALKOUT. Debt orders keep the credit because the assumption is "the customer will pay eventually." Cancellations before approval are unaffected (no charge was ever applied).

- **Mechanism:**
  - On `markWalkout` (`order.service.ts:790-827`): write a `ServiceChargeClawback(orderId, waiterId, amount, reason)` row (or use the LossLedger / FinanceLedger if PRD 05/06 Option C/D adopted). Audit as `SERVICE_CHARGE_CLAWED_BACK`.
  - Per-waiter aggregation: `sum(serviceChargeSnapshot of CLOSED orders) + sum(serviceChargeSnapshot of debt-paid orders) - sum(clawbacks)`.
- **Pros:** simple to explain to waiters ("you keep your tip unless the customer walked"). Aligns incentive: waiters want to avoid walkouts.
- **Cons:** debt-paid orders that never collect still credit the waiter (cf. PRD 06 — the debt write-off case). Need to decide whether debt write-off triggers a clawback.

### Option D — Configurable per-event

Add settings: `service_charge_clawback_on_walkout: bool`, `service_charge_clawback_on_debt_writeoff: bool`. Owner picks the policy per chayxana.

- **Pros:** flexible. Different owners can pick different cultures.
- **Cons:** more code paths to test. Configuration drift across chayxanas if we ever multi-tenant.

### Option E — Tiered partial credit for cooked-before-cancel

Coupled with PRD 05 Option A. When an order is cancelled with some cooked lines, the waiter gets a **pro-rated** service charge equal to `serviceCharge × (cookedLineValue / fullSubtotal)`. So if 1 of 5 lines was cooked, the waiter gets 20% of the service charge.

- **Pros:** matches "service rendered" principle precisely.
- **Cons:** orders that are cancelled were never approved, so the service charge was never snapshotted. We'd be computing it post-hoc from the cancel event. Doable but adds another path; mostly a small money number.

## 5. Decision matrix

| Dimension | A (no claw) | B (cash-basis) | C (claw on walkout) | D (configurable) | E (partial on cancel-cook) |
|---|---|---|---|---|---|
| Aligns waiter pay with cash received | No | Yes | Partially | Owner choice | Partially |
| Avoids "lost tip" anger | Best | Worst | Medium | Owner choice | Medium |
| Encourages walkout prevention | No | Yes | Yes | Owner choice | No |
| Schema change | None | Possibly (proportional share) | New table or LossLedger | Settings only | Minor |
| Code complexity | Lowest | Highest | Medium | Highest | Medium |
| Effort | XS | M | S | M | S |
| Waiter clarity (line item) | Easy ("earned 50k") | Hard ("today's earnings depend on tomorrow's collections") | Medium | Confusing | Medium |

## 6. Open questions

1. **What does the chayxana owner actually want?** Cultural answer. Some owners would never claw back a tip; others always do. Default culture in Uzbek chayxana operation is probably Option C (claw on walkout) — needs confirmation.
2. **Debt → write-off → clawback?** If the customer never returns to pay their debt and the owner writes it off (PRD 06 Phase 1), does the waiter's prior credit get reversed? If yes, the waiter's old report retroactively changes — bad UX. If no, the chayxana pays the tip on never-received money.
3. **Waiter who quit:** if a debt is repaid 3 months later and the waiter no longer works there, what happens? Three options: (a) the credit lapses, (b) it goes to a "pooled" line, (c) it's recorded but unpayable. Probably (a).
4. **Visibility to waiter:** should waiters see their *running* service-charge balance in the mobile app? Today: no. Could be a Phase 2 feature.
5. **Reversal UX:** how is the clawback shown in reports? As a negative line ("walkout: -10,000") or as an exclusion ("today: 12 closed orders worth of service charge, 1 walkout — not counted")?

## 7. Recommendation

**Option C** (earn at approval, claw back on walkout) as the locked rule. Combine with **explicit "debt write-off → clawback"** behaviour (linked to PRD 06).

Rationale:

- Option C matches the cultural expectation in Uzbek chayxana operations and is the easiest to explain to a waiter. It also creates a small but real incentive to pre-collect from sketchy customers.
- Option B is theoretically purer but creates lagging waiter pay that doesn't match the work day. Operationally hard.
- Option A keeps the current behaviour but the trust gradient is the single biggest cause of waiter/owner friction we can address.
- Option E (partial on cancel-cook) is a fine refinement but small money and adds a code path; defer to a follow-up after Option C lands.
- Option D's per-chayxana configuration is over-engineering for single-tenant v1.

Default policy if owner doesn't pick: **clawback on walkout, no clawback on debt opening, clawback on debt write-off.** Phrased as "the waiter keeps the tip if money was received or is expected to be received."

## 8. Rollout

### Phase 1 — Option C implementation

1. **Audit on walkout (already partial).** Extend `WALKOUT_MARKED` audit metadata with `serviceChargeClawedBack: <amount>`, derived from `order.serviceChargeSnapshot` at walkout time (or 0 if waived).
2. **Per-waiter aggregation change** in `reports.service.ts`: exclude `serviceChargeSnapshot` of WALKOUT orders. Add a new line "Walkout sababli yo'qotilgan xizmat haqi" (service charge lost to walkout) for owner-visibility.
3. **PRD 06 tie-in:** when a debt is `WRITTEN_OFF`, fire a clawback. Modify `debtService.writeOff` to enqueue the reversal.
4. **`decisions.md` update:** new sub-section under "Bills, discounts, service charge": "Clawback rules."
5. **Waiter UI surfacing**: in the mobile app, when a walkout is marked on an order the waiter owns, show a passive notification "Bu buyurtmadan xizmat haqi hisoblanmaydi" (no service charge from this order). Helps trust by making the rule visible.

### Phase 2 (linked with PRD 05 Option C / PRD 06 Option D)

- When the LossLedger / FinanceLedger is introduced, model the clawback as a counter-entry per FINANCE_PLAN §2.2.
- Add a "waiter ledger" view: per-waiter running service-charge balance with each event as a row (earned / clawed back / repaid).

### Phase 3 (optional) — Option E refinement

- For cancelled orders with cooked lines (PRD 05 Option A), compute a `partialServiceCharge` and credit the waiter.
- Likely small absolute amounts; revisit after a couple of months of Option C data.

### Backward compatibility

- Existing CLOSED and WALKOUT data: no retroactive change. The clawback rule applies to *future* walkouts only. Phase 1 PR notes this clearly.
- Existing debt write-offs (zero today since PRD 06 hasn't shipped): not affected.

### Observability

- Daily Telegram summary: include "Bugun walkout: N tasi, xizmat haqi yo'qotildi: Z UZS."
- Per-waiter daily summary in admin report: line for "service charge clawed back this period."

### Rollback

- Phase 1 is reversible: revert the report aggregation change and the audit-metadata addition. Walkout data stays as-is.
