# Customer feedback hotfix — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the nine defects a live chayxana operator reported on 2026-08-16, and ship them as v0.1.4 to the Windows machine they are running today.

**Architecture:** Everything lands on `fix/customer-feedback`, cut from **`feat/remove-walkout`** — the branch the customer's build came from. `feat/web-platform` is NOT the target: it has moved this code into `packages/` and deliberately broken `apps/master`, so nothing there can reach the customer. The same fixes get re-applied onto the web branch afterwards, which is cheap because the files moved wholesale and the diffs are small.

**Tech Stack:** TypeScript strict, Electron 31, React 19 + Vite + Tailwind, Express, Prisma + SQLite, Vitest (added by Task 2).

## Global Constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- 2-space indent, single quotes, semicolons, trailing commas. `kebab-case.ts`, `PascalCase.tsx`.
- Master backend (`src/main`) is **CommonJS**; the renderer is ES modules.
- All user-facing text is **Uzbek**. No i18n library. Do not translate existing strings.
- **No AI fingerprints** in commit messages — no self-attribution, no co-authorship trailers, no emoji.
- Never force-push, never rewrite history, never `git clean`.
- Renderer follows **Blocks C1** (`docs/design/BLOCKS_C1.md`): no borders, no radius, no shadows, no accent bars. Separation is a 2px seam; state is the fill. Type floors 12px labels / 13px text / 17px money. Touch targets stay 48/56/66px.
- **The hardware floor changed.** `BLOCKS_C1.md`, `RENDERER_REBUILD.md` and `CLAUDE.md` all say "no mouse, no hover, no keyboard". Site photographs disprove it: every machine has a full physical keyboard and a mouse. Touch remains primary and targets do not shrink, but a keyboard must now work. Task 10 corrects the documents.
- **Do not change any finance formula.** `docs/PRD_FOUNDATION.md` §8 and `docs/CURRENT_WORKFLOW.md` §5 list constraints that must survive: service charge stays out of revenue, `cashOut` is not `expenseNet`, P&L and cash flow stay separate registers.

## The viewport is unknown, and the plan does not guess

Two investigators reconstructed the customer's screen and disagreed:

- One argued **1366×768 at 100% scale** → a 1264×741 CSS viewport, of which ~677px is on the display because the 800px-tall window overhangs the taskbar.
- The other reproduced the customer's screenshot **pixel-exactly at 1092 CSS px**, which is 1366×768 at **125% Windows scaling**, and showed the dish-name column is exactly 0px at ≤1146px.

Both reconstructions are consistent with the photographs, and the owner has said not to assume anything about the machines. **So every layout fix in this plan must hold from 1024 CSS px upward**, and no task may introduce a new fixed-width assumption. Where a task needs a number, it targets **1024**.

Verify layout work at 1024, 1092, 1264 and 1366 CSS px — all four. `pnpm gallery:page` renders at a fixed 1366 frame and is therefore **not** sufficient on its own; resize the browser.

## Verification

There is no test runner on this branch. Task 2 adds **Vitest** and the first tests, covering the payment arithmetic — the highest-risk money logic in the plan. Every other task ends with concrete manual verification steps and the exact commands.

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"   # floor is 49, all pre-existing in src/main
pnpm run typecheck:renderer              # must be clean, always
pnpm run typecheck:gallery               # must be clean, always
pnpm gallery:page                        # browser preview
```

The renderer gates must stay at **zero**. `tsc -b` must stay at **49 or fewer** — never higher.

## File structure

**Created**
- `apps/master/src/renderer/lib/payment-legs.ts` — pure balancing-leg arithmetic (Task 2)
- `apps/master/src/renderer/lib/payment-legs.test.ts` — its tests (Task 2)
- `apps/master/src/renderer/components/blocks/AmountField.tsx` — numeric input + optional keypad (Task 4)
- `apps/master/src/renderer/api/server-info.ts` — typed client for `/api/health/server-info` (Task 8)
- `apps/master/vitest.config.ts` (Task 2)

**Modified**
- `apps/master/src/main/index.ts` — window geometry, menu removal (Task 1)
- `apps/master/src/renderer/components/approval/OrderTicket.tsx` — Tasks 2, 3, 4
- `apps/master/src/renderer/components/blocks/Keypad.tsx` — `000` key (Task 4)
- `apps/master/src/renderer/components/menu/ItemList.tsx` — column budget (Task 5)
- `apps/master/src/renderer/pages/OmborPage.tsx`, `components/stock/StockList.tsx` — Task 6
- `apps/master/src/main/server/repositories/menu.repo.ts`, `services/stock.service.ts` — Task 6
- `apps/master/src/main/server/middleware/errorHandler.ts` — Task 7
- `apps/master/src/renderer/components/layout/NavRail.tsx` — Tasks 8, 9
- `apps/master/src/main/server/repositories/order.repo.ts` — `menuItem.kind` in `LIST_INCLUDE` (Task 3)
- `apps/master/src/main/server/services/order.service.ts` — `itemCount` in `mapToDto` (Task 3)
- `apps/master/package.json` — version, test script (Tasks 2, 10)
- `CLAUDE.md`, `docs/design/BLOCKS_C1.md`, `docs/design/RENDERER_REBUILD.md` — Task 10

**Explicitly out of scope** — real, tracked, but not in this release:

- **Inline line editing on the confirm ticket** (add / subtract / cancel a dish). This was the
  operator's *first* complaint, so leaving it out is a deliberate call that the owner should
  confirm. The reasoning: the server is already complete — `PATCH .../lines/:lineId/quantity`,
  `POST .../lines/:lineId/cancel` and `POST .../items` all accept SENT orders and all restore stock
  correctly — and the identical UI already exists on **Buyurtmalar** (`OrderPanel.tsx:174-218`), so
  today's workaround is real: edit the order there, then confirm it on Tasdiqlash. It is the largest
  single piece of UI work in the backlog, it depends on Task 2 landing first, and shipping it in the
  same release as nine other changes would make the release unreviewable.
- Debt repayment reversal, standalone debtors, `.positive()` on payment amounts — all need schema or
  server changes and belong in their own release. The repayment one matters: a mistyped repayment
  currently cannot be corrected at all and permanently falsifies every past-day drawer figure.
- The `xl:` breakpoints in `ReportsPage.tsx` that can never fire at this viewport — and which get
  *worse*, not better, once Task 1 maximises the window.

---

### Task 1: Make the window fit the screen and drop the menu bar

The single highest-value change in the plan. The window is created at 1280×800; the customer's work area is at most 1366×728. The bottom **28–64px of the page is not on the monitor**, and what lives there is the `Panel` foot — TASDIQLASH, SAQLA, KIRIMNI SAQLA. The operator has been confirming orders they cannot fully see.

The default Electron menu is also live: **`Ctrl+W` closes the admin window, which is the API server every waiter device talks to.** `Ctrl+R` reloads mid-tender, `Ctrl+Shift+I` opens devtools. Harmless under the old "no keyboard" assumption; not harmless now.

**Files:**
- Modify: `apps/master/src/main/index.ts:190-192`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a maximised window with no application menu. Every later layout task is measured inside it.

- [ ] **Step 1: Remove the application menu at startup**

In `apps/master/src/main/index.ts`, add `Menu` to the existing `electron` import, then call it before the first window is created — put it immediately above `logger.info('createWindow begin');` at line 189:

```ts
  // The default Electron menu ships live accelerators: Ctrl+W closes this
  // window — which is also the API server every waiter device talks to —
  // plus Ctrl+R mid-tender and Ctrl+Shift+I devtools. Every till has a
  // physical keyboard, so these are reachable by accident. It also costs
  // ~20px of height on a screen that has none to spare.
  Menu.setApplicationMenu(null);
```

- [ ] **Step 2: Size the window to the work area and maximise it**

Replace lines 191-192:

```ts
    width: 1280,
    height: 800,
```

with:

```ts
    // Sized to the smallest panel this ships to, then maximised below. The
    // previous 1280x800 overhung the work area by up to 64px, putting the
    // Panel foot — TASDIQLASH and every other primary action — off the
    // bottom of the monitor.
    width: 1024,
    height: 700,
    minWidth: 1024,
    minHeight: 640,
    show: false,
