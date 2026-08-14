# Chayxana POS — layout and UI/UX audit (master admin)

> **Stale as of 2026-08-14 — read [`design/RENDERER_REBUILD.md`](./design/RENDERER_REBUILD.md)
> first.** These 158 findings were scored against the renderer *before* the Blocks C1 rebuild.
> The rebuild addressed much of the list structurally — below-fold actions, touch targets, the
> shell — but the audit was never re-run and no finding was individually ticked off, so the
> counts below no longer describe the code. Use this as the rationale for the rebuild, not as
> a tracker. Re-auditing against the current tree is a clean next task.

**Date:** 2026-08-13 · **Branch:** `feat/c1-design-system` · **Scope:** every route in
`apps/master/src/renderer` — 15 product screens, the login gate, the shell, and the shared
list/dialog/feedback primitives. 30+ files.
**Method:** four independent read-only audits, one per screen group, each reading source
directly. Every finding carries a `file:line`. No screen was audited from a screenshot or
from another document.
**Yardstick:** [`docs/design/BLOCKS_C1.md`](./design/BLOCKS_C1.md) — the design system chosen
2026-08-13 — plus the hardware floor this product ships to: **1366×768, touchscreen, no
mouse, no hover, no keyboard in normal use** (`UI_UX_RULES.md:24`, standard `E8`).
**References:** shipping POS and money software, via Mobbin — cited per archetype in §6.

## Score

| Severity | Count | Meaning |
|---|---|---|
| **BLOCKER** | 20 | A required control cannot be reached on this hardware, or a wrong/destructive outcome can fire |
| **MAJOR** | 82 | Materially raises the cost or error-risk of a frequent task |
| **MINOR** | 56 | Real deviation, low practical cost |
| **Total** | **158** | |

| Group | Files | BLOCKER | MAJOR | MINOR |
|---|---|---|---|---|
| Operating — approval, orders, tables, confirm-and-pay | 5 | 4 | 16 | 11 |
| Money — finance, reports, expenses, debts, salaries | 17 | 9 | 28 | 19 |
| Catalog & stock — menu, ombor, discounts | 3 | 5 | 12 | 7 |
| Shell & system — nav, login, settings, users, audit, primitives | 11 | 2 | 26 | 19 |

---

## 1. The one thing to read: it was built for a mouse and deployed on glass

The 158 findings look like sixty unrelated problems. They are mostly one problem, appearing
in three forms. Four audits that never saw each other's work converged on it independently.

**Hover as an affordance — the control does not exist on this device.**

| Where | What is hidden | Evidence |
|---|---|---|
| Menu → categories | Reorder ↑, reorder ↓, edit, **deactivate** — all four | `MenuPage.tsx:287` `opacity-0 group-hover:opacity-100` |
| Sidebar, collapsed | Every nav item's *name* | `Sidebar.tsx:192-199` — Radix tooltip, hover/focus only |
| Audit log | Full metadata, entity id, raw action code | `AuditPage.tsx:39,66,73,160` — native `title` attributes |
| Orders, Debts, Monthly report | That a row is tappable at all | `DataTable.tsx:107` `hover:bg-muted/40` is the only cue |

**Hover as feedback — the operator cannot tell whether a tap registered.** Nearly every
control in `ConfirmModal` changes only on `hover:` (`:277,313,322,337,351,392,446,495,591,603`)
— including TASDIQLASH itself. Same in the sidebar (`:123,171`), on data rows
(`DataTable.tsx:107`), on menu item pickers (`OrdersPage.tsx:653-677`), on settings buttons
(`SettingsPage.tsx:376-385`).

**Pointer-precision spacing — destructive sits inside the moat.** C1 requires 16px before a
destructive action. Actual:

