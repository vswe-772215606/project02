# Chayxana POS — Product audit findings

**Date:** 2026-08-03 · **Commit:** `e8af3bf` (tag `v0.1.3`), clean tree
**Rubric:** every finding cites an ID from [`POS_STANDARDS.md`](./POS_STANDARDS.md). Findings with no
standard ID were dropped as opinion.
**Method:** 8 parallel audits, one per flow, each reading source directly. Every BLOCKER and CRITICAL
below was independently re-verified against the code before being recorded here.

## Score

| Severity | Count | Meaning |
|---|---|---|
| **BLOCKER** | 11 | Illegal, loses money, or corrupts financial records |
| **CRITICAL** | 18 | Breaks a core flow, or permits unrecoverable harm |
| **MAJOR** | 82 | Materially slows/confuses the operator, or violates a hard standard |
| **MINOR** | 34 | Inconsistency or polish |
| **Total** | **145** | |

Coverage: fiscal/legal · audit-trail & anti-fraud · confirm+payment · waiter order entry ·
reporting & retention · resilience · cross-cutting UI · inventory & menu admin. All eight flows
audited. Duplicates across areas were merged, not double-counted.

---

## 1. The one thing to read: there are no detective controls

The individual findings matter, but they share a shape. Take the most common POS fraud there is —
serve the food, void the line before the bill, pocket the cash:

| Channel that should catch it | Why it doesn't |
|---|---|
| Audit trail | Line voids write **no audit row** and store **no actor** (`AUDIT-3`) |
| Stock ledger | Voiding **restores** the ingredients, so inventory says the food was never made (`order.service.ts:477`) |
| Cash count | There is **no cash count** — counted cash cannot be entered anywhere (`REPORT-1`) |
| Stocktake | Stocktake is an unshipped stub that throws (`AUDIT-11`) |
| Menu price history | Price changes are **unaudited** and discard the actor (`AUDIT-8`) |

Each is a separate finding. Together they mean the theft is invisible through **every** channel
simultaneously. This is a design-level gap, not five unrelated bugs, and it should drive
remediation ahead of any individual item below.

Four other themes recur:

- **Corrections mutate instead of appending.** Expenses and purchases get this exactly right
  (original preserved, reversal appended, reason required). Order lines do the opposite — quantity
  and notes are overwritten in place with no history (`AUDIT-4`).
- **Configuration that enforces nothing.** Discount caps are live, editable settings the owner
  reasonably believes are enforced; the only code path that reads them is unreachable from any UI
  (`CONFIRM-6`).
- **Client-side-only enforcement.** Profit hiding, item availability, and SERVICE-line protection
  are all enforced in one client and absent from the server (`AUDIT-10`, `D8`, `WAITER-16`).
- **The design system exists and is correct — adoption is the problem.** Tokens conform to the house
  spec exactly; ~40% of the renderer predates them and never migrated (`UISYS-10`).

---

## 2. BLOCKERs

### Fiscal & legal

**F-1 · No fiscal receipt is issued** — `A1, A6, A7`
Uzbek law (КМ РУз №943, 23.11.2019) requires every settlement with the public to pass through a
registered onlayn-NKM / virtual kassa with a fiscal module transmitting in real time. This codebase
has no fiscal module, no fiscal-operator client, no configuration, and no stub. `fiskal`, `soliq`,
`MXIK`, `QQS`, `NKM` appear **zero** times in source.
`order.service.ts:707,726` · `print.service.ts:126-161` · `schema.prisma:50-53` · `seed.ts:118-138`

**F-2 · Cannot reconcile against an external fiscal device** — `A7`
If settlement happens on a separate certified device, nothing here can tie to it. The only candidate
column, `Payment.reference`, is set by no client — it exists solely as a TS type.
`schema.prisma:403-416` · `payment.repo.ts:24` · `api/orders.ts:9`

**F-3 · Printed document lacks all four mandatory fiscal elements** — `A2, A3, A4, A5`
No fiskal belgi, no QR/verification URL, no MXIK per line, no QQS amount. Also no payment method and
no sequential receipt number (the "number" is a cuid tail). `receipt.cpp` emits nine ESC/POS commands
and never `GS ( k`, so it is **physically incapable** of printing a QR code without a code change.
`receipt-builder.ts:48,69-76` · `receipt.cpp:45-59,306-310`

### Money integrity