```

- [ ] **Step 3: Maximise before showing**

Find the existing `mainWindow.once('ready-to-show', ...)` handler. If there is one, add `mainWindow.maximize();` as its first statement. If there is none, add this immediately after the `new BrowserWindow({...})` call completes:

```ts
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });
```

`show: false` plus `ready-to-show` avoids the window appearing at 1024×700 and then jumping — the operator sees one correctly-sized window, not a resize.

- [ ] **Step 4: Typecheck**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
```
Expected: **49 or fewer**. If `Menu` is reported as unused, you added the import but not the call — fix the call, not the import.

- [ ] **Step 5: Verify on Windows**

This task cannot be verified on the Mac — Electron does not run here. On the Windows machine, or on the customer's, confirm: the window fills the screen, there is no File/Edit/View menu bar, `Ctrl+W` does nothing, and the TASDIQLASH button on Tasdiqlash is fully visible with the taskbar showing.

If Windows is not available before release, ship it anyway and say so in the release notes — the change is two lines and strictly reduces the window's footprint.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(window): fill the screen and drop the default menu

The window was created at 1280x800. On the customer's panel the work area is
at most 1366x728, so the bottom 28-64px of the page was never on the monitor —
and what lives there is the Panel foot, which is where TASDIQLASH, SAQLA and
KIRIMNI SAQLA all sit. Operators have been confirming orders whose confirm
button was below the edge of the glass.

It now opens at the smallest panel we ship to and maximises before showing, so
there is no visible resize.

Menu.setApplicationMenu(null) goes with it. The default menu ships live
accelerators and Ctrl+W closes this window — which is also the API server for
every waiter device. That was theoretical when the design assumed no keyboard.
Every machine on site has one."
```

---

### Task 2: The payment balancing leg

The operator's words: *"when other type is added automatically subtract the typed amount from total, it will be really handful."*

Today `legs` is seeded with one CASH leg holding the whole bill (`:114`), so `paid === due` on first render, and `addLeg`'s `Math.max(due - paid, 0)` (`:166`) is **always 0**. Adding Karta or Nasiya produces a 0 so'm leg while `balanced` is already true. An all-card sale takes about 18 taps. A mis-tapped `+ Nasiya` cannot be removed — there is no `removeLeg` in the file — and because `hasDebtLeg` (`:123`) ignores the amount, it then forces the operator to name a debtor before a pure cash sale will confirm.

The model: **one leg is the balancing leg and always holds `due − Σ(other legs)`.** Adding a method moves the whole outstanding into it. Editing any other leg makes the balancing leg absorb the difference.

**Files:**
- Create: `apps/master/vitest.config.ts`
- Create: `apps/master/src/renderer/lib/payment-legs.ts`
- Create: `apps/master/src/renderer/lib/payment-legs.test.ts`
- Modify: `apps/master/package.json` (test script, vitest devDependency)
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx:114,123,165-175,338-347`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Leg = { method: PaymentMethod; amount: number }`, and three pure functions from `@/lib/payment-legs`:
  - `addLeg(legs: Leg[], method: PaymentMethod, due: number, balancingIndex: number): Leg[]`
  - `setLegAmount(legs: Leg[], index: number, amount: number, due: number, balancingIndex: number): Leg[]`
  - `removeLeg(legs: Leg[], index: number, due: number, balancingIndex: number): Leg[]`
  Each returns a new array whose amounts sum to `due` whenever that is achievable without a negative leg.

- [ ] **Step 1: Add Vitest**

In `apps/master/package.json`, add to `scripts`:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

and to `devDependencies`:

```json
    "vitest": "^2.1.0",
```

Create `apps/master/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/renderer/**/*.test.ts'],
    passWithNoTests: false,
  },
});
```

Then install:

```bash
cd /Users/uzmacbook/dev/lab/project02
pnpm install
```

- [ ] **Step 2: Write the failing tests**

Create `apps/master/src/renderer/lib/payment-legs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addLeg, removeLeg, setLegAmount, type Leg } from './payment-legs';

const cash = (amount: number): Leg => ({ method: 'CASH', amount });