| Pair | Gap | Size | Where |
|---|---|---|---|
| Edit / deactivate | **4px** | 48px | `DiscountsPage.tsx:306-319` — identical colour at rest |
| Qaytim (repay) / Yo'qotish (write off) | **4px** | 28px | `ExpensesPage.tsx:214-249` — opposite outcomes |
| Edit / deactivate | **4px** | 48px | `TablesPage.tsx:292-305` |
| Edit / delete | **8px** | 28px | `MenuPage.tsx:385-398` — same colour at rest |
| Walkout / confirm-and-pay | **8px** | 48px | `ApprovalCard.tsx:87-99` |
| Discard / TASDIQLASH | **12px** | 56px | `ConfirmModal.tsx:588-616` — and discard is silent |

In every one of these pairs the destructive member is distinguished only by a `hover:` tint,
so at rest the two are visually identical on the device this runs on.

**Why this is one finding, not sixty.** Every mechanism above is the same assumption — that a
pointer exists which can hover, aim to a few pixels, and reveal things by approaching. Fixing
them one at a time treats symptoms. The rule already exists in the design system (§4, "no
hover"); what is missing is adoption.

---

## 2. The design system is installed but unused

**Zero of the 30+ audited files import `@/components/blocks`.** Not one `Seam`, `Field`, `Row`,
`Chip`, `Tile`, `Keypad`, `NavItem` or `ActionBar` is in use outside the gallery. Every screen
is still assembled from unconverted shadcn `Card`/`Table`/`Select`/`Dialog`.

The palette repaint reached every page (tokens are global), so screens *look* roughly right.
The structural rules — no borders, no shadows, no hover, 48px controls, 17px money — reached
almost nothing.

**And the primitives cannot enforce anything while pages override them.** `cn()` is
`twMerge(clsx(...))` (`lib/utils.ts`), which keeps the *last* conflicting utility — so a
caller's `className="h-9"` always beats `Button`'s compliant `h-control`. This is not
theoretical; it is how nearly every control in the app is currently under-floor:

`FinancePage.tsx:264` · `ExpensesPage.tsx:219,303,344` · `ReportsPage.tsx:381-439` ·
`AuditPage.tsx:193,215,237,254-255` · `MenuPage.tsx:209,229` · `OmborPage.tsx:166` ·
`DiscountsPage.tsx:126,143` · `TablesPage.tsx:104,121` · `Header.tsx:94` ·
`SalariesPage.tsx:91,101`

Three screens never joined the token system at all and will not repaint with it:
**LoginPage** (`bg-slate-100`, `bg-blue-600` throughout), **SettingsPage**
(`border-slate-300`, `rounded-lg`, `shadow-sm`, `bg-blue-600`), **UsersPage**
(`bg-blue-600`, `border-slate-200`, `rounded-xl`).

---

## 3. Money is rendered smaller than body text

The system sets a 17px floor for money. It is met almost nowhere, and the cause is two shared
files rather than sixty careless call sites:

- **`components/reports/report-helpers.tsx:97-121`** — the shared `Row` hardcodes 14px. Six of
  the eleven sibling report sections import it. The same file's `StatTile` correctly uses
  24/30px, so one module ships one compliant and one non-compliant money primitive.
- **`components/ui/table.tsx:12`** — the table base is `text-sm` (14px). Every `MoneyCell` in
  every table inherits it; no column overrides upward.

Consequences worth naming individually:

| What | Size | Where |
|---|---|---|
| Payroll matrix — every per-waiter-per-day figure and both totals | **12px** | `SalariesPage.tsx:210,262,289` |
| Payroll matrix — the *only* label saying which calendar day a column is | **8–9px** | `SalariesPage.tsx:227,230,232` |
| Walkout losses — money actually lost | **12px** | `IncidentsSection.tsx:91-94` |
| Per-line running subtotal while editing a live bill | **11px** | `OrdersPage.tsx:490-494` |
| Every money figure in ConfirmModal except the grand total | 12–14px | `ConfirmModal.tsx:298-300,413-426` |
| "Qoldiq" — the debt about to be collected | 16px | `DebtsPage.tsx:298-306` |

---

## 4. What can fire without intent

`components/ConfirmDialog.tsx` is the confirmation used by **5 pages** — Discounts, Users,
Debts, Tables, Menu. The safe shadcn-based twin at `components/feedback/ConfirmDialog.tsx` has
**0 importers**. Two defects in the one that shipped:

- **`:15-22`** — a `document`-level `keydown` listener calls `onConfirm()` on **any** Enter
  keypress anywhere in the app while the dialog is mounted. No focus check. It declares
  `aria-modal="true"` (`:35-36`) but installs no focus trap, so the claim is false.
- **`:30`** — the backdrop is `onMouseDown={onCancel ?? onConfirm}`. On a single-button
  dialog, tapping **outside to back out executes the action instead**.

Live consequences: staff deactivation (`UsersPage.tsx:89-113`), table deactivation
(`TablesPage.tsx:212-221`), discount retirement, menu deactivation, and the debt-repayment
error path (`DebtsPage.tsx:459`).

Separately, `Modal.tsx:48-53` closes `ConfirmModal` on any backdrop tap or Escape with no
confirmation — silently discarding a typed discount, a custom payment split, or entered
debtor details, on the screen where the customer is standing there.

---

## 5. Layout problems that are not styling

These are the findings the design system cannot fix. They are about where things are.

**The confirm-and-pay screen can hide its own submit button.** `ConfirmModal` renders in a
`max-h-[95vh]` panel with **one** scroll region that includes the footer (`Modal.tsx:59,72`).
Adding a DEBT payment — an ordinary, named payment method — expands the right column by
~230px (`ConfirmModal.tsx:532-576`). At the 1366×768 floor, TASDIQLASH can leave the visible
area, and it is not sticky (`:587-616`). This is the single most important interaction in the
product.

**The nav is taller than the screen.** Fifteen OWNER nav items at ~36px each, plus headings
and padding, compute to **≈797px against a 768px floor** (`Sidebar.tsx:48-84,135`). Reaching
Sozlamalar or Amallar tarixi at the stated minimum resolution costs a scroll first. Items are
~36px expanded and 44px collapsed — both under the 48px floor, on the control tapped all day.

**Each screen's headline is in the wrong place for its reader.** `FinancePage` opens with
`Sof foyda` — which ADMIN is not supposed to see (§below) — while the ADMIN's actual question,
drawer movement, is the **last of eight regions** (`:456-528`). `ReportsPage` renders
`GrandSummarySection` last (`:98-134`) despite its own code comment calling it *"the page
everyone looks at"* (`:127-128`), and print pagination pushes it onto the final sheet.

**ADMIN sees profit.** `FinancePage.tsx` renders `pnl.profit` twice on the first screenful
(`:292-298,412-417`) with no role check anywhere in the file, and the sidebar routes ADMIN
here (`Sidebar.tsx:55`). The API already ships the field. This is `decisions.md`'s rule broken
on screen as well as on the wire.

**The same word labels two different numbers.** On one FinancePage screenful, "Sotuv" is both
`pnl.revenue` and `mealSalesTotal.revenue` (`:271-277` vs `:321`), and "Chiqim" is both the
P&L operating figure and the cash-basis `cashOut` (`:285-291,409-411` vs `:495-504`). The code
acknowledges the divergence in a 12px caption (`:304`). `GrandSummarySection.tsx:44` already
solves this by appending "(kassadan ketgan)" — the fix exists and was not applied here.

**Ombor fights its own daily routine.** The morning task is counting several dishes. Each one
is a full open-sheet → type → save → close cycle with a network round-trip
(`OmborPage.tsx:53-66,201-320`), no batch mode and no "next item" — **8 dishes ≈ 32–48 taps
and 8 round-trips.** The count field is a raw `<input type="number">` (`:220-228`) that
summons the OS keyboard, rather than the `Keypad` primitive built for exactly this. Search
filters name and category only, so "which dishes still need counting" means eyeballing every
row's badge (`:46-51`).

**Screen area sits idle.** `DebtsPage` reserves 5/12 of a fixed monitor for a "Qarzni tanlang"
placeholder until a row is tapped — via the invisible affordance above (`:243-374`).
`SettingsPage` caps itself at `max-w-4xl` and centres (`:68`), leaving wide idle margins on a
monitor the shell targets at ≥1366px.

**One table is wider than the device.** The salary matrix computes to ~1300–1600px
(`SalariesPage.tsx:141,209-236`) inside `overflow-x-auto` with no visible scrollbar cue, on a
screen with no mouse wheel. It is also the audit's highest print risk: the global print rule
un-clips it while `styles.css:230-235` forces 9.5pt cells.

**Searching hides the answer.** `ExpensesPage`'s three stat tiles — the day's totals —
disappear the moment a search is typed (`:106,315,338`), with no substitute total for the
filtered set and no note they were hidden. Searching by name is the natural way to find a
specific avans.

**Silent failure.** `MenuPage`'s category create/update mutations have no `onError` and the
modal reads no error state (`:127-141,463-495`); the file imports no toast library either. A
duplicate category name fails with no feedback of any kind. Same pattern for item edits
(`:152-158`) and availability toggles (`:160-163`), and on `DiscountsPage` (`:82-101,217-232`).

---

## 6. What shipping POS software does instead

Reference screens from Mobbin, mapped to the archetype each of our screens belongs to. All
were designed for a mouse — the point is the *arrangement*, not their interaction model.

**Tender and confirm** — [Fresha's keypad](https://mobbin.com/screens/edfb1a02-b7ef-4354-850d-cf7b9ce8b74a)
puts a fixed 3-column numeric pad, quick-amount chips and a live "Change · $52.80" readout in
one panel, with the confirm button pinned beside the amount.
[Square's quick charge](https://mobbin.com/screens/f4cd018c-ee3c-4fb6-93db-6599ffbcc115) sets
the total huge at the top and banks actions in a fixed header. Both keep the total and the
action outside the scroll region — which is exactly the property `ConfirmModal` lacks.

**Order and transaction lists** — [Stripe](https://mobbin.com/screens/6487c11d-ba85-4c3b-901e-b65d07441884)
and [Midday](https://mobbin.com/screens/98dbaa08-4220-4b7a-b819-8fe9a7f3e995) carry status as a
filled pill and separate rows with hairlines and no card wrapper; the row's own fill states
what it is. [Rocket Money](https://mobbin.com/screens/9eed57e6-e46a-4c91-a210-cd7cd3a11182)
puts bulk actions in a persistent bottom bar rather than per-row icons.

**Inventory** — this is the sharpest contrast with Ombor.
[Uvodo](https://mobbin.com/screens/4a706510-c67c-4b96-a33c-b36ac9393100) edits stock **in the
row**: an Add/set toggle, a quantity field and Save, per line, no sheet.
[Shopify](https://mobbin.com/screens/3905b199-779e-4c21-9560-28c55b175d91) does the same with
Available/On hand inline inputs down the whole list. Either pattern turns our 8-dish morning
routine from eight modal cycles into one pass down a column — and the Add/set toggle is
precisely the Keldi/Sanoq distinction we currently express as two identical adjacent buttons.

**Floor and tables** — [Kiwi](https://mobbin.com/screens/42117ad6-208b-4ebd-8895-dd830432dba9)
and [TravelPerk](https://mobbin.com/screens/d5870b9f-4132-45b6-b969-c84bb3a4478a) seat maps
carry state by fill with a legend present, selected inverting, and unavailable struck through
— never a 10% tint like `TablesPage.tsx:240-273`.

**Reports** — [Whop](https://mobbin.com/screens/0bb8b25f-0c3d-47c3-b20a-1447e7dbab9e) leads with
stat tiles carrying deltas against the comparison period.
[Google Analytics](https://mobbin.com/screens/8002e6c1-5c40-4be8-8e16-f7e9883211a0) offers named
presets — Today, Yesterday, Last 7 days, Last 28 days — instead of two raw date fields, which
is what our 36px date inputs currently demand.

**Staff** — [Square's team screen](https://mobbin.com/screens/7f45faad-0a54-4701-a98f-4c689f4ec6ea)
is a plain list plus a slide-over holding permissions and a deliberate "Show passcode"
affordance — the shape UsersPage wants, and a model for PIN handling that does not assume a
QWERTY keyboard.

---

## 7. Findings by screen

Full per-file detail, including layout skeletons and tap-cost analysis, is in the four source
reports summarised here. Each finding below carries its own `file:line`.

### Operating — approval, orders, tables, confirm-and-pay (31)

| ID | file:line | Sev | What |
|---|---|---|---|
| J1 | `Modal.tsx:59,72` + `ConfirmModal.tsx:532-576,587-616` | BLOCKER | Adding a DEBT payment can push TASDIQLASH below the fold at 1366×768; footer is not sticky |
| J2 | `ConfirmModal.tsx` throughout | BLOCKER | Nearly every control's only state change is `hover:` — no tap feedback anywhere, including TASDIQLASH |
| H1 | `OrdersPage.tsx:235-252` + `DataTable.tsx:105-108` | BLOCKER | The only way to open an order is a `<tr>` whose sole cue is `hover:`; not keyboard reachable |
| I1 | `TablesPage.tsx:212-221` → `ConfirmDialog.tsx:15-22` | BLOCKER | Stray Enter anywhere fires the deactivate confirm |
| G1 | `ApprovalCard.tsx:87-99` | MAJOR | Walkout and confirm-and-pay 8px apart on the highest-frequency action row |
| G2 | `ApprovalCard.tsx:88-92` | MAJOR | Destructive button reads as neutral at rest; red only on hover |
| G3 | `ApprovalCard.tsx:51,56,62-68,71,78` | MAJOR | Waiter, time, line previews, "Summa" label all 11–12px |
| F1 | `ApprovalQueuePage.tsx:74-83` + `ApprovalCard.tsx:14-19` | MAJOR | Every takeaway order shows the identical "Stol biriktirilmagan"; disambiguators are sub-floor |
| H2 | `OrdersPage.tsx:235-252` | MAJOR | Rows ~36–40px against the 48px floor |
| H3 | `OrdersPage.tsx:159-164` | MAJOR | The Summa column — what the list is scanned for — is 14px |
| H4 | `OrdersPage.tsx:502-570` | MAJOR | Qty ± / remove on a live bill are 28px |
| H5 | `OrdersPage.tsx:430,770-802` | MAJOR | Cancel/Reprint share one scroll region with the line list and item picker; no sticky footer |
| H6 | `OrdersPage.tsx:490-494` | MAJOR | Per-line running subtotal at 11px |
| I2 | `TablesPage.tsx:240-273` | MAJOR | Occupied/empty — the page's only live state — rendered at 10% opacity |
| I3 | `TablesPage.tsx:292-305` | MAJOR | Edit and deactivate 4px apart |
| J3 | `Modal.tsx:48-53,22-26` | MAJOR | Backdrop tap or Escape silently discards a typed discount, payment split or debtor data |
| J4 | `ConfirmModal.tsx:588-616` | MAJOR | Discard sits 12px from confirm, and the discard is silent |
| J5 | `ConfirmModal.tsx:308-354` | MAJOR | Qty ± / remove are 36px, editing the bill seconds before payment |
| J6 | `ConfirmModal.tsx:375-384,479-489` | MAJOR | Discount and payment amount are raw 12px `<input type="number">`, bypassing `Input numeric` and `Keypad` |
| J7 | `ConfirmModal.tsx:217,408,438,601-605` | MAJOR | Hand-rolled slate/blue/violet palette — the money screen looks like a different app |
| F2, F3, G4, H7–H9, I4–I6, J8, J9 | various | MINOR | Reintroduced borders and shadows; sub-floor labels; hardcoded status colours; unlabelled clear-search targets |

### Money — finance, reports, expenses, debts, salaries (56)

| ID | file:line | Sev | What |
|---|---|---|---|
| F1 | `FinancePage.tsx:292-298,412-417` | BLOCKER | ADMIN sees `pnl.profit` twice on the first screenful; no role check in the file |
| F2 | `FinancePage.tsx:271-277` vs `:321` | BLOCKER | "Sotuv" labels two different numbers on one screen |
| F3 | `FinancePage.tsx:285-291,409-411` vs `:495-504` | BLOCKER | "Chiqim" labels the P&L figure and the cash figure, unqualified |
| F7 | `FinancePage.tsx:80-114,437` | BLOCKER | Collapsed "Bugungi xaridlar" unmounts its children, so printing silently omits the purchases table with no trace |
| MT-1 | `MonthlyTable.tsx:33-121` + `ReportsPage.tsx:355-359` | BLOCKER | 9 columns × 31 rows printed by DOM capture at forced 9.5pt — highest clipping risk in the audit |
| SAL-1 | `SalariesPage.tsx:227,230,232` | BLOCKER | 8–9px day headers are the only identifier of which date a payroll column is |
| SAL-2 | `SalariesPage.tsx:210,262,289` | BLOCKER | The whole payroll matrix — every figure and both totals — is 12px |
| EXP-1 | `ExpensesPage.tsx:214-249,276` | BLOCKER | Repay and write-off: 28px buttons, 4px apart, opposite outcomes |
| DB-1 | `DebtsPage.tsx:245-262` | BLOCKER | The only route to the repay action is a hover-only row |
| F4, F5, F6 | `FinancePage.tsx:176-244,341-417,456-528,264` | MAJOR | Money at 12–14px outside the tiles; drawer figure last of 8 regions; 36px date control |
| RP-1, RP-3, RP-4, RP-6 | `ReportsPage.tsx:98-134,381-439,506-519` | MAJOR | "The page everyone looks at" rendered last; all period controls 36px; drill-down dialog re-buries the headline |
| RH-1 | `report-helpers.tsx:97-121` | MAJOR | Shared `Row` hardcodes 14px — root cause across 6 sibling files |
| RS-1, CF-1, EXS-1, DS-2, MS-1, MT-2 | reports sections | MAJOR | Every figure backing a headline renders at 14px |
| IS-1 | `IncidentsSection.tsx:91-94` | MAJOR | Walkout losses — money actually lost — at 12px |
| GS-2 | `GrandSummarySection.tsx:22-97,134-172` | MAJOR | Six of seven groups restate figures shown above, smaller |
| EXP-5 | `ExpensesPage.tsx:106,315,338` | MAJOR | Searching removes the day's totals with no substitute |
| EXP-2, EXP-3, EXP-4 | `ExpensesPage.tsx:253-266,303,344` | MAJOR | 28px reverse button; 36px date; raw `<input>` search |
| DB-2, DB-3, DB-4 | `DebtsPage.tsx:169-191,298-306,243-374` | MAJOR | Debt columns 14px; "Qoldiq" 16px; 5/12 of the screen idle until selection |
| SAL-3, SAL-4, SAL-5, SAL-6 | `SalariesPage.tsx:141-236,222-289` | MAJOR | ~1300–1600px matrix needing drag-scroll; today/weekend by colour alone; raw amber tokens; summary at 14px |
| F8, F9, RP-2, RP-5, RS-2, SS-1, CF-2, DS-1, IS-2, OS-1, MT-3, RH-2, GS-1, EXP-6, EXP-7, DB-5–DB-7, SAL-7 | various | MINOR | Non-token colours; duplicated figures; accent ring on the summary group; nested scroll in a sticky panel; dead hover styles |

### Catalog & stock — menu, ombor, discounts (24)

| ID | file:line | Sev | What |
|---|---|---|---|
| M1 | `MenuPage.tsx:287-313` | BLOCKER | Four category actions including deactivate exist only on hover |
| M2 | `MenuPage.tsx:127-141,463-495` | BLOCKER | Category save failures are completely silent — no `onError`, no error state, no toast library |
| M3 | `MenuPage.tsx:385-398` | BLOCKER | Edit and delete 8px apart at 28px, identical colour at rest |
| O1 | `OmborPage.tsx:220-228` | BLOCKER | The count field — the page's entire purpose — is a raw number input, not `Keypad` |
| D1 | `DiscountsPage.tsx:306-319` | BLOCKER | Edit and deactivate 4px apart, identical at rest, destructive tint hover-only |
| M4–M8 | `MenuPage.tsx:152-163,327,359-360,590-771,474-736` | MAJOR | Silent item-edit failures; `Button` used once in the file; prices at 14px; cost fields skip `numeric`; two design languages in one form |
| O2 | `OmborPage.tsx:146-153` | MAJOR | Keldi (additive) and Sanoq (absolute) identical and 8px apart — no signal they differ |
| O3 | `OmborPage.tsx:46-51` | MAJOR | No filter for "still uncounted" — scan every row's badge |
| O4 | `OmborPage.tsx:53-66,201-320` | MAJOR | One full sheet cycle per dish; 8 dishes ≈ 32–48 taps |
| O5 | `OmborPage.tsx:229-250` | MAJOR | The current count and derived unit cost — both load-bearing — at 12px |
| D2 | Discounts ↔ `billing.service.ts:103-115` | MAJOR | Confirm never sends `discountId`, so the cap-checking branch is unreachable; the page's caps govern a number nothing reads |
| D3, D4 | `DiscountsPage.tsx:82-101,409-415` | MAJOR | Silent save failures; discount value typed at 15px |
| M9–M11, O6, O7, D5, D6 | various | MINOR | 36px controls with borders; sub-floor labels; missing `numeric`; dead hover styles |

### Shell & system — nav, login, settings, users, audit, primitives (47)

| ID | file:line | Sev | What |
|---|---|---|---|
| CD-1 | `ConfirmDialog.tsx:15-22` | BLOCKER | Global Enter listener fires `onConfirm` regardless of focus |
| CD-2 | `ConfirmDialog.tsx:30` | BLOCKER | Backdrop runs `onConfirm` on single-button dialogs — tapping out executes |
| SB-1, SB-2, SB-4, SB-6 | `Sidebar.tsx:164-172,167,192-199,48-84` | MAJOR | Nav items ~36px expanded, 44px collapsed; collapsed names hover-only; ≈797px of nav against a 768px floor |
| HD-1, HD-2 | `Header.tsx:94,108` | MAJOR | Profile control hardcoded 40px; logout ≈32px, two taps deep |
| LP-1, LP-2 | `LoginPage.tsx:71-104` | MAJOR | No keypad or `inputMode` on a keyboard-less machine; every control sub-floor including the submit; no tokens |
| ST-1 – ST-4, ST-6 | `SettingsPage.tsx:68,95-338` | MAJOR | No tokens at all; every input 40px; toggles 24px; Save 44–48px; `max-w-4xl` wastes the monitor |
| UP-1 – UP-5 | `UsersPage.tsx:131-296` + `UserEditDialog.tsx:179-188` | MAJOR | 34px hover-only action icons; primary CTA 40px; no tokens; wires the buggy ConfirmDialog to staff deactivation; PIN is `type="text"` with no numeric hint |
| AP-1 – AP-3 | `AuditPage.tsx:33-36,39,66,73,160,193-255` | MAJOR | All five filter controls 36px; raw colours; the actual audit detail only in hover tooltips |
| DT-1, DT-2 | `DataTable.tsx:63-79,105-109` | MAJOR | `onClick` on `<tr>` with no keyboard route; no sorting anywhere |
| CD-3, CD-4 | `ConfirmDialog.tsx:35-58` | MAJOR | Declares `aria-modal` with no focus trap; both buttons 36px |
| FB-1 | `feedback/ConfirmDialog.tsx` | MAJOR | The safe implementation exists with zero importers |
| AS-1, AS-2, SB-3, SB-5, SB-7, HD-3, HD-4, LP-3, DB-1, DB-2, ST-5, UP-6, UP-7, AP-4, DT-3, DT-4, CD-5, FB-2, FB-3 | various | MINOR | Sub-floor toggles and labels; a 2px accent bar in the collapsed sidebar; hand-rolled tables; dead hover; radius/border reintroductions; unwired dead components |

---

## 8. Remediation sequence

Ordered by what it costs to leave alone, not by file.

**1 — Stop unintended state changes (hours).** Migrate the 5 importers of
`components/ConfirmDialog.tsx` to the shadcn twin that already exists, or fix the Enter
listener and the backdrop handler in place. Add a confirmation before `Modal.tsx` discards
entered payment data.

**2 — Restore reachability (days).** Every hover-only affordance is a feature that does not
exist on this hardware: MenuPage's four category actions, the collapsed sidebar's labels,
AuditPage's metadata, and every "this row is tappable" cue. Nothing here needs a redesign —
the fills and press states already exist in `blocks`.

**3 — Make confirm-and-pay safe on the real screen (days).** Pin the total and TASDIQLASH
outside the scroll region — the arrangement Fresha and Square both use — so no payment method
can push the button off-screen. Then bring the 36px controls up and replace the raw number
inputs with `Keypad` and `Input numeric`.

**4 — Fix money legibility at the source (hours).** `report-helpers.tsx:97-121` and
`ui/table.tsx:12` are two edits that lift most of the money in the app over the floor. Then
the payroll matrix, which needs its own treatment.

**5 — Adopt the primitives (weeks, incremental).** Page by page, replace `Card`/`Table`
composition with `Seam`/`Field`/`Row`/`Chip` and delete the `h-9` overrides that currently
beat the compliant defaults. Start with the screens touched most: Approval, Orders, Ombor.

**6 — Then the layout questions**, which are product decisions rather than defects: what
FinancePage leads with for each role, where the report summary belongs, whether Ombor gets
in-row counting, and how the payroll matrix should behave on a 1366px screen.

**Separately and immediately:** ADMIN can see profit on screen (`FinancePage`) as well as on
the wire. That is a role-contract break, not a layout finding.

---

## 9. Coverage and method

**Audited:** all 15 product routes, the login gate, `AppShell`/`Sidebar`/`Header`, `DataTable`,
both `ConfirmDialog` implementations, `ConfirmModal`, `Modal`, `ApprovalCard`, the 12
`components/reports/*` sections, and `components/feedback/*`.

**Not audited:** `pages/ComponentsPage.tsx` (the dev gallery, not product), the order and
mobile waiter apps, and anything server-side.

**Not attempted:** live rendering. Every size is computed from the Tailwind classes in source,
not measured in a running app — the 1366×768 overflow claims for the sidebar and ConfirmModal
are arithmetic and should be confirmed on the real monitor before being treated as exact.

**Fixed during the audit:** `boxShadow` was not zeroed in the Tailwind theme, so `shadow-*`
still rendered on every unconverted `Card` and `Dialog` despite the system forbidding it.
Corrected in `tailwind.config.cjs` (commit `d7e141f`); shadows now resolve to `none`
app-wide.

**Overlap with `AUDIT_FINDINGS.md`:** that audit (2026-08-03) covered correctness, money
integrity and fiscal compliance, and included cross-cutting UI findings from a pre-C1
standpoint. This one is layout and interaction against the chosen design system and the touch
hardware. Where they overlap — sub-12px text, the hover-hidden MenuPage actions, the two
ConfirmDialogs, DataTable's keyboard gap — the findings agree and the line references here are
current.