**F-4 · ADMIN can self-promote to OWNER, unaudited** — `I1`
`create()` blocks non-owners from making owners. `update()` checks only the *existing* role, never
the incoming one — and audits nothing but reactivation. One PATCH grants every owner-only control.
`user.service.ts:79-95` vs `:24-26` · `users.controller.ts:22` · `users.routes.ts:13`

**F-5 · Credential hashes are served to any ADMIN** — `I2`
`include: { user: true }` with no `select` ships every actor's `passwordHash` and `pinHash` through
`/api/audit`. `lib/public-user.ts` exists to strip exactly these and is correctly used on every other
user endpoint — just not here. Chained with F-4: escalate, then harvest the owner's hash.
`audit.repo.ts:42`

**F-6 · Second DEBT leg is silently uncollectable** — `F2, B1, D4`
`.find()` takes only the first DEBT payment and passes that amount to the debt ledger, while
`createMany` writes all legs. Two debt legs → revenue recognised in full, receivable recorded for one.
Balance check passes; nothing errors; the remainder never appears in Qarzlar to be chased.
`order.service.ts:673,707,711` · `debt.service.ts:70-79`

**F-7 · Negative payment legs are accepted end to end** — `F2, B1, D2`
No `.nonnegative()` on the amount schema (the adjacent `discountAmount` has it). CASH +200 000 /
CARD −100 000 on a 100 000 bill passes client and server. The order closes correctly while the day's
tender mix is corrupted — a working mechanism to move money between tender types.
`orders.controller.ts:52` · `ConfirmModal.tsx:479-488` · `payment.repo.ts:19-27`

**F-8 · Order lines are voided and re-quantified with no audit row and no actor** — `B1, B2, B7, I3`
`cancelLine` and `updateLineQuantity` write no `AuditLog`, and `OrderLine` has no `canceledById`.
Both are permitted on SENT orders. The reason is optional and coerced to `''`. See §1.
`order.service.ts:438-484, 347-407` · `schema.prisma:361-366` · `orderLine.repo.ts:29-45`

### Durability

**F-9 · There is no backup of any kind** — `C2`
No scheduled job, no manual command, no UI action, no packaged script. Every order, payment, debt,
expense, purchase batch and audit row lives in one file on one Windows machine with no copy anywhere.
Verified: zero occurrences of `backup`, `.bak`, `copyFileSync` in `src` or `scripts`.
`lib/scheduler.ts:24-44` · `package.json` build config

**F-10 · Printer outage stops all revenue recording** — `H5, F7`
The bill print is blocking inside the confirm transaction with no override, so a jammed/offline/
unconfigured printer makes **every** order un-closeable. The rollback itself is correct; the absence
of any recovery path is not. The operator's only escapes both corrupt the day: cancel restores stock
for eaten food, walkout records the sale at zero.
`order.service.ts:721-731` · `print.service.ts:95-97,124-129`

### Costing

**F-11 · SIMPLE dishes bought in kg/l understate COGS 1000×** — `D5`
`UNIT_PRESETS` maps `kg → gramm, factor 1000` and SIMPLE mode offers Kilogramm/Litr. Stock enters as
`qty × factor` (10 kg → 10 000 gramm) but the self-ingredient consumption path peels a **bare portion
count** — 1 gramm per sale, not 1 kg. The dish books ~100% margin forever, `OUT_OF_STOCK` never
fires, and the yield badge reads "10000 porsiya". The helper text promises the opposite of what
happens. Correct only for `dona` (factor 1).
`menu.service.ts:101,275-276,304` · `consumption.service.ts:56` · `MenuPage.tsx:817-819,849`

---

## 3. CRITICALs