describe('payment legs', () => {
  it('moves the whole outstanding into a newly added method', () => {
    const next = addLeg([cash(106_000)], 'DEBT', 106_000, 0);
    expect(next).toEqual([
      { method: 'CASH', amount: 0 },
      { method: 'DEBT', amount: 106_000 },
    ]);
  });

  it('keeps the legs summing to due after adding', () => {
    const next = addLeg([cash(106_000)], 'CARD', 106_000, 0);
    expect(next.reduce((sum, leg) => sum + leg.amount, 0)).toBe(106_000);
  });

  it('makes the balancing leg absorb an edit to another leg', () => {
    const legs: Leg[] = [cash(106_000), { method: 'DEBT', amount: 0 }];
    const next = setLegAmount(legs, 1, 40_000, 106_000, 0);
    expect(next[0]?.amount).toBe(66_000);
    expect(next[1]?.amount).toBe(40_000);
  });

  it('clamps the balancing leg at zero rather than going negative', () => {
    const legs: Leg[] = [cash(106_000), { method: 'DEBT', amount: 0 }];
    const next = setLegAmount(legs, 1, 150_000, 106_000, 0);
    expect(next[0]?.amount).toBe(0);
    expect(next[1]?.amount).toBe(150_000);
  });

  it('editing the balancing leg itself leaves the others alone', () => {
    const legs: Leg[] = [cash(60_000), { method: 'CARD', amount: 46_000 }];
    const next = setLegAmount(legs, 0, 70_000, 106_000, 0);
    expect(next[0]?.amount).toBe(70_000);
    expect(next[1]?.amount).toBe(46_000);
  });

  it('returns the removed amount to the balancing leg', () => {
    const legs: Leg[] = [cash(66_000), { method: 'DEBT', amount: 40_000 }];
    const next = removeLeg(legs, 1, 106_000, 0);
    expect(next).toEqual([{ method: 'CASH', amount: 106_000 }]);
  });

  it('never removes the last leg', () => {
    const legs: Leg[] = [cash(106_000)];
    expect(removeLeg(legs, 0, 106_000, 0)).toEqual(legs);
  });

  it('rebalances when due changes, e.g. after a discount', () => {
    const legs: Leg[] = [cash(106_000)];
    const next = setLegAmount(legs, 0, 96_000, 96_000, 0);
    expect(next[0]?.amount).toBe(96_000);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

```bash
cd apps/master && pnpm exec vitest run
```
Expected: FAIL — `Cannot find module './payment-legs'`.

- [ ] **Step 4: Write the implementation**

Create `apps/master/src/renderer/lib/payment-legs.ts`:

```ts
import type { PaymentMethod } from '@/api/orders';

export type Leg = { method: PaymentMethod; amount: number };

/**
 * One leg is the balancing leg: it always holds whatever the other legs do
 * not cover. Adding a method moves the entire outstanding amount into the new
 * leg; editing any other leg makes the balancing leg absorb the difference.
 *
 * This is what the operator asked for — "when other type is added
 * automatically subtract the typed amount from total". The previous behaviour
 * seeded every added leg at 0 while the bill was already fully covered by
 * cash, which made an all-card sale roughly eighteen taps and left a
 * mis-tapped nasiya leg impossible to remove.
 */
function rebalance(legs: Leg[], due: number, balancingIndex: number): Leg[] {
  const others = legs.reduce(
    (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
    0,
  );
  return legs.map((leg, index) =>
    index === balancingIndex ? { ...leg, amount: Math.max(due - others, 0) } : leg,
  );
}

export function addLeg(
  legs: Leg[],
  method: PaymentMethod,
  due: number,
  balancingIndex: number,
): Leg[] {
  const others = legs.reduce(
    (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
    0,
  );
  const outstanding = Math.max(due - others, 0);
  const zeroed = legs.map((leg, index) =>
    index === balancingIndex ? { ...leg, amount: 0 } : leg,
  );
  return [...zeroed, { method, amount: outstanding }];
}

export function setLegAmount(
  legs: Leg[],
  index: number,
  amount: number,
  due: number,
  balancingIndex: number,
): Leg[] {
  const updated = legs.map((leg, i) => (i === index ? { ...leg, amount } : leg));
  if (index === balancingIndex) return updated;
  return rebalance(updated, due, balancingIndex);
}

export function removeLeg(
  legs: Leg[],
  index: number,
  due: number,
  balancingIndex: number,
): Leg[] {
  if (legs.length <= 1) return legs;
  const kept = legs.filter((_, i) => i !== index);
  const nextBalancing = index < balancingIndex ? balancingIndex - 1 : balancingIndex;
  return rebalance(kept, due, Math.min(nextBalancing, kept.length - 1));
}
```

- [ ] **Step 5: Run the tests**

```bash
cd apps/master && pnpm exec vitest run
```
Expected: **8 passed.**

- [ ] **Step 6: Wire it into OrderTicket**

In `apps/master/src/renderer/components/approval/OrderTicket.tsx`:

Add the import beside the existing ones:

```ts
import { addLeg as addLegTo, removeLeg as removeLegFrom, setLegAmount, type Leg } from '@/lib/payment-legs';
```

Delete the file's own local `Leg` type if it declares one, so there is a single definition.

Add the balancing index beside the other state (after line 114):

```ts
  // The seeded CASH leg is the balancing leg — it absorbs whatever the other
  // methods do not cover.
  const [balancingIndex] = useState(0);
```

Replace `addLeg` at lines 165-175 — keep the debtor-picker side effect exactly as it is:

```ts
  const addLeg = (method: PaymentMethod) => {
    setLegs((current) => addLegTo(current, method, due, balancingIndex));
    // Naming the debtor is the next thing that has to happen, and TASDIQLASH
    // stays disabled until it does — so go straight there rather than making
    // the operator discover a second row.
    if (method === 'DEBT' && debtorName.trim().length === 0) {
      setTypingNewDebtor(false);
      setEditing({ kind: 'debtor' });
    }
  };
```

Find the keypad's payment branch — the `setLegs((current) => current.map((leg, i) => ...applyKey...))` block around line 158 — and route it through the helper so the balancing leg follows:

```ts
      setLegs((current) => {
        const nextAmount = applyKey(current[index]?.amount ?? 0, key);
        return setLegAmount(current, index, nextAmount, due, balancingIndex);
      });
```

Change `hasDebtLeg` at line 123 so a zero leg cannot hold the ticket hostage:

```ts
  const hasDebtLeg = legs.some((leg) => leg.method === 'DEBT' && leg.amount > 0);
```

- [ ] **Step 7: Add a remove control to each leg row**

At the leg rows around lines 338-347, add a remove cell. **The `Row` is itself a `<button>` (`Row.tsx:49-56`), so the control must not be nested inside it** — render it as a sibling in the same grid, or convert that specific row to a non-interactive container. Use a 48px target and the `owed` tone:

```tsx
{legs.length > 1 ? (
  <button
    type="button"
    aria-label={`${METHOD_LABEL[leg.method]} qatorini o'chirish`}
    className="h-control w-control bg-field text-owed"
    onClick={() => setLegs((current) => removeLegFrom(current, index, due, balancingIndex))}
  >
    ×
  </button>
) : null}
```

- [ ] **Step 8: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
pnpm exec vitest run
```
Expected: both gates clean, 8 tests passing.

- [ ] **Step 9: Verify in the browser**

```bash
cd apps/master && pnpm gallery:page
```
Open `gallery-dist/blocks-c1-gallery.html`, go to **Tasdiqlash**, pick an order and check, at 1024 and 1366 px wide:
- `+ Karta` puts the **whole** bill on Karta and drops Naqd to 0
- typing 40,000 into Karta moves Naqd to the remainder automatically
- `TO'LANADI` always equals the bill and TASDIQLASH stays enabled throughout
- the `×` removes a leg and its amount returns to Naqd
- adding Nasiya then removing it again no longer demands a debtor

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "fix(confirm): one leg balances, so a second payment type just works

The legs were seeded with a single CASH leg holding the whole bill, so paid
already equalled due on first render and addLeg's max(due - paid, 0) was
always zero. Adding Karta or Nasiya produced an empty leg on an already
balanced ticket: an all-card sale took about eighteen taps, and a mis-tapped
nasiya could not be removed at all — there was no removeLeg — while
hasDebtLeg ignored the amount, so a zero leg still demanded a debtor before
anything could confirm.

One leg is now the balancing leg and always holds due minus the others.
Adding a method moves the whole outstanding into it; editing any other leg
makes the balancing leg absorb the difference. That is what the operator
asked for in their own words.

The arithmetic is a pure module with the repo's first tests — eight cases
covering add, edit, clamp-at-zero, remove and a due change from a discount."
```

---

### Task 3: Make the discount work

The operator's words: *"discount is not working."* It was reproduced exactly. They tap `Chegirma`, key `10000`, the row updates and `TO'LANADI` drops — and **TASDIQLASH goes dead** showing `Farq: -10,000`. `discount` and `legs` are independent state: `due` recomputes, `paid` does not, `balanced` goes false, and the button disables itself with no explanation.

Task 2 supplies the fix — the legs must rebase when `due` changes.

There is also a **clamp mismatch**. The ticket clamps the discount at `food = order.subtotalSnapshot ?? order.totalAmount` (`:112`), and on a SENT order every snapshot is null, so `food` is really food **plus service**. The server clamps at the FOOD subtotal only (`billing.service.ts:89`). On any order carrying a `XIZMAT` line — which is most of them — comping the bill makes the ticket show `TO'LANADI 0` while the server insists on the service charge, and the operator gets an English `PAYMENT_MISMATCH`.

**Files:**
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx:112,120,155`
- Modify: `apps/master/src/main/server/repositories/order.repo.ts` (`LIST_INCLUDE`)
- Modify: `apps/master/src/main/server/services/order.service.ts` (`mapToDto`)

**Interfaces:**
- Consumes: Task 2's `setLegAmount` and `balancingIndex`.
- Produces: `order.lines[].menuItemKind` is reliable on both the list and the detail payload, and `order.itemCount` is populated.

- [ ] **Step 1: Make `menuItemKind` reliable on every payload**

`LIST_INCLUDE` in `apps/master/src/main/server/repositories/order.repo.ts` omits `menuItem`, so `mapToDto` defaults every line's kind to `'FOOD'` on the list payload. Add the kind to the include's `lines` selection:

```ts
      menuItem: { select: { kind: true } },
```

Keep it a `select` of one column, not a full `include` — the review already flagged that waiters read `costPrice` off order payloads, and this must not widen that.

- [ ] **Step 2: Populate `itemCount` while you are in there**

`api/orders.ts:52` declares `itemCount`, no Prisma column exists, and `mapToDto` never computes it — which is why the ticket header renders `· pozitsiya` with a blank before it. In `mapToDto` in `apps/master/src/main/server/services/order.service.ts`, add to the returned object:

```ts
    itemCount: order.lines?.filter((line) => !line.isCanceled).length ?? 0,
```

- [ ] **Step 3: Derive the two bases from the lines**

In `OrderTicket.tsx`, replace line 112:

```ts
  const food = order.subtotalSnapshot ?? order.totalAmount;
```

with:

```ts
  // Derived from the lines, not from totalAmount: on a SENT order every
  // snapshot column is still null, so totalAmount silently includes the
  // service charge. The server clamps the discount at the FOOD subtotal
  // only (billing.service.ts), and the ticket has to agree or a fully
  // comped bill dead-ends in PAYMENT_MISMATCH.
  const activeLines = useMemo(
    () => (order.lines ?? []).filter((line) => !line.isCanceled),
    [order.lines],
  );
  const foodBase = useMemo(
    () =>
      activeLines
        .filter((line) => line.menuItemKind !== 'SERVICE')
        .reduce((sum, line) => sum + line.price * line.quantity, 0),
    [activeLines],
  );
  const serviceBase = useMemo(
    () =>
      activeLines
        .filter((line) => line.menuItemKind === 'SERVICE')
        .reduce((sum, line) => sum + line.price * line.quantity, 0),
    [activeLines],
  );
```

Replace `due` at line 120:

```ts
  const due = useMemo(
    () => Math.max(foodBase - discount, 0) + serviceBase,
    [foodBase, discount, serviceBase],
  );
```

Replace the discount clamp at line 155 — `food` no longer exists:

```ts
      setDiscount((value) => Math.min(applyKey(value, key), foodBase));
```

- [ ] **Step 4: Rebase the legs whenever `due` changes**

Add this effect after the `due` memo. Without it, a discount still strands the operator on a dead TASDIQLASH — this is the actual fix for the reported bug.

Note it does **not** call `setLegAmount`: that helper returns early when the index it is given is the balancing index, so it would do nothing here. The balancing leg is recomputed directly:

```ts
  // A discount changes `due` while the legs still hold the old amounts, which
  // is what made the operator conclude the discount "was not working": the
  // ticket went unbalanced and TASDIQLASH silently disabled itself.
  useEffect(() => {
    setLegs((current) => {
      const others = current.reduce(
        (sum, leg, index) => (index === balancingIndex ? sum : sum + leg.amount),
        0,
      );
      return current.map((leg, index) =>
        index === balancingIndex ? { ...leg, amount: Math.max(due - others, 0) } : leg,
      );
    });
  }, [due, balancingIndex]);
```

- [ ] **Step 5: Show what the discount did**

The ticket currently shows only a `Chegirma` row. On a comped bill the operator needs to see why anything is still owed. Add a service row beneath the discount row, rendered only when `serviceBase > 0`:

```tsx
{serviceBase > 0 ? (
  <Row columns="1fr 110px">
    <span className="text-muted-foreground">Xizmat haqi</span>
    <RowMoney>{formatMoney(serviceBase)}</RowMoney>
  </Row>
) : null}
```

- [ ] **Step 6: Verify the gates**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
pnpm run typecheck:renderer && pnpm run typecheck:gallery
pnpm exec vitest run
```
Expected: `tsc -b` **49 or fewer**, both renderer gates clean, 8 tests passing.

- [ ] **Step 7: Verify in the browser**

`pnpm gallery:page`, open **Tasdiqlash**:
- key a 10,000 discount → `TO'LANADI` drops **and Naqd drops with it**; TASDIQLASH stays enabled
- on an order with a XIZMAT line, comp the whole food total → `TO'LANADI` equals the service charge, not 0, and the `Xizmat haqi` row explains it
- the ticket header shows a position count instead of a blank

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(confirm): the discount now rebalances instead of deadlocking

Keying a discount changed `due` while the legs kept the old amounts, so the
ticket went unbalanced and TASDIQLASH disabled itself with no message. From
the operator's side the discount simply did nothing. The legs now rebase
whenever due changes.

The clamp base was wrong too. The ticket clamped at subtotalSnapshot ??
totalAmount, and on a SENT order every snapshot is null — so it clamped at
food plus service while the server clamps at food alone. On any order with a
XIZMAT line, comping the bill showed TO'LANADI 0 here and PAYMENT_MISMATCH
there. Both bases are now derived from the lines, and a Xizmat haqi row makes
the remainder visible rather than surprising.

LIST_INCLUDE gains menuItem.kind — a one-column select, deliberately not a
full include — because mapToDto was defaulting every list-payload line to
FOOD. itemCount is populated at the same time; it was declared in the API type,
had no column and no computation, and rendered as a blank in the ticket header."
```

---

### Task 4: Stop clipping the keypad, and let the keyboard work

The operator's words: *"ux here is really annoying, enable keyboard, and if the keyboard is enable do not display numpad, there is no place in this small monoblock."*

Two separate defects. First, **the keypad is physically clipped**: it is a fixed 270px block (4 rows × 66px + seams) inside a `flex-1 min-h-0` container that also holds one 48px row per payment leg. With two legs present the bottom row is cut off — measured at 382px inside a container ending at 318px — so `0` and `←` cannot be pressed. No amount ending in zero can be typed and no mistake corrected, on exactly the nasiya path that needs the most typing.

Second, **no amount anywhere in the app accepts a hardware keyboard.** There are zero `onKeyDown` handlers in the entire renderer, and seven money values render as plain text nodes driven only by `Keypad.onKey`. Every till has a keyboard.

**Files:**
- Create: `apps/master/src/renderer/components/blocks/AmountField.tsx`
- Modify: `apps/master/src/renderer/components/blocks/Keypad.tsx`
- Modify: `apps/master/src/renderer/components/approval/OrderTicket.tsx:301-313`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `<AmountField value={number} onChange={(next: number) => void} onDone={() => void} showKeypad={boolean} label={string} />` — a numeric input that accepts typing, with the keypad below it when `showKeypad` is true.

- [ ] **Step 1: Add the `000` key**

`applyKey` already handles `'000'` in `OrderTicket.tsx:37`, `DebtPanel.tsx` and `StockPanel.tsx` — and `Keypad` has never rendered it, so all three branches are dead code. So'm amounts are all thousands; this alone turns a 1,500,000 entry from seven taps into three.

In `apps/master/src/renderer/components/blocks/Keypad.tsx`, replace the disabled placeholder at lines 57-61 with the `000` key:

```tsx
      ) : (
        <Key onClick={() => onKey('000')} aria-label="Uch nol">
          000
        </Key>
      )}
