# POS Standards — audit rubric for Chayxana POS

**Purpose.** A single, externally-grounded checklist to audit this product against. Every finding
produced by an audit MUST cite an ID from this file. No finding may be "I don't like this".

**Authored:** 2026-08-03. **Applies to:** `apps/master`, `apps/order`, `apps/mobile`.

## Sources

| Ref | Source | Authority |
|---|---|---|
| **KEUR** | [Standard for a Reliable POS System v2.0](https://www.keurmerkafrekensystemen.nl/) (Stichting Betrouwbare Afrekensystemen, 2017) — 4 control objectives | Formal certification standard for POS reliability |
| **UZ** | Постановление КМ РУз №943, 23.11.2019 "О порядке применения онлайн-ККМ и виртуальной кассы"; lex.uz 4603329; Soliq.uz guidance | **Uzbek law — binding on this business** |
| **WCAG** | W3C WCAG 2.2 (SC 2.5.5, 2.5.8, 1.4.3, 1.4.11, 2.4.7, 3.3.1, 3.3.4) | International accessibility standard |
| **UXP** | Creative Navy POS design research; NCR Aloha Cloud POS order-entry patterns; Nielsen heuristics | Industry POS UX practice |
| **HOUSE** | `docs/UI_UX_RULES.md` (internal, 2026-05-15) | Internal house style — binding by team agreement |

**Severity scale** (use these words exactly in findings):

| Severity | Meaning |
|---|---|
| **BLOCKER** | Illegal, loses money, or corrupts financial records. Ship-stopping. |
| **CRITICAL** | Breaks a core flow, or lets an operator cause unrecoverable harm. |
| **MAJOR** | Materially slows or confuses the operator; violates a hard standard. |
| **MINOR** | Inconsistency or polish; no operational risk. |

---

## A. Fiscal & legal compliance (UZ)

Uzbek law requires every cash settlement with the public to go through a registered **onlayn-NKM**
or **virtual kassa** with a fiscal module, transmitting in real time to the fiscal data operator.
This is not optional and penalties escalate to suspension of activity.

| ID | Requirement | Source |
|---|---|---|
| **A1** | Every sale issues a **fiscal receipt** (fiskal chek), for cash and card alike. | UZ |
| **A2** | Receipt carries a **fiskal belgi** (unique fiscal mark issued by the DYS/state server). | UZ |
| **A3** | Receipt carries a scannable **QR code** + verification URL resolving on soliq.uz. | UZ |
| **A4** | Receipt line items carry **MXIK code** (national product catalogue ID), name, qty, price. | UZ |
| **A5** | Receipt shows **QQS/VAT** amount, total, payment type (naqd / karta), sequential receipt number, date+time. | UZ |
| **A6** | Transactions transmit to the fiscal data operator in **real time**; offline sales queue and flush. | UZ |
| **A7** | Only hardware/software entered in the **Davlat reyestri** may be used as the cash register. | UZ |
| **A8** | End-of-day **shift close** (smena yopish) is performed and recorded. | UZ, KEUR 3.4 |
| **A9** | Receipt reprint from history is supported and marked as a copy, not a new fiscal document. | UZ |

> **Scoping note for auditors.** If the chayxana settles through a separate certified fiscal
> device that this software does not drive, A1–A7 may be satisfied *outside* this codebase — but
> then this system's totals and the fiscal device's totals must reconcile, and that reconciliation
> must exist. Report the gap either way; flag which of the two situations applies.

---

## B. Transaction integrity & audit trail

| ID | Requirement | Source |
|---|---|---|
| **B1** | Every event from the start of the sales process is registered, with who / what / when / where. | KEUR 3.1 |
| **B2** | Special events are **marked and stored as such**: discounts, voids, returns, aborted transactions, walkouts, withdrawals, training mode. | KEUR 3.1 |
| **B3** | Corrections never mutate the original record; a correction is an **additional** row linked by audit trail to the original. | KEUR 3.1 |
| **B4** | Registered events are protected against unauthorised change; changes remain transparent. | KEUR 3.2 |
| **B5** | The audit trail is accessible and queryable for the retention period. | KEUR 3.2 |
| **B6** | A financial total, once settled, cannot be silently restated by a later edit. | KEUR 3.2 |
| **B7** | Every money-affecting action is attributable to an authenticated individual (no shared accounts for money actions). | KEUR 3.2 |
| **B8** | Direct database access outside the application is detectable. | KEUR 3.2 |

---

## C. Retention, storage & recovery

| ID | Requirement | Source |
|---|---|---|
| **C1** | Transaction data retained for the statutory period (KEUR uses 7 years; confirm UZ equivalent). | KEUR 3.3 |
| **C2** | **Regular automated backups** exist and are verified restorable. | KEUR 3.3 |
| **C3** | Data is verifiable and authentic — protected from undocumented change. | KEUR 3.3 |
| **C4** | A documented recovery procedure exists for total loss of the master machine. | KEUR 3.3 |
| **C5** | Data export in a common format for accounting/tax inspection. | KEUR 3.4 |

---

## D. Reporting & reconciliation

| ID | Requirement | Source |
|---|---|---|
| **D1** | Reports are accurate, complete, timely, and **show how they are structured** (a number can be traced to its inputs). | KEUR 3.4 |
| **D2** | System supports **daily cashing-up**: counted cash vs theoretical cash, with the difference shown and explainable. | KEUR 3.4 |
| **D3** | Two reports covering the same period **agree with each other**, or the difference is explained in the UI. | KEUR 3.4 |
| **D4** | Every terminal state of an order (closed, walkout, cancelled) is represented in financial reporting — nothing silently vanishes. | KEUR 3.1, 3.4 |
| **D5** | Cost of goods is recognised for all consumed inventory, not only for successfully-paid orders. | KEUR 3.4 |
| **D6** | Day boundaries are unambiguous and consistent across every report (single timezone anchor). | KEUR 3.4 |

---

## E. Order-entry speed & ergonomics

POS operators build muscle memory within 2–3 weeks. Every extra step is multiplied by hundreds of
repetitions per shift. Operators **scan, they do not read**.

| ID | Requirement | Source |
|---|---|---|
| **E1** | The highest-frequency action on any screen is the largest and most reachable control. | UXP |
| **E2** | Adding a menu item to an order is ≤2 taps from the order screen. | UXP |
| **E3** | The live ticket (what's ordered + running total) is visible **without leaving** the item-selection screen. | UXP |
| **E4** | Typography is tuned for glance-parsing: clear hierarchy, no dense uniform blocks of same-size text. | UXP |
| **E5** | No modal stacking; depth beyond 2 levels requires a persistent breadcrumb or clear back affordance. | UXP, HOUSE 8.4 |
| **E6** | Layout position of frequent controls is stable across states — controls must not move as data changes. | UXP |
| **E7** | Validation blocks only what is genuinely invalid; it must not become an obstacle a power user fights every transaction. | UXP |
| **E8** | The system works at the stated hardware floor (1366×768 desktop; 360–430px phone) with no horizontal scroll. | HOUSE 2 |

---

## F. Error prevention & money safety

| ID | Requirement | Source |
|---|---|---|
| **F1** | Money inputs reject structurally invalid values **at the input**, not at the server round-trip (no negatives, no decimals where integers are required). | UXP, KEUR 3.2 |
| **F2** | Client-side and server-side validation agree — the UI must never permit a submission the server will reject as malformed. | UXP |
| **F3** | Every destructive or irreversible action confirms first, naming what will happen. | HOUSE 1.6 |
| **F4** | Double-submission of a settlement is impossible — enforced on the **server**, not only by disabling a button. | KEUR 3.2 |
| **F5** | Error messages state what went wrong and what to do next, in the operator's language. Never a raw code or foreign-language string. | WCAG 3.3.1, HOUSE 10 |
| **F6** | Discounts and price overrides are bounded by policy limits that the UI cannot bypass. | KEUR 3.2 |
| **F7** | Any legal state a business can reach must be closeable — no operational dead-ends. | UXP |
| **F8** | The printed customer document must be internally consistent: line items sum to the stated subtotal, and every charge is a labelled line. | UZ A5, KEUR 3.1 |

---

## G. Accessibility & readability

| ID | Requirement | Source |
|---|---|---|
| **G1** | Pointer targets ≥ **24×24 CSS px** (minimum). | WCAG 2.5.8 |
| **G2** | Primary/frequent controls ≥ **44×44 px** (enhanced; also HOUSE mobile floor). | WCAG 2.5.5, HOUSE 5 |
| **G3** | Body text contrast ≥ **4.5:1**; large text ≥ 3:1. | WCAG 1.4.3 |
| **G4** | UI component and state boundaries contrast ≥ **3:1**. | WCAG 1.4.11 |
| **G5** | Focus is always visible and every control is keyboard reachable. | WCAG 2.4.7 |
| **G6** | Minimum readable body size: 12px absolute floor; 14px default for operational text. | HOUSE 4 |
| **G7** | Colour is never the sole carrier of meaning (status also has text or icon). | WCAG 1.4.1 |

---

## H. Resilience & degraded operation

| ID | Requirement | Source |
|---|---|---|
| **H1** | Connection state is always visible to the operator. | HOUSE 8.9 |
| **H2** | Actions that cannot succeed offline are disabled with an explanation, not failed after the fact. | HOUSE 8.9 |
| **H3** | Loss of connection mid-transaction cannot produce a partial or duplicate financial record. | KEUR 3.2 |
| **H4** | Server-push failures degrade safely — stale data must be detectable by the operator. | KEUR 3.4 |
| **H5** | Hardware failure (printer) has a defined, non-destructive recovery path. | KEUR 3.2 |

---

## I. Roles, access & anti-fraud

A POS concentrates stock, sales, pricing and settlement in one operator's hands. Controls exist to
reduce that risk.

| ID | Requirement | Source |
|---|---|---|
| **I1** | Role restrictions are enforced **server-side**; the client is never the only gate. | KEUR 3.2 |
| **I2** | Privileged financial data is not transmitted to clients not entitled to see it. | KEUR 3.2 |
| **I3** | Discretionary money actions (discount, void, walkout, write-off) are individually audited with actor + reason. | KEUR 3.1 |
| **I4** | Authentication is per-person; sessions expire; credentials are hashed. | KEUR 3.2 |
| **I5** | Brute-force resistance on all credential endpoints. | KEUR 3.2 |
| **I6** | Inventory adjustments outside of sales (waste, stocktake, write-off) are possible, attributable, and auditable. | KEUR 3.1 |

---

## J. Consistency & house-style conformance

| ID | Requirement | Source |
|---|---|---|
| **J1** | Single accent colour; status palette reserved for status. | HOUSE 3 |
| **J2** | Shared primitives used everywhere (Button, ConfirmDialog, MoneyCell, DateCell, EmptyState). | HOUSE 7 |
| **J3** | Spacing/typography from the scale — no arbitrary pixel values. | HOUSE 5, 14 |
| **J4** | All user-facing strings in Uzbek. | HOUSE 10 |
| **J5** | Same interaction pattern for the same concept on every screen. | UXP, HOUSE 1.5 |
| **J6** | Money always via the money formatter; dates always via the date formatter, one timezone. | HOUSE 9 |

---

## Finding format (mandatory)

Every audit finding must be a row with exactly these fields:

```
ID:        <area>-<n>            e.g. ORDER-3
STANDARD:  <rubric id>           e.g. F4
SEVERITY:  BLOCKER|CRITICAL|MAJOR|MINOR
FLOW:      <which user flow>     e.g. "Admin confirm + payment"
WHAT:      one sentence — the defect, factual
EVIDENCE:  file:line             must be real and verifiable
IMPACT:    what it costs the business, concretely
FIX:       the smallest correct change
```

Rules for auditors:

1. **Cite the rubric ID.** A finding with no standard ID is an opinion — drop it.
2. **Cite file:line you actually opened.** No inferred locations.
3. **No duplicates across areas** — if two flows share a root cause, report it once in the flow
   that owns the code.
4. **Severity is about business impact**, not effort to fix.
5. If something is *correct*, say so briefly — a clean area is a useful audit result.