| ID | Std | What | Evidence |
|---|---|---|---|
| **C-1** | `C3` | Packaged migration rewrites the live DB in one non-atomic `writeFileSync` with no prior copy — a crash mid-write is total loss, and F-9 means no restore | `sqlite-bootstrap.ts:117-121` |
| **C-2** | `C4` | ~~Installer offers to delete the production DB on upgrade~~ — **overstated, corrected 2026-08-15.** The prompt tests `$APPDATA\${PRODUCT_NAME}\data\master.sqlite` = `%APPDATA%\Chayxana Master\…`, but `userData` derives from package.json `name`, so the DB is actually at `%APPDATA%\@chayxana\master\…`. The path never matches, so the prompt **cannot fire**. Still worth deleting as dead code that advises a backup the product cannot take (`F-9`), but it is not a live hazard | `installer.nsh:20-41` · `app-identity.ts` |
| **C-3** | `H5, F7` | Port 4000 in use → `listen` promise has no error path, so `createWindow()` is unreachable and no dialog fires. The one machine the chayxana depends on shows nothing | `index.ts:124-131,261` |
| **C-4** | `D2` | No daily cashing-up: counted cash cannot be entered anywhere, so a till difference of any size is undetectable | `schema.prisma:151-818` · `finance.routes.ts:11-12` |
| **C-5** | `B1, D5` | Scheduler hard-deletes stale DRAFTs every 6h, cascading order lines **and** the FIFO consumption ledger, without restoring stock or writing an audit row. Inventory vanishes with no COGS and no forensic trail | `scheduler.ts:7-22` · `schema.prisma:376,674` |
| **C-6** | `D5` | Walkout COGS is never recognised — every COGS query filters `status: CLOSED`. Food cooked, served, eaten, and free on both sides of the P&L | `reports.service.ts:1147-1151,470-476` |
| **C-7** | `B3, B6, F7` | Once CLOSED there is **no** correction mechanism — no refund, void-sale, reopen, or payment-method fix. Wrong tender is permanently wrong short of editing the DB by hand | `orders.routes.ts:10-24` |
| **C-8** | `H4` | All menu/availability pushes emit to room `'all'`, which nobody joins; `ingredient:stockChanged` goes only to `admin`. No polling fallback, no staleness cue — waiters keep selling unavailable dishes. **Fix is one line** | `socket.ts:51-52` · `menu.service.ts:188-475` |
| **C-9** | `H3` | The bill prints *inside* the open transaction, so a later failure leaves paper in the customer's hand with no financial record — and the retry prints a second one | `order.service.ts:726,772` · `print.service.ts:67-70` |
| **C-10** | `H5, B1` | Confirm-time print failures leave no trace: the `PrintJob` row is written with the confirm's `tx` and rolls back with it. `listFailedSinceDate` has zero callers | `print.service.ts:94,137-151` · `printJob.repo.ts:52-63` |
| **C-11** | `I6` | No way to adjust inventory outside sales — stocktake and waste throw, no routes mounted, `setCurrentStock` has zero call sites. When stock drifts the only remedies are a fake purchase or fake sale, both of which corrupt the finance ledger. **The UI advertises the missing feature twice**: IngredientsPage asks the admin to configure a "Farq chegarasi (%)" for stocktakes, and a purchase error tells them "Sanoq orqali tuzating" — a screen that does not exist | `stocktake.service.ts:14-36` · `waste.service.ts:19-23` · `ingredient.repo.ts:102` · `IngredientsPage.tsx:315-319` · `purchase.service.ts:285` |
| **C-18** | `F7` | Recipe "Faollashtirish / To'xtatish" governs nothing — `planConsumption` keys only on `recipe.ingredients.length > 0` and never reads `isComplete`. A recipe saved with placeholder quantities peels real stock at the very next sale; "To'xtatish" gives false confidence it stopped. The activation gate itself is good logic guarding nothing | `consumption.service.ts:40-48` · `RecipesPage.tsx:262,408` · `recipe.service.ts:174-189` |
| **C-12** | `H2, H5` | One failed boot health-check wipes the saved server URL **and** the session; `cachedUrl = null` then disables the mDNS fallback for the process, forcing manual IP entry mid-service | `App.tsx:83-93` · `env.ts:16-18,28-37` |
| **C-13** | `C4` | No documented recovery procedure for loss of the master machine | `docs/` — none exists |
| **C-14** | `I5` | 5 wrong PINs from anyone on the LAN lock out **the entire floor staff** for 5 minutes, repeatably: `findActiveByPin` ignores its argument, `ensureNotLocked` throws inside the candidate loop, and the lock targets an arbitrary `waiters[0]` | `user.repo.ts:19-29` · `auth.service.ts:105-120` |
| **C-15** | `B2` | A line-cancel on a SENT order restores stock as though the food was never made — the inventory half of §1 | `order.service.ts:477` |
| **C-16** | `H3` | No idempotency key anywhere; after a timeout the confirm modal re-enables submit and reports raw English, so the admin cannot tell whether the money landed | `grep idempoten` → 0 hits · `ConfirmModal.tsx:156-159,596` |
| **C-17** | `A8` | No shift/smena concept — no open/close, no float, no point at which a day's takings become immutable | `schema.prisma` (30 models, none) |

---

## 4. MAJOR (82) — by area