```

- [ ] **Step 2: Build the amount field**

Create `apps/master/src/renderer/components/blocks/AmountField.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Keypad } from './Keypad';
import { cn } from '@/lib/utils';

/**
 * A money amount the operator can type OR tap.
 *
 * Every till on site has a physical keyboard, which the design system
 * originally assumed away — so amounts rendered as plain text nodes driven
 * only by the on-screen pad, and the numeric keypad on the operator's desk
 * did nothing. The input is now the source of truth; the pad is an optional
 * companion for finger use.
 *
 * Integer so'm only: no decimal separator, because there is no sub-so'm
 * amount in this product and a stray "." previously produced a 500 from the
 * server's integer schema.
 */
export function AmountField({
  value,
  onChange,
  onDone,
  showKeypad = true,
  label,
  autoFocus = true,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  onDone?: () => void;
  showKeypad?: boolean;
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const handleKey = (key: string) => {
    if (key === 'backspace') {
      onChange(Math.floor(value / 10));
      return;
    }
    if (key === '000') {
      onChange(value * 1000);
      return;
    }
    if (key === 'decimal') return;
    onChange(value * 10 + Number(key));
  };

  return (
    <div className={cn('flex min-h-0 flex-col gap-seam', className)}>
      {label ? <div className="px-pad text-[12px] text-muted-foreground">{label}</div> : null}
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-action w-full bg-field px-pad text-right text-[17px] font-semibold tabular-nums focus-block"
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          onChange(digits ? Number(digits) : 0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onDone) {
            event.preventDefault();
            onDone();
          }
        }}
      />
      {showKeypad ? (
        <div className="min-h-0 overflow-auto">
          <Keypad onKey={handleKey} className="w-full" />
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Use it in the confirm ticket, and stop the clipping**

In `OrderTicket.tsx`, the keypad branch at lines 301-313 renders a readout, the pad and a `Tayyor` button inside `<div className="flex min-h-0 flex-1 flex-col gap-seam bg-field-raised p-seam">`. Replace the readout and the `<Keypad .../>` with `AmountField`, and add `overflow-auto` to that container so the pad can never be clipped again:

```tsx
      <div className="flex min-h-0 flex-1 flex-col gap-seam overflow-auto bg-field-raised p-seam">
        <AmountField
          value={editingValue}
          onChange={setEditingValue}
          onDone={() => setEditing(null)}
          label={editingLabel}
        />
        <Button size="action" className="w-full shrink-0" onClick={() => setEditing(null)}>
          Tayyor
        </Button>
      </div>
```

Derive the three props from the existing `editing` state. Add these directly above the returned markup, so the branch has no inline logic:

```tsx
  const editingValue =
    editing?.kind === 'discount' ? discount
    : editing?.kind === 'leg' ? (legs[editing.index]?.amount ?? 0)
    : 0;

  const editingLabel =
    editing?.kind === 'discount' ? 'Chegirma'
    : editing?.kind === 'leg' ? METHOD_LABEL[legs[editing.index]?.method ?? 'CASH']
    : '';

  const setEditingValue = (next: number) => {
    if (editing?.kind === 'discount') {
      setDiscount(Math.min(next, foodBase));
      return;
    }
    if (editing?.kind === 'leg') {
      const index = editing.index;
      setLegs((current) => setLegAmount(current, index, next, due, balancingIndex));
    }
  };
```

Match `editing.kind === 'leg'` to whatever the file's existing `Editing` union actually calls the payment-leg case — read the type at the top of the file and use its real member name and field, rather than assuming `{ kind: 'leg', index }`.

`AmountField` owns key handling now, so the file's local `applyKey` (`:34-41`) loses its last caller and should be deleted along with its dead `'000'` and `'decimal'` branches.

- [ ] **Step 4: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
pnpm exec vitest run
```
Expected: both clean, 8 tests passing.

- [ ] **Step 5: Verify in the browser at the small size**

`pnpm gallery:page`. **Resize the browser to 1024 px wide and about 700 tall** — the gallery's own frame is 1366×768 and will hide this bug. On **Tasdiqlash**:
- add a Nasiya leg so three rows are present, then open the keypad: every key including `0`, `000` and `←` must be reachable, scrolling if necessary
- type digits on the physical keyboard — the amount must update
- press Enter — the editor must close
- `000` must multiply by a thousand

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(confirm): the keypad no longer clips, and the keyboard works

Two defects behind one complaint. The pad is a fixed 270px block inside a
container that also grows by 48px per payment leg, so with two legs its bottom
row was cut off — measured at 382px inside a container ending at 318px. The 0
and backspace keys were unreachable, meaning no amount ending in zero could be
typed and no mistake corrected, on exactly the nasiya path that needs the most
typing. The container now scrolls.

And no amount anywhere in this app accepted a hardware keyboard: zero
onKeyDown handlers in the whole renderer, seven money values rendered as plain
text nodes driven only by the pad. Every till on site has a keyboard. Amounts
are now a real numeric input with the pad as an optional companion, Enter
commits, and integer-only entry stops a stray decimal point reaching the
server's integer schema as a 500.

The 000 key is finally rendered. applyKey has handled it in three components
since the C1 rebuild and Keypad never drew it, so all three branches were dead
code. So'm amounts are all thousands."
```

---

### Task 5: The dish name never collapses

The operator's words: *"there is no food name there, there is only price."*

`ItemList.tsx:5` is `const COLUMNS = '1fr 110px 96px 108px'`. The name track is `1fr`, whose automatic minimum is 0 because the cell carries `truncate`. Before the name gets a single pixel, 368px is committed to fixed tracks, padding and gaps — and further up the tree the nav rail (168px), the panel (up to 440px) and the category column (280px) are all fixed too. Measured in Chrome: the name is 182px at a 1366 viewport, 122px at 1280, **0px at 1146 and below**. At 1092 — which is 1366×768 at 125% Windows scaling — the reproduction is pixel-exact with the customer's photograph.

**Files:**
- Modify: `apps/master/src/renderer/components/menu/ItemList.tsx:5,69-79`
- Modify: `apps/master/src/renderer/components/stock/StockList.tsx:5`

**Interfaces:**
- Consumes: nothing.
- Produces: no API change.

- [ ] **Step 1: Give the name a floor and merge the two status columns**

`Qoldiq` and `Holati` say the same thing twice — `StockCell` already renders `Sanoqsiz`, `Tugadi` or a count, and the `Holati` chip adds only `Mavjud` / `Mavjud emas`. Merging them frees ~108px.

Replace line 5:

```ts
const COLUMNS = 'minmax(160px, 1fr) 104px 120px';
```

- [ ] **Step 2: Collapse the header to three columns**

In the `RowHeader`, delete the `Holati` cell so the header matches:

```tsx
      <RowHeader columns={COLUMNS}>
        <span className="truncate">{title}</span>
        <span className="text-right">Narxi</span>
        <span className="text-center">Holati</span>
      </RowHeader>
```

- [ ] **Step 3: Merge the two cells in the row**

Replace the two trailing cells — the `StockCell` span and the `Holati` chip span — with one cell that shows unavailability first and stock second:

```tsx
          <span className="flex justify-center">
            {!item.isAvailable ? (
              <Chip tone="owed">Mavjud emas</Chip>
            ) : (
              <StockCell item={item} />
            )}
          </span>
```

An item that is manually switched off reads `Mavjud emas`; everything else shows its count, `Doim mavjud`, `Sanoqsiz` or `Tugadi` — which is the more useful fact and was already being rendered.

- [ ] **Step 4: Give the stock list the same floor**

`components/stock/StockList.tsx:5` has the same latent flaw with a smaller budget. Replace it:

```ts
const COLUMNS = 'minmax(160px, 1fr) 150px 120px';
```

- [ ] **Step 5: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean.

- [ ] **Step 6: Measure it in the browser**

`pnpm gallery:page`, open **Menyu**, and check at **1024, 1092, 1264 and 1366** px wide. At every width the dish name must be readable — at minimum 160px — and no column may be clipped off the right edge. Read a long name specifically: `Osh (mol go'shti)` is 17 characters and was previously truncated at 15.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(menu): the dish name can no longer be squeezed to nothing

The name track was 1fr with a truncating cell, so its automatic minimum was
zero — it absorbed every pixel of width loss while Narxi, Qoldiq and Holati
never gave up one. Measured in Chrome: 182px of name at a 1366 viewport, 122
at 1280, and exactly 0 at 1146 and below. At 1092 — a 1366x768 panel at 125%
Windows scaling — the result is pixel-identical to the customer's photograph:
rows showing a price and a stock chip with no dish name anywhere.

The name now has a 160px floor. Qoldiq and Holati are merged, which frees
about 108px and removes a genuine duplication: StockCell already rendered
Sanoqsiz, Tugadi or a count, and the Holati chip added only Mavjud. An item
switched off manually now reads Mavjud emas; everything else shows the count,
which is the more useful fact.

StockList had the same latent flaw and gets the same floor."
```

---

### Task 6: Ombor shows the whole catalog

The operator's words: *"in the inventory or menu where admin can see the count and add new item."* Their Ombor reads **Sanoqsiz 0 / Hammasi 0** while the menu holds a hundred-plus dishes.

`menuRepo.listCountedFoodItems` filters `counted: true`, and the customer created everything as **"Doim mavjud"** (uncounted). So the warehouse screen legitimately has nothing to show — and says nothing about why. `StockList` has no empty-state branch at all, unlike `ItemList`, so the operator gets a bare header strip.

The filter is defensible; silently hiding the entire catalog is not. Ombor becomes the place where that mistake is visible and fixable.

**Files:**
- Modify: `apps/master/src/main/server/repositories/menu.repo.ts:90-96`
- Modify: `apps/master/src/main/server/services/stock.service.ts` (`listCounted`)
- Modify: `apps/master/src/renderer/api/stock.ts`
- Modify: `apps/master/src/renderer/pages/OmborPage.tsx:12-14,27,36-37,76-93`
- Modify: `apps/master/src/renderer/components/stock/StockList.tsx:24-60`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/stock` returns every active FOOD item, each carrying `counted: boolean`. `StockItem` gains `counted`.

- [ ] **Step 1: Return the whole food catalog**

In `apps/master/src/main/server/repositories/menu.repo.ts`, rename and widen the query:

```ts
  /**
   * Every active FOOD item, counted or not. Ombor needs the uncounted ones
   * too: a catalog created entirely as "Doim mavjud" otherwise renders an
   * empty warehouse with no explanation, which is what the customer hit.
   */
  async listFoodItemsForStock(tx?: Tx) {
    return (tx ?? getPrisma()).menuItem.findMany({
      where: { kind: MenuItemKind.FOOD, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  },
```

Update the single call site in `services/stock.service.ts` (`listCounted`, around line 293) to call `listFoodItemsForStock`, and add `counted: item.counted` to the mapped DTO it returns.

- [ ] **Step 2: Carry `counted` on the client type**

In `apps/master/src/renderer/api/stock.ts`, add to the `StockItem` type:

```ts
  counted: boolean;
```

- [ ] **Step 3: Add the third filter**

In `apps/master/src/renderer/pages/OmborPage.tsx`, widen the filter type at line 12 and the predicates at line 14:

```ts
type Filter = 'uncounted' | 'all' | 'untracked';

const isUncounted = (item: StockItem) => item.counted && item.stockCount === null;
const isUntracked = (item: StockItem) => !item.counted;
```

Update the derived lists around lines 36-37:

```ts
  const uncounted = useMemo(() => items.filter(isUncounted), [items]);
  const untracked = useMemo(() => items.filter(isUntracked), [items]);
  const counted = useMemo(() => items.filter((item) => item.counted), [items]);
  const visible =
    filter === 'uncounted' ? uncounted : filter === 'untracked' ? untracked : counted;
```

Add the third button beside the existing two in the `status` slot:

```tsx
          <Button
            variant={filter === 'untracked' ? 'default' : 'secondary'}
            onClick={() => setFilter('untracked')}
          >
            Sanalmaydigan {untracked.length}
          </Button>
```

- [ ] **Step 4: Add the recovery action**

An untracked dish needs one tap to start being counted. Add the mutation beside the existing `countMutation`:

```ts
  const trackMutation = useMutation({
    mutationFn: (id: string) => menuApi.updateItem(id, { counted: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock'] });
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      toast.success("Sanoqqa o'tkazildi");
    },
    onError: onMutationError,
  });
```

`menu.service.ts` resets `stockCount` to `NULL` on that toggle, so the dish lands in **Sanoqsiz** ready for its first Sanoq — the correct destination. Render the action in the panel when the selected item has `counted === false`, as a full-width `size="action"` button labelled `Sanoqqa o'tkazish`.

- [ ] **Step 5: Give the list an empty state that names the cause**

`StockList` has no `items.length === 0` branch. Add one, mirroring `ItemList.tsx:82-86`:

```tsx
      {items.length === 0 ? (
        <Row columns="1fr">
          <span className="text-[13px] text-muted-foreground">
            {emptyMessage ?? "Hech bir taom sanalmaydi. Sanalmaydigan ro'yxatidan tanlab, \"Sanoqqa o'tkazish\"ni bosing."}
          </span>
        </Row>
      ) : null}
```

- [ ] **Step 6: Verify the gates and the server**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: `tsc -b` 49 or fewer, both renderer gates clean.

- [ ] **Step 7: Verify against a running server**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml up -d
```
Then create an uncounted item and confirm it appears under **Sanalmaydigan** and not under **Hammasi**, and that `Sanoqqa o'tkazish` moves it to **Sanoqsiz**.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ombor): show the whole food catalog, not just counted dishes

The customer's Ombor read \"Sanoqsiz 0 / Hammasi 0\" while their menu held over
a hundred dishes. listCountedFoodItems filters counted: true, and they had
created everything as \"Doim mavjud\" — so the warehouse screen was correctly
empty and said nothing about why. StockList had no empty-state branch at all,
so they got a bare header strip.

Ombor now lists every active FOOD item, with a third filter for the
uncounted-by-design ones and a Sanoqqa o'tkazish action that starts tracking a
dish in one tap. The toggle resets stockCount to NULL, so it lands in Sanoqsiz
ready for its first Sanoq.

The filter itself was defensible. Hiding the entire catalog behind it without a
word was not."
```

---

### Task 7: Validation errors say what is wrong

Every Zod failure on every endpoint currently surfaces as a red **"Internal server error"** toast in English. `errorHandler.ts` has no `ZodError` branch, so a malformed body falls through to the generic 500. Reproduced live: `PATCH /api/menu/items/:id` with `{"price": 45000.5}` — one stray decimal point on a touchscreen — returns `500 INTERNAL`. The operator sees English, learns nothing, and the price does not change.

This is `docs/TECHNICAL_REVIEW_2026-08-16.md` §11 defect 8, and it silently hides the *reason* behind several other complaints in this plan.

**Files:**
- Modify: `apps/master/src/main/server/middleware/errorHandler.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: validation failures return HTTP 400 with `{ error: { code: 'VALIDATION', message, details } }`.

- [ ] **Step 1: Add the ZodError branch**

At the top of the handler, before the `AppError` check:

```ts
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join('.') ?? '';
    res.status(400).json({
      error: {
        code: 'VALIDATION',
        // Uzbek, and names the field — the operator sees this, not a developer.
        message: field
          ? `Ma'lumot noto'g'ri: ${field}`
          : "Ma'lumot noto'g'ri",
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }
```

Add `import { ZodError } from 'zod';` at the top of the file.

- [ ] **Step 2: Typecheck**

```bash
cd apps/master && npx tsc -b 2>&1 | grep -cE "error TS"
```
Expected: 49 or fewer.

- [ ] **Step 3: Prove it against a running server**

```bash
cd /Users/uzmacbook/dev/lab/project02
docker compose -f compose.dev.yaml up -d
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"owner","password":"owner123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X PATCH http://localhost:4000/api/menu/items/seed-item-achichuk \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"price":45000.5}' -w "\n[%{http_code}]\n"
```
Expected: **400**, code `VALIDATION`, and a `details` array naming `price`. Before this task the same call returns 500 `INTERNAL`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(errors): validation failures return 400 in Uzbek, not 500 in English

errorHandler had no ZodError branch, so every malformed body fell through to
the generic handler and reached the operator as a red \"Internal server error\"
toast. Reproduced: PATCH a menu item with a price of 45000.5 — one stray
decimal on a touchscreen — returned 500 INTERNAL with no indication that the
price was the problem.

This hid the reason behind several other reports in this release, which is why
it ships with them rather than after them."
```

---

### Task 8: Show the server address

The operator's words: *"write ip address somewhere visible."*

The endpoint already exists and **nothing reads it**. `health.routes.ts:10-22` serves `/api/health/server-info` with the port and every non-internal IPv4 address, no auth required. A repo-wide grep for `server-info` returns two hits: the route, and a row in a docs table. Meanwhile `192.168.1.50` is hardcoded in three places as a convention and the order app burns a three-second startup wait on mDNS discovery.

**Files:**
- Create: `apps/master/src/renderer/api/server-info.ts`
- Modify: `apps/master/src/renderer/components/layout/NavRail.tsx:113-115`

**Interfaces:**
- Consumes: nothing.
- Produces: `serverInfoApi.get(): Promise<{ port: number; lanIps: string[] }>`.

- [ ] **Step 1: Add the client**

Create `apps/master/src/renderer/api/server-info.ts`:

```ts
import { api } from './client';

export type ServerInfo = {
  port: number;
  lanIps: string[];
};

export const serverInfoApi = {
  get: () => api.get<ServerInfo>('/api/health/server-info'),
};

/**
 * `lanIps` is unranked and can contain VPN, Docker or second-NIC addresses.
 * Waiter devices are on the venue LAN, so prefer the private ranges in the
 * order the order app already uses for mDNS results.
 */
export function preferredLanIp(ips: string[]): string | null {
  return (
    ips.find((ip) => ip.startsWith('192.168.')) ??
    ips.find((ip) => ip.startsWith('10.')) ??
    ips.find((ip) => ip.startsWith('172.')) ??
    ips[0] ??
    null
  );
}
```

- [ ] **Step 2: Show it in the rail foot**

The rail already has a 34px foot strip showing `Ulangan` / `Ulanmoqda…` — a status word that tells the admin nothing the loading data does not. Replace its contents with the connection state *and* the address, in the same slot:

```tsx
  const { data: serverInfo } = useQuery({
    queryKey: ['server-info'],
    queryFn: serverInfoApi.get,
    staleTime: 5 * 60 * 1000,
  });
  const lanIp = serverInfo ? preferredLanIp(serverInfo.lanIps) : null;
```

```tsx
      <div className="bg-field px-3 py-2">
        <div className="text-[12px] uppercase tracking-wide text-muted-foreground">
          {connected ? 'Ulangan' : 'Ulanmoqda…'}
        </div>
        {lanIp ? (
          <div className="text-[13px] font-semibold tabular-nums">
            {lanIp}:{serverInfo?.port}
          </div>
        ) : null}
      </div>
```

Keep the existing `connected` source, whatever it is in the file — do not change the connection logic.

- [ ] **Step 3: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean. The gallery stubs `window.fetch`, so add a `server-info` handler to the gallery fixtures if `typecheck:gallery` or the preview complains about a missing route.

- [ ] **Step 4: Verify against a running server**

With the Docker stack up, load the UI and confirm the rail foot shows a real LAN address and the port, and that it matches:

```bash
curl -s http://localhost:4000/api/health/server-info
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shell): show the server address in the nav rail

The operator asked for the IP to be visible somewhere. The endpoint has existed
all along — /api/health/server-info returns the port and every non-internal
IPv4 address, no auth needed — and a repo-wide grep found exactly two
references: the route itself and a row in a docs table. Nothing has ever read
it, while 192.168.1.50 is hardcoded in three places as a convention.

It now sits in the rail's foot strip, which previously spent its 34px on the
word Ulangan. The address is picked by private-range preference, because
lanIps is unranked and can contain VPN or Docker addresses."
```

---

### Task 9: Remove the Boshqa toggle

The operator's words: *"the 'boshqa' toggle no need just display all with scroll."*

They are right, and the toggle is also hiding a defect: with it expanded the rail is **943px tall inside a 673px box** for an OWNER, and `Seam` is a plain grid inside an `overflow-hidden` shell — so Sozlamalar, Amallar tarixi, Chiqish, Foydalanuvchilar and Chegirmalar are simply clipped, with no scrollbar and no wheel target. The `mt-auto` intended to pin the foot cannot work in a grid, which is why the two elements the author tried hardest to protect are the two that get pushed off.

**Files:**
- Modify: `apps/master/src/renderer/components/layout/NavRail.tsx:28-47,60-110`

**Interfaces:**
- Consumes: Task 8's foot strip.
- Produces: no toggle, no `showMore` state.

- [ ] **Step 1: Merge the two destination lists**

Combine `PRIMARY` and `SECONDARY` into one `DESTINATIONS` array in the order the operator uses them — the six daily ones first, exactly as `PRIMARY` is ordered today, then the rest. Delete the `SECONDARY` const and the `showMore` state at line 60.

- [ ] **Step 2: Make head, body and foot separate**

The rail must scroll in its middle only. Restructure the returned markup so the header and the foot strip sit outside a scrolling body:

```tsx
    <div className="flex w-[168px] shrink-0 flex-col gap-seam">
      <div className="shrink-0 bg-field-raised px-3 py-2.5">
        {/* existing header content unchanged */}
      </div>

      <Seam className="min-h-0 flex-1 content-start overflow-y-auto overscroll-contain">
        {destinations.map((dest) => (
          /* existing NavItem markup unchanged */
        ))}
      </Seam>

      {/* the foot strip from Task 8, unchanged */}
    </div>
```

`min-h-0` is what allows the middle to shrink below its content height — without it `overflow-y-auto` never engages, which is the same class of mistake as the original clipping.

- [ ] **Step 3: Delete the toggle**

Remove the `Boshqa` `NavItem` and the `{showMore && ...}` block entirely, along with the `mt-auto` on the old foot — the flex column now handles it correctly.

- [ ] **Step 4: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean.

- [ ] **Step 5: Verify at the smallest height**

`pnpm gallery:page`, then **resize the browser to roughly 1024×650** — smaller than the gallery's own frame, to reproduce the customer's constraint. Log in as OWNER and confirm: all 15 destinations are reachable by scrolling the rail, the header stays put, and the address strip stays pinned at the bottom. Repeat as ADMIN, which has 14.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(nav): drop the Boshqa toggle and scroll the rail

The operator asked for it and the toggle was hiding a defect. Expanded, the
rail is 943px tall for an OWNER inside a box that is 673px on their screen, and
Seam is a plain grid inside an overflow-hidden shell — so Sozlamalar, Amallar
tarixi, Chiqish, Foydalanuvchilar and Chegirmalar were clipped with no
scrollbar and no wheel to reach them.

The mt-auto meant to pin the foot could never work: margin auto has no free
space to absorb in a grid row sized to its content, which is why the two
elements it was protecting were the two that got pushed off. Head, body and
foot are now a flex column with min-h-0 on the scrolling middle."
```

---

### Task 10: The price edit sticks

The operator's words: *"editing the price and check the service layer, they say after save it is not updating the price."*

**The server is innocent** — proven live: `PATCH /api/menu/items/:id` with `{"price":99000}` returns 200 and the value persists. There are three separate client-side causes, and the third is already fixed by Task 7.

1. **The resync effect discards in-progress typing** (`ItemPanel.tsx:53-59`). Its dependency array lists all five editable fields, so any server-side change to any of them resets all five — without checking whether the operator is mid-edit. The realistic trigger is their own save: tap Saqlash → `invalidateMenu()` fires three refetches → they immediately correct the number again → the in-flight refetch lands, `item.price` has changed, the effect resets the field to the just-saved value. Their second edit is gone, they press Saqlash, get "Saqlandi", and the price is unchanged. **This is exactly the reported symptom.** It also happens whenever two admin sessions are open, which this product now supports.

   A test proved waiter traffic is *not* the trigger: `stockCount` and `isAvailable` are not in the dependency array, so stock refetches leave typing intact.

2. **`dirty` is permanently true** (`ItemPanel.tsx:67`). `price` arrives as a **string** — Prisma `Decimal` serialises to `"99000"` — while `api/menu.ts:7` declares `price: number`. `priceNum !== item.price` compares a number to a string and is therefore always true, so Saqlash is enabled even with zero edits. The operator gets no signal about whether their change registered, which is precisely the feedback they need in case 1.

3. **A decimal price returns a 500** — fixed by Task 7.

**Files:**
- Modify: `apps/master/src/renderer/components/menu/ItemPanel.tsx:53-59,61-69`
- Modify: `apps/master/src/renderer/api/menu.ts:7`

**Interfaces:**
- Consumes: Task 7's `VALIDATION` error shape, so a rejected price now explains itself.
- Produces: `MenuItem.price` is typed `string`, matching the wire.

- [ ] **Step 1: Correct the declared type**

`api/menu.ts:7` says `price: number`; the wire sends a string. Change it:

```ts
  price: string;
```

Note the inconsistency this exposes and leave it alone for now: `/api/stock` returns `price` as a **number** because `stock.service.ts` calls `Number(i.price)`, so `api/stock.ts` is correct as written. Only the menu type is wrong.

- [ ] **Step 2: Narrow the resync to item identity**

Replace the dependency array at `ItemPanel.tsx:59`:

```ts
  }, [item.id]);