### Money & audit trail
| ID | Std | What |
|---|---|---|
| M-1 | `F6` | Discount caps enforce nothing — the only path reading them is unreachable from any UI; **the whole Chegirmalar page is dead weight**, and any admin can comp 100% of food (`billing.service.ts:82-115`, no `discountId` call site in renderer) |
| M-2 | `B2` | `DISCOUNT_APPLIED` and `SERVICE_CHARGE_WAIVED` are in the enum, labelled in the UI, offered in the filter — and **never written**. "Show me every discount" returns empty forever (`audit-labels.ts:12,21,74`) |
| M-3 | `B2` | Walkout audit records `amount: '0'` structurally — `applyTotals` is only ever called in confirm (`order.service.ts:804`) |
| M-4 | `B7` | Menu/price changes discard the actor (`_actorUserId`) and write no audit row; no enum value for a price change exists (`menu.service.ts:421,430`) |
| M-5 | `I2` | `settingsService.set` stores raw values in audit metadata, so the Telegram bot token reaches ADMIN via `/api/audit` — defeating the only secret-hiding control (`settings.service.ts:84-90`) |
| M-6 | `I2` | `/api/finance/daily` returns `pnl.profit` + per-dish cogs/profit to ADMIN; `FinancePage` has **no role check at all** (`finance.service.ts:34,306` · `FinancePage.tsx:294`) |
| M-7 | `B5` | Audit search filters only the 25 rows on screen — client-side `.filter`, not a server query (`AuditPage.tsx:107-120`) |
| M-8 | `B8` | AuditLog has no sequence, hash chain or signature; rows deleted outside the app are undetectable (`schema.prisma:797-811`) |
| M-9 | `B4` | Deleting a recipe cascades away its `RecipeEdit` history — the record of what past COGS was based on (`recipe.service.ts:232-250`) |
| M-10 | `B7` | `userService.update` audits only reactivation, mislabelled `USER_CREATED`; PIN resets are unaudited, so an admin can act as any waiter (`user.service.ts:88-111`) |
| M-11 | `I5` | `POST /api/auth/login` has no IP rate limit; the limiter returns 409 not 429 and never evicts (`auth.routes.ts:8` · `rateLimit.ts:18`) |
| M-12 | `B2, I3` | Discounts capture no reason and are not a discrete event (`ConfirmModal.tsx:371-390`) |
| M-13 | `F4` | Double-settlement guard is a disabled button the modal lets you dismiss out from under; `setClosed` has no CAS (`Modal.tsx:23,50,66` · `order.repo.ts:223`) |

### Reporting & reconciliation
| ID | Std | What |
|---|---|---|
| M-14 | `D3` | Two cards labelled "Jami chiqim" on one page show different numbers (`net` vs `cashOut`), and the category rows beneath don't sum to the total above them (`ExpensesSection.tsx:63,73-75` vs `GrandSummarySection.tsx:44`) |
| M-15 | `D3` | Monthly report mixes `expensesNet` with `cashOut`-derived drawer figures, so "kelgan − ketgan ≠ kassa o'zgarishi" (`MonthlyTable.tsx:91` · `telegram-bot.service.ts:860-871`) |
| M-16 | `D3` | `summary()` offsets any in-range reversal while daily/monthly offset only same-day, so Umumiy and Oylik disagree for the same month (`reports.service.ts:976-977` vs `:630-641`) |
| M-17 | `D1` | Monthly "Foyda" cannot be derived from any visible column — COGS is never shown (`MonthlyTable.tsx:33-121` · `reports.service.ts:711`) |
| M-18 | `J6` | Positive money renders as unseparated digits (`12450000`) on the owner's headline card while negatives render formatted — broken `isMoney` heuristic (`GrandSummarySection.tsx:139`) |
| M-19 | `D4` | Every cancelled order is attributed to the literal string `'system'`; `Order` has no `canceledById` even though AuditLog captures it (`reports.service.ts:408-415`) |
| M-20 | `D4` | The range/Umumiy report — used for a month, quarter or tax period — omits walkouts and cancellations entirely (`reports.service.ts:824-1093`) |
| M-21 | `D3` | Xarajatlar headline tile binds `net` where FinancePage and the owner report use `cashOut` — three surfaces, two answers, on the figure that caused a prior production incident (`ExpensesPage.tsx:317-322`) |
| M-22 | `G3` | `--warning` measures **1.98:1** and `--success` 3.30:1 on white, and both are used as the text colour for money throughout reporting (`styles.css:35-40`) |
| M-23 | `G6` | 33 sub-12px sizes across reporting, incl. 8–9px column headers on the **salary matrix used to pay staff** (`SalariesPage.tsx:227,232`) |
| M-24 | `J6` | Six independent money formatters live; one renders a genuine 0 so'm as an em-dash on a payroll table (`SalariesPage.tsx:20-24`) |
| M-25 | `C5` | Only structured export is an aggregate XLSX reachable **only** through the owner's Telegram; no transaction-level export, nothing in the admin UI (`telegram-bot.service.ts:414-542`) |
| M-26 | `C1` | No retention policy defined or enforced; the only automated lifecycle rule is a hard delete |

### Waiter clients
| ID | Std | What |
|---|---|---|
| M-27 | `F5` | Both clients render raw English server messages to the operator; the Uzbek fallback is dead code because `err.message` is always truthy |
| M-28 | `F5` | Every non-LOCKED login failure — including network failure — reports "Noto'g'ri PIN", so a down master looks like a wrong PIN at shift start |
| M-29 | `H2` | Mobile menu rows stay enabled offline and fail after the tap; the desktop client greys them correctly — the same product disagrees with itself |
| M-30 | `H1` | `ConnectionPill` renders on HomeScreen only; `OrderEditScreen`, where a waiter spends the shift, shows no connection state |
| M-31 | `F3` | Three of four line-removal paths delete with no confirmation; the fourth confirms |
| M-32 | `E6` | After the first add, the mobile row's add control becomes a −/qty pill in the same band — tapping twice quickly adds then removes |
| M-33 | `G3` | Occupied-table label is **1.42:1** (slate-300 on slate-50) — the waiter cannot read which table is taken |
| M-34 | `G5` | Desktop floor map and menu grid are click-only `<div>`s — neither creating an order nor adding an item is keyboard-reachable, in the app CLAUDE.md calls the keyboard equivalent |
| M-35 | `E2` | Neither client has menu search; mobile costs 3 taps for anything outside the first category |
| M-36 | `J5` | Desktop `OrderLine` DTO omits `menuItemKind`, so a waiter can delete the service-charge line — mobile forbids it, the server doesn't |
| M-37 | `H2` | Send is optimistically flipped to SENT over a `fetch` with no timeout; a hang leaves the order unsent, unsendable, and showing no error |
| M-38 | `E6` | `max-h-[calc(100vh-8rem)]` ignores the 40px connection banner, so the action bar drops below the fold exactly when the connection degrades |
| M-39 | `G2` | Neither shared Button primitive sets a min height; live instances land at 26–36px |
| M-40 | `G1` | Mobile note/cancel row actions are ~16px with no hitSlop, 16px apart — one is destructive and unconfirmed |
| M-41 | `F3` | Desktop cancels a DRAFT on one unconfirmed tap; mobile confirms the same action |