```

and add the reason above the effect at line 53:

```ts
  // Resync ONLY when a different item is selected. Listing every editable
  // field here meant any server-side change reset all five mid-edit — most
  // often the operator's own save, whose refetch landed while they were
  // correcting the number again, silently reverting it. That is what "after
  // save it is not updating the price" was.
```

- [ ] **Step 3: Fix the dirty comparison**

Replace line 67 so it compares like with like:

```ts
    (priceValid && priceNum !== Number(item.price)) ||
```

`costPrice` on line 68 is already string-compared and is correct.

- [ ] **Step 4: Reject a decimal before it reaches the server**

The server schema is integer-only. Replace line 62 so the existing Uzbek validation banner catches it rather than a 500:

```ts
  const priceValid =
    price.trim().length > 0 && Number.isInteger(priceNum) && priceNum >= 0;
```

- [ ] **Step 5: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean. If `typecheck:gallery` complains that a fixture supplies a number for `price`, fix the fixture — it was wrong about the wire shape too.

- [ ] **Step 6: Verify the behaviour**

With the Docker stack up, in the browser: open a dish on **Menyu**, confirm **Saqlash is disabled** before any edit (it was always enabled before this task). Change the price, save, and confirm the row updates. Then change it again immediately after the toast and confirm the second edit is not reverted. Finally type `1000.5` and confirm the Uzbek validation message appears instead of a red English toast.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(menu): a price edit is no longer silently reverted

The server was never at fault — PATCH persists correctly. Three client-side
causes, all in the item panel.

The resync effect depended on all five editable fields, so any server-side
change reset all five without checking for unsaved input. The realistic trigger
is the operator's own save: invalidateMenu fires three refetches, they correct
the number again, the in-flight refetch lands and reverts them. They press
Saqlash, see Saqlandi, and the price has not moved. That is the reported bug.
It resyncs on item identity now.

dirty was permanently true because price arrives as a string — Prisma Decimal
serialises that way — while the API type declared a number, so the comparison
never matched. Saqlash was lit with zero edits, removing the one signal that
would have told the operator their change had not registered. The type is
corrected and the comparison coerced.

A decimal price is now rejected in the panel with the existing Uzbek banner
rather than reaching the server's integer schema and coming back as a 500."
```

---

### Task 11: Put the doors where the operator looks for them

Two complaints in the same family: *"in the inventory or menu where admin can see the count and add new item"* and *"there is no add in the category."* The buttons exist. Three things make them invisible.

**Files:**
- Modify: `apps/master/src/renderer/pages/OmborPage.tsx`
- Modify: `apps/master/src/renderer/pages/MenuPage.tsx:368-374,380-387,393-399`
- Modify: `apps/master/src/renderer/components/menu/NewItemPanel.tsx:18-19`

**Interfaces:**
- Consumes: Task 6's Ombor filters.
- Produces: no API change — `NewItemPanel` and `menuApi.createItem` are reused as they are.

- [ ] **Step 1: Add a product from Ombor**

`OmborPage` has no create path at all, and Ombor is where the operator thinks about products they have. Add `+ Yangi mahsulot` to its `status` slot, rendering the **existing** `NewItemPanel` in the panel slot with `COUNTED` preselected — Ombor's whole subject — and the mode switch still available:

```tsx
          <Button variant="default" onClick={() => setMode({ kind: 'newItem' })}>
            + Yangi mahsulot
          </Button>
```

`NewItemPanel` already accepts `categories`, `initialCategoryId` and `onSave(CreateItemPayload)`, and `menuApi.createItem` already takes `initialCount` — so the dish is created *and* given its first count in one pass, which is exactly the flow the operator described. On success invalidate `['stock']` and `['menu']` and select the new item. `OmborPage` will need the categories query that `MenuPage` already uses.