### Cross-cutting UI
| ID | Std | What |
|---|---|---|
| M-42 | `J1` | Blue is an established second accent — **115 uses / 7 files** — including the submit button on Login, Settings and the payment modal, in an amber-only app |
| M-43 | `J1, G5` | 39 of those are `ring-blue-500` focus rings, so focus is blue on 6 files and amber elsewhere |
| M-44 | `G6` | **96 text elements below the 12px floor** (62×10px, 30×11px, 3×9px, 1×8px) across 25 files; 61 pair sub-12px with a muted colour |
| M-45 | `G3` | `text-slate-400` (**2.56:1**) used 56× and `text-slate-300` (**1.48:1**) 4× as body text; the equivalent token passes at 4.83:1 — the failure is the bypass, not the system |
| M-46 | `G3, G6` | ConfirmModal's dark header renders the table/waiter labels at 10px, 3.75:1 |
| M-47 | `G1` | 19 controls below 24×24px, incl. nine 12px clear-search ✕ and a 22px MenuPage cluster where reorder/edit/**deactivate** sit 4px apart |
| M-48 | `G5` | Nine search inputs set `outline-none` with no replacement — focus is invisible on the first control of every list page |
| M-49 | `G5` | `DataTable` rows have `onClick` with no `tabIndex`/key handler, and §8.2 deliberately removed the per-row View button — so six pages have no keyboard route to a record |
| M-50 | `G4` | The global focus ring measures **2.32:1** at 1px — present but practically invisible |
| M-51 | `J2` | Login, Settings and Users adopt **zero** primitives; they hold 40 of the 115 blues and 19 of the 56 failing slate-400s |
| M-52 | `J2` | 59 raw `<button>` vs 83 `<Button>` — a 42% bypass rate, and the root cause feeding M-42/43/47/50 |
| M-53 | `J5, G1` | All four MenuPage category actions, incl. destructive deactivate, are `opacity-0` until **hover** — on a touch POS they are undiscoverable |
| M-54 | `J5, J2` | Two ConfirmDialogs exist and the wrong one won: the spec-compliant `feedback/` version has **zero** importers; all 7 consumers use a hand-rolled portal with different labels and no loading state |
| M-55 | `G5, J5` | That dialog registers a **document-level** Enter handler firing `onConfirm` regardless of focus — Enter on "Yo'q" deletes. Its backdrop is `onCancel ?? onConfirm`, so clicking outside a single-button dialog **executes** the action |

### Resilience
| ID | Std | What |
|---|---|---|
| M-56 | `H1` | Connection status is socket-only and `/api/health` never touches the DB, so a write-locked master shows green "Onlayn" in all three clients while every action hangs — no client sets a request timeout |
| M-57 | `H4` | Socket reconnect resynchronises nothing; missed events are lost and screens without a poll stay stale until remount. `onlineManager`/NetInfo is never wired |
| M-58 | `H2` | Mobile offline gating on NewOrderScreen is cosmetic — `opacity: 0.5` only; `Card` has no `disabled` prop so the button fires |
| M-59 | `H2` | Cancel-order and table-transfer fire offline on the same mobile screen whose qty buttons correctly refuse |
| M-60 | `H5` | No test print — the printer can only be verified by attempting a real settlement |
| M-61 | `H1, H4` | Two waiters can open the same table with no error; `findFirst … createdAt desc` then hides the earlier ticket from the grid entirely |
| M-62 | `D6` | Four call sites do day arithmetic in host time instead of Tashkent, incl. the expense-reverse button and every PDF timestamp |
| M-63 | `D1` | The daily Telegram report has no catch-up — a machine off at the configured minute silently skips that day forever |

### Inventory & menu admin
| ID | Std | What |
|---|---|---|
| M-64 | `D5` | UNTRACKED dishes consume real inventory but book **zero COGS**, and the mode picker never says so — it's also the only mode requiring no extra fields, so it's the path of least resistance (`menu.service.ts:212-214` · `MenuPage.tsx:957-960`) |
| M-65 | `F7` | Create-mode is unchangeable, there is no DELETE route for menu items, and → SIMPLE is impossible because no UI can create a self-ingredient. Only fix is deactivate-and-recreate; no unique name constraint, so both rows coexist (`MenuPage.tsx:491-493` · `menu.routes.ts`) |
| M-66 | `D6` | Purchase date defaults to **UTC**, 5h behind Tashkent — any purchase saved 00:00–05:00 lands on the previous day, restating a closed day and expiring its own same-day reverse window instantly (`PurchasesPage.tsx:57-59` vs the correct offset math at `:61-65`) |
| M-67 | `D3` | Editing a purchase date moves the Purchase but **not** its linked Expense, so Xaridlar and Chiqimlar permanently disagree about which day the money left; the field accepts any past/future date (`purchase.service.ts:213-218`) |
| M-68 | `F2` | Client accepts decimal prices and a 100%/1 000 000 discount fallback where the server requires integers and falls back to 15%/100 000 — rejected as a 500 with no visible error (`MenuPage.tsx:43,787-793` · `DiscountsPage.tsx:353-354,412`) |
| M-69 | `F5` | **Eleven admin mutations have no `onError` and no error UI** — a failed save is completely invisible and the dialog just sits open. IngredientsPage and PurchasesPage do this correctly; MenuPage, TablesPage and DiscountsPage do not (`MenuPage.tsx:115-154,994-1006`) |
| M-70 | `G1, G5` | Row-open is mouse-only across the area (no keyboard path to edit a purchase or recipe at all); clear-search is **14×14px** on six pages; the four category actions are **22×22px**, 4px apart, one of which is deactivate (`DataTable.tsx:104-110` · `MenuPage.tsx:280-300`) |
| M-71 | `G6, G3` | 13 × 10px and 8 × 11px text; `text-slate-400` (2.56:1) carries descriptions and empty states; the **1.48:1** "—" is the sole indicator a dish is untracked, explained only in a `title` tooltip (`MenuPage.tsx:342,349`) |
| M-72 | `J1, J2` | MenuPage and UsersPage are a different product: 36 blue classes, raw `<table>`, 11 raw blue `<button>`s, a `purple` OWNER badge from no palette. MenuPage *imports* `EmptyState` and never uses it, and `Button` twice out of eleven. UsersPage never calls `usePageTitle`, so the header goes stale (`MenuPage.tsx:325-404` · `UsersPage.tsx:225-309`) |
| M-73 | `E4` | **No low-stock view anywhere in the admin UI** — no threshold, highlight, sort or filter on any stock number. `DataTable` implements no sorting at all. The Telegram bot has a proper sorted low-stock report; no screen does (`IngredientsPage.tsx:174-179` · `telegram-bot.service.ts:970-990`) |
| M-74 | `F3` | `conversionFactor` and `recipeUnit` stay editable after batches exist, with no confirm and no guard — changing kg→g to 1 makes every later purchase add 1/1000th of the stock it should, against recipe quantities still in grams. `countUsages` already exists and already backs this kind of gate elsewhere (`ingredient.service.ts:158-161`) |

*(Plus further MAJORs folded into the areas above; full per-agent detail retained in the session transcript.)*

---

## 5. MINOR (34) — summary

Receipt line items print unformatted while totals are formatted · reprint is byte-identical to the
original (no NUSXA marking) · walkout reprint prints a full item list under a zero total · TASDIQLASH
moves below the fold when the debt panel opens · payment-method select is 34px · zero-total orders
cannot be closed · 15s execFile timeout can kill a print that already succeeded · ConfirmModal uses a
different money formatter from the rest of the app · mobile modal scrim is fully opaque and doesn't
avoid the keyboard · Turkish dotted `İ` in a settings label · `lastSuccessfulContact` records boot
time, not contact · `PURCHASE_DELETED` has no UI label · walkout "Kim belgiladi" is blank in the PDF ·
two PDF "JAMI" footers computed on different bases · Sidebar is 240/72px against a 200/60px spec ·
neutral ramp is slate where the palette specifies zinc (0 uses) · three English strings and six
ALL-CAPS labels · draft creation and send write no audit rows · purchase reverse/delete sheets stack
on top of the still-open edit sheet · **category reorder arrows are a no-op** (every UI-created
category has `displayOrder: 0`, so the swap writes 0 over 0) · reactivation confirms use the red
`danger` variant identical to deactivation, training the admin to click through · combos have no
price and the builder shows no money at all · `DataTable` has no sort/filter so six pages hand-roll
the same search box.

---

## 6. What is correct

Worth recording — a clean result is an audit result.

- **Expense and purchase corrections are exemplary** and are the template the order-line paths should
  copy: original preserved, reversal appended, mandatory reason, movement row, audit row, one
  transaction (`expense.service.ts:427-455`, `purchase.service.ts:293-360`).
- **Deferred socket emits are genuinely right** — a rolled-back transaction never emits and never
  fires a Telegram alert (`lib/socket-events.ts:32-56`).
- **`lib/time.ts` is exemplary** and every backend service routes through it; the DST-free assumption
  is documented in the header.
- **The cashOut / expenseNet distinction is correct at the source.** Every D3 finding is a *consumer*
  binding the wrong field — one-line rebindings, not math changes.
- **Auth fundamentals are sound**: bcrypt, 32-byte random tokens, single-device sessions, PIN
  blacklist, per-account lockout. Server-side `requireRole` on every route; socket rooms derived from
  the session, never from the client.
- **AuditLog is append-only at the application layer** — no update or delete path exists anywhere.
- **The design system itself is correct** — tokens match the house spec exactly; `DataTable`,
  `MoneyCell`, `EmptyState`, `PageHeader`, `Sidebar` are faithful implementations.
- **Colour is never the sole carrier of meaning** (`G7` clean across the whole renderer).
- **The order desktop app's offline discipline** is the model the other two should copy.
- **PIN login ergonomics** — 76px/h-16 pads, auto-submit, live lockout countdown in Uzbek.
- **FIFO costing is well built**: atomic conditional peels, LIFO unwind at frozen prices, honest
  history. Print-queue mutex and migration checksum self-heal are both correct and well-reasoned.

---

## 7. Coverage gaps

- **Not attempted:** live/runtime testing, load behaviour at 500 orders/day, printer hardware
  behaviour, penetration testing, and legal confirmation of whether a certified fiscal device is in
  use at the counter (not knowable from the repo — see F-2).
- **Every finding is static analysis.** Reachability was verified by reading code paths, not by
  executing them. There is no test runner in this repo.

---

## 8. Remediation status — READ THIS FIRST IF YOU ARE A NEW SESSION

**Superseded, not fixed:** `F-11`, `C-18`, `C-11`, `C-15` (inventory half), `M-64`–`M-74` died with
the ingredient/recipe/FIFO model — the count-based inventory redesign deleted the code and pages
they cite. See `docs/superpowers/specs/2026-08-13-count-based-inventory-design.md` §10 and
`docs/CURRENT_WORKFLOW.md` §4.

**A fix pass is in progress.** Work through §9 in order. Update this table as each lands.

| # | ID | Fix | Status |
|---|---|---|---|
| 1 | `F-5` | `audit.repo.ts` — `include: { user: true }` → `select` of id/fullName/role | ✅ **DONE** (committed `13e44dd`) |
| 2 | `F-4` | `userService.update` — reject role changes by non-OWNER; audit the change | ⬜ next |
| 3 | `F-7` | `orders.controller.ts:52` — add `.nonnegative()` to payment amount | ⬜ |
| 4 | `F-6` | `order.service.ts:673` — sum **all** DEBT legs; reject >1 | ⬜ |
| 5 | `C-8` | `socket.ts:51-52` — `socket.join('all')` for every authed socket | ✅ **DONE** — shipped on `feat/count-based-inventory` (`socket.ts` — every authenticated socket joins `all`) |
| 6 | `C-3` | `index.ts:124` — add `httpServer.once('error', reject)` | ✅ **DONE** 2026-08-15 — rejects the startup promise, which `whenReady`'s catch turns into `dialog.showErrorBox`; `EADDRINUSE` gets a named Uzbek message. Prompted by side-by-side installs, which make port clashes routine |

**Working protocol the user asked for:** explain each finding in plain language (what's wrong, why it
costs the business money, why the fix is safe), invite questions, *then* implement — one finding at a
time, not in a batch. Show the diff and typecheck after each.

**Verification available:** `pnpm --filter @chayxana/master typecheck`. There is no test runner in
this repo — see §7.

**Noticed during fix 1, not yet chased:** this pnpm version warns that `pnpm.overrides` in the root
`package.json` is no longer read. That field pins React to 19.1.0 workspace-wide. It still holds
today (installed React is 19.1.0), but on a fresh install `apps/order`'s declared `^18.3.0` could
win. Worth verifying separately.

---

## 9. Suggested remediation sequence

**Stop the bleeding (hours, not days).** All small, all high-consequence:
1. F-5 — add `select` to `audit.repo.ts:42` (one line)
2. F-4 — reject role changes by non-owners in `userService.update`
3. F-7 — add `.nonnegative()` to the payment amount schema
4. F-6 — sum all DEBT legs; reject >1
5. C-8 — `socket.join('all')` (one line, revives seven dead emits)
6. C-3 — add `httpServer.once('error', reject)`

**Prevent catastrophe (days).**
7. F-9 + C-1 + C-2 — daily `VACUUM INTO` backup, atomic temp-file+rename migration write, installer
   takes a copy before any wipe. *This is the highest-expected-value work in the list.*
8. C-5 — stop hard-deleting drafts; cancel + restore + audit instead

**Fix the costing lies (days).** All three silently overstate profit:
9. F-11 — remove kg/l from the SIMPLE unit dropdown (one dropdown; weight-sold items belong in
   COMPOSITE, which is already correct)
10. C-18 — gate consumption on `recipe.isComplete`, and block the sale rather than shipping food at
    zero cost when a recipe is incomplete
11. M-64 — state the UNTRACKED P&L consequence in the picker, or wire `MenuItem.unitCostSnapshot`

**Close the fraud gap (§1) — weeks.**
12. F-8 — audit line voids and quantity changes with actor and reason; add `canceledById`
13. C-4 — add a cash count with a blocking variance reason
14. C-11 — minimal manual stock-adjustment endpoint
15. M-1 — apply discount caps to the ad-hoc path

**Then:** F-10/C-9 (print outside the transaction), C-7 (settlement correction), the fiscal question
(F-1/F-2/F-3 — a business decision before a technical one), and the UI system work, where
`UISYS-10 → 11 → 3` is the highest-leverage order.