- [ ] **Step 2: Stop a category tap hijacking the panel**

`MenuPage.tsx:380-387` overloads navigation and editing onto one gesture: tapping a category to *see its dishes* also loads `CategoryPanel` into the right-hand panel. That is the exact state in the customer's photograph — they were trying to work with items while the panel showed a category form, which is why the screen read as "there is nothing here for adding".

Change the handler so selecting a category only navigates:

```tsx
                onSelect={(category) => {
                  setSearchQuery('');
                  setActiveCategoryId(category.id);
                }}
```

Editing a category then needs its own affordance. Add a `Tahrirlash` button to the item column's header that sets `setItemsMode({ kind: 'category', id: activeCategoryId })`, so the editor is deliberate rather than incidental.

- [ ] **Step 3: Make the two create buttons look like buttons**

Under Blocks C1 — no borders, no radius, no shadows, no hover — a `variant="secondary"` full-width bar sitting directly above a header strip is visually identical to that header strip. The only thing marking `+ Yangi kategoriya` (`:368`) and `+ Yangi mahsulot` (`:393`) as tappable is the `+` glyph.

Change both to `variant="default"`, the same accent fill `NewItemPanel`'s own `QO'SHISH` action uses. These are the only two creating actions on the screen and they should be the only two things wearing the accent.

- [ ] **Step 4: Delete a comment that is now false and harmful**

`NewItemPanel.tsx:18-19` claims create-mode is unchangeable afterwards. That stopped being true at the count-based refactor: `ItemPanel.tsx` exposes a `Sanaladigan` checkbox and `menu.service.ts` honours it in both directions. Since that toggle is the escape hatch for the empty-Ombor problem in Task 6, a comment denying it exists is actively harmful. Delete those two lines.

- [ ] **Step 5: Verify the gates**

```bash
cd apps/master
pnpm run typecheck:renderer && pnpm run typecheck:gallery
```
Expected: both clean.

- [ ] **Step 6: Verify in the browser**

`pnpm gallery:page` at 1024 and 1366 px. On **Menyu**: tapping a category shows its dishes and leaves the panel alone; both create buttons read as actions. On **Ombor**: `+ Yangi mahsulot` opens the create form and a dish created with an initial count lands in the list already counted.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "fix(menu, ombor): put the create actions where the operator looks

Two complaints, one cause: the buttons existed and were invisible.

Ombor had no create path at all, and Ombor is where an operator thinks about
products they have. It now opens the existing NewItemPanel with COUNTED
preselected, so a dish is created and given its first count in one pass.

On Menyu, tapping a category to see its dishes also loaded the category editor
into the panel — which is the exact state in the customer's photograph, and why
the screen read as having nothing for adding. Selecting a category now only
navigates; editing one is its own action.

Both create buttons were secondary bars sitting on top of header strips, and
under C1 — no borders, no radius, no hover — that is indistinguishable from a
header. They now carry the accent fill, as the only two creating actions on the
screen.

Also deletes a comment in NewItemPanel claiming a dish's mode cannot be changed
after creation. That stopped being true at the count-based refactor, and it is
the escape hatch for the empty-Ombor problem, so denying it exists was harmful."
```

---

### Task 12: Correct the documents and release v0.1.4

The hardware floor is quoted in three documents and is now known to be wrong. Leaving it is worse than having no guidance, because the next person will reintroduce a numpad-only input on the strength of it.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/design/BLOCKS_C1.md`
- Modify: `docs/design/RENDERER_REBUILD.md`
- Modify: `docs/CURRENT_WORKFLOW.md`
- Modify: `apps/master/package.json` (version)

- [ ] **Step 1: Correct the hardware floor everywhere it is stated**

In each of `CLAUDE.md`, `docs/design/BLOCKS_C1.md` and `docs/design/RENDERER_REBUILD.md`, replace the "no mouse, no hover, no keyboard" claim with:

```
Target hardware is a small POS monoblok, **1024–1366 CSS px depending on Windows
display scaling**, operated standing and mostly by finger — but **every machine on
site has a full physical keyboard and a mouse** (verified from site photographs,
2026-08-16). Touch stays primary and targets do not shrink: 48px rows, 56px
actions, 66px keys, 12/13/17px type floors. But a keyboard must work — typed
amounts, Enter to commit — and hover may decorate, never inform.
```

In `BLOCKS_C1.md` specifically, re-scope the "No hover" rule from *"there is no hover"* to *"hover may decorate, never carry information"*, and delete the line excusing non-keyboard-reachable table rows as "not urgent on a device with no keyboard".

- [ ] **Step 2: Record the release in CURRENT_WORKFLOW**

Add a dated entry to `docs/CURRENT_WORKFLOW.md` §13 recording that v0.1.4 is the first release driven by operator feedback, naming the nine defects and the fact that the hardware assumption was corrected by it.

- [ ] **Step 3: Bump the version**

In `apps/master/package.json`, set `"version": "0.1.4"`.

- [ ] **Step 4: Full gate**

```bash
cd apps/master
npx tsc -b 2>&1 | grep -cE "error TS"
pnpm run typecheck:renderer
pnpm run typecheck:gallery
pnpm exec vitest run
```
Expected: 49 or fewer, both gates clean, 8 tests passing.

- [ ] **Step 5: Build the installer**

```bash
cd apps/master
pnpm package:win
```
This must run **on Windows**. The artifact lands in `apps/master/dist/`.

⚠ **Do not deploy it.** Per the machine-wide policy, stop at "ready to install" and hand the owner the artifact path and the steps.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(release): v0.1.4 — the first release driven by operator feedback

Nine defects reported from the live chayxana on 2026-08-16, all fixed: the
window overhanging the screen, the payment legs that would not balance, the
discount that deadlocked the confirm button, the clipped keypad and the
keyboard nobody could use, the dish names squeezed to zero pixels, the empty
warehouse screen, validation errors reaching the operator as English 500s, the
missing server address, and the nav toggle hiding five destinations.

The hardware floor is corrected in three documents. \"No mouse, no hover, no
keyboard\" shaped this design system for months and site photographs disprove
it — every till has a full keyboard and a mouse, and the panel is smaller than
the 1366x768 every C1 measurement was taken against. Touch stays primary and no
target shrinks, but a keyboard now works."
```

---

## Verification summary

The release is ready when all of these hold:

| Check | Command | Expected |
|---|---|---|
| Type floor | `npx tsc -b` in `apps/master` | 49 or fewer, all pre-existing |
| Renderer | `pnpm run typecheck:renderer` | clean |
| Gallery | `pnpm run typecheck:gallery` | clean |
| Tests | `pnpm exec vitest run` | 8 passing |
| Layout | `pnpm gallery:page`, browser at 1024 / 1092 / 1264 / 1366 | dish names readable at every width; nothing clipped |
| Confirm flow | gallery, Tasdiqlash | second payment type takes the whole remainder; discount keeps the ticket balanced; every keypad key reachable with three legs present |
| Ombor | Docker stack | uncounted dishes visible under Sanalmaydigan, one tap to start counting |
| Validation | `curl` a decimal price | 400 `VALIDATION`, not 500 `INTERNAL` |
| Windows | manual, on the machine | maximised, no menu bar, `Ctrl+W` inert, TASDIQLASH fully visible |

## After this release

Port every one of these onto `feat/web-platform`. The files moved wholesale in slice 1
(`apps/master/src/renderer` → `packages/admin-ui/src`, `apps/master/src/main/server` →
`packages/server/src`), so each diff re-applies cleanly against the same line numbers — but they
must be re-applied by hand, not cherry-picked, because the paths differ.

Then the backlog this release deliberately left: inline line editing on the confirm ticket (the
operator's first request, and the server already supports it), debt repayment reversal, standalone
debtors, `.positive()` on payment amounts, adding a product from Ombor, and the `xl:` breakpoints in
`ReportsPage.tsx` that can never fire at this viewport.
