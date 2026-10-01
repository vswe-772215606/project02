# Server money guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Status:** executed 2026-09-30 and 2026-10-01 on `fix/server-money-guards`. The boxes below were
> never ticked, because progress was kept in a ledger outside git. Where a task's text and
> "Deviations during execution" (at the end) disagree, the deviations win.

**Goal:** Close the seven gaps PRD 14 names — double confirm, repayment race, unaccountable amounts,
draft cleanup, floor-wide PIN lockout, print holding the write lock, write bursts — on the build the
customer runs.

**Architecture:** Every guard moves a check from "read, then write" to one conditional statement
inside the transaction (`updateMany … where status/balance …`, count must be 1). The bill prints
after the sale commits. The master opens its SQLite file through one connection. Each guard has an
e2e test in the finance suite that fails before its fix and passes after.

**Tech Stack:** Node + Express + Prisma 6.17 on SQLite, zod 4, vitest 2 (unit: `pnpm test`; e2e:
`vitest.e2e.config.ts`), React 19 + TanStack Query + sonner in the renderer, Docker for every run.

**Spec:** `docs/prd/14-server-money-guards.md` (decided 2026-09-30). Parent:
`docs/superpowers/specs/2026-09-30-money-rules-design.md` §4 and §7 slice 1.

**Order:** PRD 14 §7's order by money at risk, except that G7 (Task 3) lands before G6 (Task 4).
Until the master opens one connection, the unawaited session touch can stall any request for 5 s,
which would make G6's timing test flaky.

## Global Constraints

- **Where:** worktree `~/dev/lab/project02-guards` on branch `fix/server-money-guards`, cut from
  `feat/auto-update`. Never commit to `main` or `feat/auto-update`; never push, merge, tag or deploy.
- **Where things run:** only in the container `chayxana-guards-master-dev-1` (compose project
  `chayxana-guards`). Never start Electron on this Mac. Every command below is written out in full.
- **Test floors, measured in Task 1:** e2e `Tests 48 failed | 39 passed (87)`; `pnpm test`
  `Tests 90 passed (90)` in 8 files; `pnpm typecheck` 48 errors; `typecheck:renderer` and
  `typecheck:gallery` at the counts Task 1 records. No task may raise a typecheck count, and no e2e
  test that passed before a task may fail after it.
- **Decided values (PRD 14):** the bill prints after commit and a failed print leaves the sale
  CLOSED (G6); five PIN misses lock the device for five minutes, never the floor (G5); money is
  whole so'm, payment legs may be 0, every other amount is > 0 (G3); one Nasiya leg per bill (G3);
  a draft unsent for 12 hours is cancelled with the reason
  `Avtomatik bekor qilindi: 12 soat yuborilmadi` (G4); the database URL carries
  `connection_limit=1` (G7).
- **Code rules** (`docs/agent-plans/00-shared/conventions.md`): TypeScript strict,
  `noUncheckedIndexedAccess`, no `any` outside test files; 2-space indent, single quotes,
  semicolons, trailing commas; Prisma only in `repositories/`; throw `Errors.*`; every user-facing
  string in Uzbek.
- **Commits:** authored as Barkamol, plain messages, no AI trailers or co-author lines. Never
  commit `apps/master/e2e/.data/`. If a hook blocks a commit, fix the cause; never `--no-verify`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `apps/master/e2e/**`, `apps/master/vitest.e2e.config.ts`, `apps/master/vite.e2e.config.ts`, `compose.e2e.yaml` | Create (copy) | The finance e2e suite, versioned outside `pnpm test` |
| `apps/master/e2e/14-forensics.test.ts` | Modify | Plants old damage straight into the database instead of through the bugs |
| `apps/master/src/main/server/repositories/order.repo.ts` | Modify | `closeIfSent`, `cancelIfIn`, `listStaleDraftIds` |
| `apps/master/src/main/server/services/order.service.ts` | Modify | Confirm claims first and prints after commit; cancel claims first; one Nasiya leg; `cancelStaleDraft` |
| `apps/master/src/main/server/repositories/debt.repo.ts` | Modify | `applyRepayment` — the conditional decrement |
| `apps/master/src/main/server/services/debt.service.ts` | Modify | Repayment through `applyRepayment` |
| `apps/master/src/main/server/lib/money-input.ts` (+ `.test.ts`) | Create | `somAmount`, `somLegAmount` — the zod types for so'm |
| `apps/master/src/main/server/controllers/{orders,expense,debt}.controller.ts` | Modify | Money fields use the so'm types |
| `apps/master/src/main/server/middleware/errorHandler.ts` | Modify | A failed schema answers 400, not 500 |
| `apps/master/src/main/server/lib/scheduler.ts` | Modify | Draft cleanup cancels through `cancelStaleDraft` |
| `apps/master/src/main/server/lib/sqlite-url.ts` (+ `.test.ts`) | Create | `singleConnectionUrl` |
| `apps/master/src/main/server/lib/prisma.ts` | Modify | The client opens one connection |
| `apps/master/src/main/server/middleware/requireAuth.ts` | Modify | The session touch can never be an unhandled rejection |
| `apps/master/src/main/server/lib/pin-lockout.ts` (+ `.test.ts`) | Create | `PinLockout` — misses and locks per device |
| `apps/master/src/main/server/services/auth.service.ts`, `controllers/auth.controller.ts` | Modify | PIN login compares first, locks the device |
| `apps/master/src/renderer/api/orders.ts` | Modify | `ConfirmResult` |
| `apps/master/src/renderer/lib/confirm-result.ts` (+ `.test.ts`) | Create | `printFailureNotice` |
| `apps/master/src/renderer/pages/ApprovalQueuePage.tsx` | Modify | A failed print shows a toast with "Qayta chop etish" |
| `apps/master/gallery/fixtures/orders.ts` | Modify | The confirm mock answers the new shape |
| `CLAUDE.md`, `docs/CURRENT_WORKFLOW.md`, `docs/prd/14-server-money-guards.md`, `docs/prd/README.md`, `STATE.md` | Modify | Say what the code now does |

---

### Task 1: Worktree, versioned e2e suite, bug-independent forensics plants

**Files:**
- Create (copy): `apps/master/e2e/**` except `.data/`, `apps/master/vitest.e2e.config.ts`,
  `apps/master/vite.e2e.config.ts`, `compose.e2e.yaml`
- Modify: `apps/master/e2e/14-forensics.test.ts` (the planting block in `beforeAll`)

**Interfaces:**
- Consumes: nothing.
- Produces: the branch, the running container `chayxana-guards-master-dev-1`, and the baselines
  every later task compares against.

`14-forensics.test.ts` plants a double confirm, a negative leg, two Nasiya legs and a repayment race
through the API itself. Tasks 2, 5 and 6 close exactly those holes, so without this change the
planting would throw and all 19 forensics tests would fail. The diagnostic exists to find damage
the old build already left in the customer's database, so the plant writes that damage directly.

- [ ] **Step 1: Create the worktree and branch**

```bash
cd ~/dev/lab/project02
git worktree add ../project02-guards -b fix/server-money-guards feat/auto-update
cd ../project02-guards
git log --oneline -1
```

Expected: the last commit is `3f8d389 docs(prd): server money guards, slice 1 of the money rules`
(or a later docs commit on `feat/auto-update`).

- [ ] **Step 2: Copy the suite in, without its databases**

```bash
cd ~/dev/lab/project02-guards
rsync -a --exclude '.data' ../project02-finance-e2e/apps/master/e2e/ apps/master/e2e/
cp ../project02-finance-e2e/apps/master/vitest.e2e.config.ts ../project02-finance-e2e/apps/master/vite.e2e.config.ts apps/master/
cp ../project02-finance-e2e/compose.e2e.yaml .
git status --short
```

Expected, exactly four lines:

```
?? apps/master/e2e/
?? apps/master/vite.e2e.config.ts
?? apps/master/vitest.e2e.config.ts
?? compose.e2e.yaml
```

- [ ] **Step 3: Start the container**

Ports 4020/5199 collide with the old `chayxana-e2e` project, so stop it first.

```bash
cd ~/dev/lab/project02-guards
docker stop chayxana-e2e-master-dev-1 2>/dev/null || true
docker compose -f compose.dev.yaml -f compose.e2e.yaml -p chayxana-guards up -d
until docker exec chayxana-guards-master-dev-1 test -f /tmp/ready 2>/dev/null; do sleep 5; done; echo ready
```

Expected: `ready` (the first start builds the image and installs dependencies; allow several minutes).

- [ ] **Step 4: Record the baselines**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Expected: `Tests  48 failed | 39 passed (87)`; `Test Files  8 passed (8)` and `Tests  90 passed (90)`;
`48`. Write down the renderer and gallery counts — they are the floors for Tasks 3–9. If
`pnpm typecheck` is not 48, use the container's number as the floor and say so in the Task 9
handover.

- [ ] **Step 5: Plant the old damage directly**

In `apps/master/e2e/14-forensics.test.ts`, inside `beforeAll`, replace everything from the line
`  // double confirm` down to and including the line that ends
`` `/api/debts/${d1.id}/repayments`, { amount: 5000, method: 'CASH' })));`` with:

```ts
  // The damage below is what the old build let through. The server now refuses
  // it (PRD 14), so it is written the way it sits in an old database: directly.
  // Double confirm: a second payment row on a closed bill.
  for (let i = 0; i < 2; i += 1) {
    const { id } = await sale(w, w.w1, [[w.items.somsa, 1]], cash(8000));
    await env.prisma.payment.create({ data: { orderId: id, method: 'CASH', amount: 8000 } });
  }
  // Negative leg: Naqd 20 000 + Karta −4 000 on a 16 000 bill.
  {
    const { id } = await sale(w, w.w1, [[w.items.somsa, 2]], cash(16000));
    const leg = await env.prisma.payment.findFirstOrThrow({ where: { orderId: id } });
    await env.prisma.payment.update({ where: { id: leg.id }, data: { amount: 20000 } });
    await env.prisma.payment.create({ data: { orderId: id, method: 'CARD', amount: -4000 } });
  }
  // Two Nasiya legs of 50 000 and 40 000; only the first became a debt.
  {
    const { id } = await sale(w, w.w1, [[w.items.osh, 2]], { payments: [{ method: 'DEBT', amount: 90000 }], debt: { debtorName: 'A' } });
    const leg = await env.prisma.payment.findFirstOrThrow({ where: { orderId: id, method: 'DEBT' } });
    await env.prisma.payment.update({ where: { id: leg.id }, data: { amount: 50000 } });
    await env.prisma.payment.create({ data: { orderId: id, method: 'DEBT', amount: 40000 } });
    await env.prisma.debt.updateMany({ where: { orderId: id }, data: { originalAmount: 50000, remainingAmount: 50000 } });
  }
  // Repayment race: two repayment rows, the balance reduced once.
  const r1 = await sale(w, w.w2, [[w.items.osh, 1]], { payments: [{ method: 'DEBT', amount: 45000 }], debt: { debtorName: 'B' } });
  const d1 = await env.prisma.debt.findFirstOrThrow({ where: { orderId: r1.id } });
  await w.admin.post(`/api/debts/${d1.id}/repayments`, { amount: 5000, method: 'CASH' });
  await env.prisma.debtRepayment.create({ data: { debtId: d1.id, amount: 5000, method: 'CASH', paidAt: new Date(), receivedById: 'seed-admin' } });
```

Leave the write-off of debt `C` and everything after it as it is.

- [ ] **Step 6: Run the forensics file**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/14-forensics.test.ts 2>&1 | grep -E '^\s+Tests'
```

Expected: `Tests  19 passed (19)`.

- [ ] **Step 7: Run the whole suite**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
```

Expected: `Tests  48 failed | 39 passed (87)` — unchanged.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/e2e apps/master/vitest.e2e.config.ts apps/master/vite.e2e.config.ts compose.e2e.yaml
git status --short | grep '\.data' && echo 'STOP: .data is staged' || echo 'clean'
git commit -m "test(e2e): version the finance suite, outside pnpm test" -m "Copied from the detached worktree project02-finance-e2e, where it was untracked. The forensics test now plants old damage directly, so the guards in PRD 14 do not break it."
```

Expected: `clean`, then the commit.

---

### Task 2: G1 — claim the order before a confirm or cancel writes

**Files:**
- Modify: `apps/master/src/main/server/repositories/order.repo.ts:253-272` (replace `setClosed`, `setCanceled`)
- Modify: `apps/master/src/main/server/services/order.service.ts` (`confirm` transaction, `cancelOrder` transaction)
- Test: `apps/master/e2e/02-payments.test.ts` (new test; `[issue 26]` exists)

**Interfaces:**
- Consumes: nothing new.
- Produces: `orderRepo.closeIfSent(id: string, closedAt: Date, tx: Tx): Promise<boolean>` and
  `orderRepo.cancelIfIn(id: string, from: OrderStatus[], reason: string, tx: Tx): Promise<boolean>`
  — Task 7 uses `cancelIfIn`.

- [ ] **Step 1: Write the failing test**

In `apps/master/e2e/02-payments.test.ts`, add after the `[issue 26]` test, inside
`describe('Payment legs', …)`:

```ts
  it('[PRD 14 G1] a cancel racing a confirm never cancels a paid bill', async () => {
    const report: string[] = [];
    let broken = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = await sentOrder([[w.items.somsa, 1]]); // 8 000
      const [confirm, cancel] = await Promise.all([
        w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 8000 }] }),
        w.admin.call('POST', `/api/orders/${id}/cancel`, { reason: 'Mehmon ketdi' }),
      ]);
      const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
      const payments = await env.prisma.payment.count({ where: { orderId: id } });
      report.push(`attempt ${attempt + 1}: confirm ${confirm.status}, cancel ${cancel.status}, order ${order.status}, payment rows ${payments}`);
      const bothWon = confirm.status < 300 && cancel.status < 300;
      const paidButCanceled = order.status === 'CANCELED' && payments > 0;
      if (bothWon || paidButCanceled) broken += 1;
    }
    expect(broken, report.join('\n')).toBe(0);
  });
```

- [ ] **Step 2: Run both race tests to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/02-payments.test.ts -t "issue 26|G1"
```

Expected: 2 failed. `[issue 26]` reports `payment rows 2`; `[PRD 14 G1]` reports attempts where
confirm and cancel both answered 200.

- [ ] **Step 3: Replace the two unconditional setters in the repository**

In `apps/master/src/main/server/repositories/order.repo.ts`, replace:

```ts
  async setClosed(id: string, closedAt = new Date(), tx?: Tx) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        status: OrderStatus.CLOSED,
        closedAt,
      },
    });
  },

  async setCanceled(id: string, reason: string, tx?: Tx) {
    return (tx ?? getPrisma()).order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELED,
        canceledAt: new Date(),
        cancelReason: reason,
      },
    });
  },
```

with:

```ts
  /**
   * SENT → CLOSED as one conditional statement — the first write of a confirm,
   * so a second confirm or a racing cancel finds the order no longer SENT and
   * writes nothing (PRD 14 G1). False when the order has left SENT.
   */
  async closeIfSent(id: string, closedAt: Date, tx: Tx): Promise<boolean> {
    const result = await tx.order.updateMany({
      where: { id, status: OrderStatus.SENT },
      data: { status: OrderStatus.CLOSED, closedAt },
    });
    return result.count === 1;
  },

  /**
   * → CANCELED, only from one of `from`, as one conditional statement
   * (PRD 14 G1). False when the order has left those states meanwhile.
   */
  async cancelIfIn(id: string, from: OrderStatus[], reason: string, tx: Tx): Promise<boolean> {
    const result = await tx.order.updateMany({
      where: { id, status: { in: from } },
      data: { status: OrderStatus.CANCELED, canceledAt: new Date(), cancelReason: reason },
    });
    return result.count === 1;
  },
```

- [ ] **Step 4: Make the confirm claim the bill first**

In `apps/master/src/main/server/services/order.service.ts`, inside `confirm`, replace:

```ts
      return getPrisma().$transaction(async (tx) => {
        const closedAt = new Date();

        await orderRepo.setApproval(
```

with:

```ts
      return getPrisma().$transaction(async (tx) => {
        const closedAt = new Date();

        // Claim the bill before writing anything else. A second confirm — another
        // station, a double tap, a retry after a timeout — or a racing cancel
        // finds it no longer SENT here and writes nothing (PRD 14 G1).
        if (!(await orderRepo.closeIfSent(order.id, closedAt, tx))) {
          const current = await orderRepo.findById(order.id, tx);
          throw Errors.IllegalStateTransition(current?.status ?? order.status, OrderStatus.CLOSED);
        }

        await orderRepo.setApproval(
```

Then replace:

```ts
        await printService.printBill(freshOrder, tx);

        const updated = await orderRepo.setClosed(order.id, closedAt, tx);
        if (!updated) {
          throw Errors.IllegalStateTransition(order.status, OrderStatus.CLOSED);
        }

        await auditService.log({
```

with:

```ts
        await printService.printBill(freshOrder, tx);

        await auditService.log({
```

Then replace:

```ts
        return mapToDto(updated);
      }, { timeout: 30_000, maxWait: 10_000 });
```

with:

```ts
        return mapToDto(await orderRepo.findById(order.id, tx));
      }, { timeout: 30_000, maxWait: 10_000 });
```

- [ ] **Step 5: Make the cancel claim the order first**

In the same file, inside `cancelOrder`, replace:

```ts
      return getPrisma().$transaction(async (tx) => {
        const updated = await orderRepo.setCanceled(order.id, input.reason, tx);
```

with:

```ts
      return getPrisma().$transaction(async (tx) => {
        // Claim the order first: if a confirm closed it meanwhile, the confirm
        // stands and this cancel writes nothing (PRD 14 G1).
        const claimed = await orderRepo.cancelIfIn(
          order.id,
          [OrderStatus.DRAFT, OrderStatus.SENT],
          input.reason,
          tx,
        );
        if (!claimed) {
          const current = await orderRepo.findById(order.id, tx);
          throw Errors.IllegalStateTransition(current?.status ?? order.status, OrderStatus.CANCELED);
        }
```

Then replace, further down in `cancelOrder`:

```ts
        deferEmit('admin', 'order:canceled', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:canceled', { orderId: order.id });

        return mapToDto(updated);
```

with:

```ts
        deferEmit('admin', 'order:canceled', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:canceled', { orderId: order.id });

        return mapToDto(await orderRepo.findById(order.id, tx));
```

- [ ] **Step 6: Run both race tests to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/02-payments.test.ts -t "issue 26|G1"
```

Expected: 2 passed. In every attempt one request answers 200 and the other 409.

- [ ] **Step 7: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  47 failed | 41 passed (88)`; `Tests  90 passed (90)`; `48`.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/repositories/order.repo.ts apps/master/src/main/server/services/order.service.ts apps/master/e2e/02-payments.test.ts
git commit -m "fix(orders): claim the order before a confirm or cancel writes" -m "Both checked the status before their transaction and then updated by id, so two confirms charged a bill twice and a cancel could cancel a paid bill. The status change is now the first write, conditional on the old status."
```

---

### Task 3: G7 — one SQLite connection for the master process

**Files:**
- Create: `apps/master/src/main/server/lib/sqlite-url.ts`, `apps/master/src/main/server/lib/sqlite-url.test.ts`
- Modify: `apps/master/src/main/server/lib/prisma.ts`
- Modify: `apps/master/src/main/server/middleware/requireAuth.ts:35`
- Test: `apps/master/e2e/13-contention.test.ts` (`[new] 78 writes back to back` exists)

**Interfaces:**
- Consumes: nothing new. Until Task 4 moves the print out of the transaction, a slow print holds
  this one connection; the branch merges whole, so no build ships that state.
- Produces: `singleConnectionUrl(url: string | undefined): string | undefined`.

Measured on 2026-09-30: the burst fails with ten unhandled `P1008` rejections ("Socket timeout").
`requireAuth.ts:35` fires `void sessionRepo.touchLastUsed(…)` on every request; on a second
connection it deadlocks against the request's own transaction until Prisma's 5 s timeout. A copy
of the whole suite run with `connection_limit=1` passed the burst and failed nothing new.

- [ ] **Step 1: Write the failing unit test**

Create `apps/master/src/main/server/lib/sqlite-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { singleConnectionUrl } from './sqlite-url';

describe('singleConnectionUrl', () => {
  it('adds a one-connection limit to a plain file URL', () => {
    expect(singleConnectionUrl('file:/app/apps/master/prisma/dev.db'))
      .toBe('file:/app/apps/master/prisma/dev.db?connection_limit=1');
  });

  it('keeps a Windows install path intact', () => {
    expect(singleConnectionUrl('file:C:/Users/till/AppData/Roaming/@chayxana/master/data/master.sqlite'))
      .toBe('file:C:/Users/till/AppData/Roaming/@chayxana/master/data/master.sqlite?connection_limit=1');
  });

  it('keeps parameters already on the URL', () => {
    expect(singleConnectionUrl('file:./dev.db?socket_timeout=10'))
      .toBe('file:./dev.db?socket_timeout=10&connection_limit=1');
  });

  it('overrides a larger limit', () => {
    expect(singleConnectionUrl('file:./dev.db?connection_limit=5')).toBe('file:./dev.db?connection_limit=1');
  });

  it('leaves a missing URL to Prisma', () => {
    expect(singleConnectionUrl(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run both to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/sqlite-url.test.ts
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/13-contention.test.ts -t "78 writes"
```

Expected: the unit run fails with `Failed to resolve import "./sqlite-url"`; the e2e run fails with
`unhandled rejections during the burst: expected [ 'P1008', …`.

- [ ] **Step 3: Write the helper**

Create `apps/master/src/main/server/lib/sqlite-url.ts`:

```ts
/**
 * The master is the only process that opens its SQLite file, so it needs one
 * connection. With several, a write the app does not await — the session touch
 * in requireAuth — can deadlock against a request's own transaction until
 * Prisma's 5 s socket timeout (P1008). Measured 2026-09-30 (PRD 14 G7).
 */
export function singleConnectionUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const at = url.indexOf('?');
  const base = at === -1 ? url : url.slice(0, at);
  const params = new URLSearchParams(at === -1 ? '' : url.slice(at + 1));
  params.set('connection_limit', '1');
  return `${base}?${params.toString()}`;
}
```

- [ ] **Step 4: Open the client through it**

In `apps/master/src/main/server/lib/prisma.ts`, replace:

```ts
import { PrismaClient } from '@prisma/client';
import { setupPrismaRuntime } from '../../prisma-runtime';
```

with:

```ts
import { PrismaClient } from '@prisma/client';
import { setupPrismaRuntime } from '../../prisma-runtime';
import { singleConnectionUrl } from './sqlite-url';
```

and replace:

```ts
    setupPrismaRuntime();
    prisma = new PrismaClient({
      log:
```

with:

```ts
    setupPrismaRuntime();
    const url = singleConnectionUrl(process.env.DATABASE_URL);
    prisma = new PrismaClient({
      ...(url ? { datasourceUrl: url } : {}),
      log:
```

- [ ] **Step 5: Make the session touch safe to leave unawaited**

In `apps/master/src/main/server/middleware/requireAuth.ts`, replace:

```ts
    void sessionRepo.touchLastUsed(session.id);
```

with:

```ts
    // Not awaited, so the request never waits on it — but it must never become
    // an unhandled rejection either (PRD 14 G7).
    sessionRepo.touchLastUsed(session.id).catch((error: unknown) => {
      console.error('[requireAuth] session touch failed', error);
    });
```

- [ ] **Step 6: Run both to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/sqlite-url.test.ts
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/13-contention.test.ts -t "78 writes"
```

Expected: 5 passed; 1 passed.

- [ ] **Step 7: Run the whole suite — every query now shares one connection**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  46 failed | 42 passed (88)`; `Test Files  9 passed (9)`, `Tests  95 passed (95)`;
`48`. A new failure here that mentions `P2024` or `P2028` means some code inside a transaction
queries through `getPrisma()` instead of `tx` and now waits on its own connection: pass it `tx`.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/lib/sqlite-url.ts apps/master/src/main/server/lib/sqlite-url.test.ts apps/master/src/main/server/lib/prisma.ts apps/master/src/main/server/middleware/requireAuth.ts
git commit -m "fix(db): one SQLite connection for the master process" -m "Writes at machine speed failed with P1008: the unawaited session touch on a second connection deadlocked against the request's own transaction until the 5 s timeout. The master is the only process on its database, so the client now opens one connection, and the touch can no longer become an unhandled rejection."
```

---

### Task 4: G6 — print the bill after the sale commits

**Files:**
- Modify: `apps/master/src/main/server/services/order.service.ts` (`confirm`: doc comment and the transaction statement)
- Modify: `apps/master/src/renderer/api/orders.ts` (`ConfirmResult`, `confirm`)
- Create: `apps/master/src/renderer/lib/confirm-result.ts`, `apps/master/src/renderer/lib/confirm-result.test.ts`
- Modify: `apps/master/src/renderer/pages/ApprovalQueuePage.tsx` (`confirmMutation`)
- Modify: `apps/master/gallery/fixtures/orders.ts` (confirm mock)
- Modify: `CLAUDE.md` ("Single confirm action")
- Test: `apps/master/e2e/13-contention.test.ts` (new test; the slow-print test exists)

**Interfaces:**
- Consumes: `orderRepo.closeIfSent` (Task 2); one connection (Task 3).
- Produces: `POST /api/orders/:id/confirm` answers `ConfirmResult = Order & { billPrinted: boolean; printError: string | null }`;
  `printFailureNotice(result: Pick<ConfirmResult, 'billPrinted' | 'printError'>): PrintFailureNotice | null`.

- [ ] **Step 1: Write the failing e2e test**

In `apps/master/e2e/13-contention.test.ts`, add inside `describe('Write contention', …)`, after the
slow-print test:

```ts
  it('[PRD 14 G6] a failed bill print leaves the sale closed, paid and reprintable', async () => {
    const id = await openOrder(w.w1, w.nextTable(), [[w.items.osh, 1]]);
    await sendOrder(w.w1, id);

    const { printService } = await import('../src/main/server/services/print.service');
    const spy = vi.spyOn(printService, 'printBill').mockRejectedValueOnce(new Error('Printer offline'));
    const confirm = await w.admin.call('POST', `/api/orders/${id}/confirm`, { payments: [{ method: 'CASH', amount: 45000 }] });
    spy.mockRestore();

    const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    const payments = await env.prisma.payment.count({ where: { orderId: id } });
    expect(
      { status: confirm.status, billPrinted: confirm.body?.billPrinted, order: order.status, payments },
      JSON.stringify(confirm.body?.error ?? ''),
    ).toEqual({ status: 200, billPrinted: false, order: 'CLOSED', payments: 1 });

    const reprint = await w.admin.call('POST', `/api/orders/${id}/reprint-bill`, { reason: 'Tasdiqlashda chop etilmadi' });
    expect(reprint.status).toBeLessThan(300);
  });
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/master/src/renderer/lib/confirm-result.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { printFailureNotice } from './confirm-result';

describe('printFailureNotice', () => {
  it('says nothing when the bill printed', () => {
    expect(printFailureNotice({ billPrinted: true, printError: null })).toBeNull();
  });

  it('tells the admin to check the printer and reprint', () => {
    const notice = printFailureNotice({ billPrinted: false, printError: 'Command failed: receipt.exe' });
    expect(notice?.title).toBe('Chek chiqmadi');
    expect(notice?.description).toContain('Printerni tekshiring');
  });

  it('points to Sozlamalar when no printer is chosen', () => {
    const notice = printFailureNotice({ billPrinted: false, printError: 'Admin printer not configured' });
    expect(notice?.description).toContain('Sozlamalarda');
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/13-contention.test.ts -t "slowly|G6"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/renderer/lib/confirm-result.test.ts
```

Expected: the e2e run shows 2 failed — the waiter's add waits for the one connection the printing
transaction holds and answers 201 after about 8 s, over the 2 s bound; the G6 test gets
`status: 500, order: 'SENT', payments: 0`. The unit run fails with
`Failed to resolve import "./confirm-result"`.

- [ ] **Step 4: Move the print out of the transaction**

In `apps/master/src/main/server/services/order.service.ts`, replace the doc comment above
`async confirm(` :

```ts
  /**
   * Combined "Tasdiqlash + To'lov" — the only path from SENT to CLOSED.
   *
   * Atomically: compute bill → validate payment sum → snapshot totals →
   * insert payments (and debt if any) → print bill (blocking) → set CLOSED →
   * audit ORDER_CONFIRMED → emit order:closed.
   *
   * If the bill print fails, the whole transaction rolls back; status stays SENT
   * so the admin can retry.
   */
```

with:

```ts
  /**
   * Combined "Tasdiqlash + To'lov" — the only path from SENT to CLOSED.
   *
   * One transaction: claim SENT → CLOSED → snapshot totals → insert payments
   * (and the debt, if any) → audit ORDER_CONFIRMED. After the commit: print the
   * bill, emit order:closed, fire the owner alerts.
   *
   * A failed print leaves the sale CLOSED and paid; the result says
   * `billPrinted: false` and the ticket offers a reprint (PRD 14 G6).
   */
```

Then, inside `confirm`, replace the whole statement that starts
`return getPrisma().$transaction(async (tx) => {` and ends
`}, { timeout: 30_000, maxWait: 10_000 });` with:

```ts
      await getPrisma().$transaction(async (tx) => {
        const closedAt = new Date();

        // Claim the bill before writing anything else. A second confirm — another
        // station, a double tap, a retry after a timeout — or a racing cancel
        // finds it no longer SENT here and writes nothing (PRD 14 G1).
        if (!(await orderRepo.closeIfSent(order.id, closedAt, tx))) {
          const current = await orderRepo.findById(order.id, tx);
          throw Errors.IllegalStateTransition(current?.status ?? order.status, OrderStatus.CLOSED);
        }

        await orderRepo.setApproval(
          order.id,
          input.requestingUser.id,
          input.discountId ?? null,
          input.waiveServiceCharge ?? false,
          tx,
        );
        await orderRepo.applyTotals(order.id, {
          subtotalSnapshot: totals.subtotal,
          discountAmountSnapshot: totals.discountAmount,
          serviceChargeSnapshot: totals.serviceCharge,
          totalSnapshot: totals.total,
        }, tx);

        await paymentRepo.createMany(order.id, input.payments, tx);

        if (debtPayment && input.debt) {
          await debtService.createFromClosedOrder({
            orderId: order.id,
            amount: debtPayment.amount,
            debtorName: input.debt.debtorName,
            debtorPhone: input.debt.debtorPhone,
            note: input.debt.note,
            actorUserId: input.requestingUser.id,
            openedAt: closedAt,
          }, tx);
        }

        await auditService.log({
          userId: input.requestingUser.id,
          action: 'ORDER_CONFIRMED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            discountId: input.discountId ?? null,
            discountAmount: input.discountAmount ?? null,
            waiveServiceCharge: input.waiveServiceCharge ?? false,
            total: totalDue,
            paymentMethods: input.payments.map((p) => p.method),
          },
        }, tx);

        deferEmit('admin', 'order:closed', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:closed', { orderId: order.id });

        // Owner alerts — fire only after this transaction commits. A large
        // discount and/or a nasiya sale are the two confirm-time events worth
        // pushing immediately.
        const orderNumber = order.id.slice(-6).toUpperCase();
        deferAfterCommit(() =>
          alertService.largeDiscount({
            orderNumber,
            discount: totals.discountAmount.toNumber(),
            total: totalDue,
            waiterName: order.waiter?.fullName ?? null,
          }),
        );
        if (debtPayment && input.debt) {
          const debtorName = input.debt.debtorName;
          const debtAmount = debtPayment.amount;
          deferAfterCommit(() =>
            alertService.debtSale({ orderNumber, debtorName, amount: debtAmount }),
          );
        }
      }, { timeout: 30_000, maxWait: 10_000 });

      // The bill prints after the sale commits (PRD 14 G6): a slow or jammed
      // printer never holds SQLite's write lock, and a failed print never undoes
      // a paid bill. The PrintJob row records the failure; the admin reprints.
      const closedOrder = await getOrderOrThrow(order.id);
      let printError: string | null = null;
      try {
        await printService.printBill(closedOrder);
      } catch (error) {
        printError = error instanceof Error ? error.message : 'Chek chop etilmadi';
      }

      return { ...mapToDto(closedOrder), billPrinted: printError === null, printError };
```

- [ ] **Step 5: Give the renderer the new answer**

In `apps/master/src/renderer/api/orders.ts`, add directly after the closing `}` of
`export interface ConfirmBody`:

```ts

/** What confirm answers: the closed order, and whether its bill printed (PRD 14 G6). */
export type ConfirmResult = Order & {
  billPrinted: boolean;
  printError: string | null;
};
```

and in `ordersApi` replace:

```ts
    api.post<Order>(`/api/orders/${id}/confirm`, body),
```

with:

```ts
    api.post<ConfirmResult>(`/api/orders/${id}/confirm`, body),
```

Create `apps/master/src/renderer/lib/confirm-result.ts`:

```ts
import type { ConfirmResult } from '@/api/orders';

export type PrintFailureNotice = {
  title: string;
  description: string;
};

/**
 * What the till says when a confirmed bill did not print, or null when it did.
 * The sale is closed either way (PRD 14 G6), so the notice names the fix, not
 * the error.
 */
export function printFailureNotice(
  result: Pick<ConfirmResult, 'billPrinted' | 'printError'>,
): PrintFailureNotice | null {
  if (result.billPrinted) return null;
  if (result.printError?.includes('not configured')) {
    return {
      title: 'Chek chiqmadi',
      description: "Hisob yopildi, pul yozildi. Chek printeri tanlanmagan: Sozlamalarda tanlang, keyin qayta chop eting.",
    };
  }
  return {
    title: 'Chek chiqmadi',
    description: "Hisob yopildi, pul yozildi. Printerni tekshiring, keyin chekni qayta chop eting.",
  };
}
```

- [ ] **Step 6: Show the failure on the Tasdiqlash screen**

In `apps/master/src/renderer/pages/ApprovalQueuePage.tsx`, add after the line
`import { OrderTicket } from '@/components/approval/OrderTicket';`:

```ts
import { printFailureNotice } from '@/lib/confirm-result';
```

and replace:

```ts
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      toast.success('Buyurtma tasdiqlandi');
      setSelectedId(null);
    },
```

with:

```ts
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setSelectedId(null);
      const notice = printFailureNotice(result);
      if (!notice) {
        toast.success('Buyurtma tasdiqlandi');
        return;
      }
      // The sale is closed; only the slip is missing. Keep the notice up until
      // the admin reprints or dismisses it.
      toast.error(notice.title, {
        description: notice.description,
        duration: Infinity,
        action: {
          label: 'Qayta chop etish',
          onClick: () => {
            ordersApi
              .reprintBill(result.id, 'Tasdiqlashda chop etilmadi')
              .then(() => toast.success('Chek chop etildi'))
              .catch((error: Error) => toast.error(error.message));
          },
        },
      });
    },
```

In `apps/master/gallery/fixtures/orders.ts`, replace:

```ts
    orders = orders.map((o) => (o.id === id ? closed : o));
    return json(closed);
```

with:

```ts
    orders = orders.map((o) => (o.id === id ? closed : o));
    return json({ ...closed, billPrinted: true, printError: null });
```

- [ ] **Step 7: Say it in CLAUDE.md**

In `CLAUDE.md`, replace the line that starts `- **Single confirm action**:` with:

```markdown
- **Single confirm action**: `POST /api/orders/:id/confirm` is the only path from `SENT` to `CLOSED`. One transaction claims the order (a conditional SENT→CLOSED update, so a second confirm writes nothing), snapshots totals and inserts `Payment`/`Debt` rows; the bill prints **after** the commit. A failed print leaves the bill CLOSED and paid with `billPrinted: false` in the response, and the Tasdiqlash screen offers "Qayta chop etish" (PRD 14 G1, G6).
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/13-contention.test.ts -t "slowly|G6"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/renderer/lib/confirm-result.test.ts
```

Expected: 2 passed (the waiter's add answers 201 in well under 2 s); 3 passed.

- [ ] **Step 9: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Expected: `Tests  45 failed | 44 passed (89)`; `Test Files  10 passed (10)`, `Tests  98 passed (98)`;
`48`; the renderer and gallery counts from Task 1, unchanged.

- [ ] **Step 10: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/services/order.service.ts apps/master/src/renderer/api/orders.ts apps/master/src/renderer/lib/confirm-result.ts apps/master/src/renderer/lib/confirm-result.test.ts apps/master/src/renderer/pages/ApprovalQueuePage.tsx apps/master/gallery/fixtures/orders.ts apps/master/e2e/13-contention.test.ts CLAUDE.md
git commit -m "fix(confirm): print the bill after the sale commits" -m "Printing inside the transaction held SQLite's write lock for up to 15 s, so every other station's write failed after 5 s, and a jammed printer made a paid bill impossible to close. A failed print now leaves the bill closed and paid, and the Tasdiqlash screen offers a reprint."
```

---

### Task 5: G2 — take a repayment off the balance atomically

**Files:**
- Modify: `apps/master/src/main/server/repositories/debt.repo.ts` (add `applyRepayment` after `update`)
- Modify: `apps/master/src/main/server/services/debt.service.ts` (`recordRepayment` transaction)
- Test: `apps/master/e2e/06-debts.test.ts` (both `[issue 29]` tests exist)

**Interfaces:**
- Consumes: nothing new.
- Produces: `debtRepo.applyRepayment(id: string, amount: Prisma.Decimal, tx: Tx): Promise<boolean>`.

- [ ] **Step 1: Run the existing tests to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/06-debts.test.ts -t "issue 29"
```

Expected: 2 failed — `balance left 30000 (should be 20000)` and
`Qarzlar balances add up to 200000; … Qarz qoldig'i 150000`.

- [ ] **Step 2: Add the conditional decrement**

In `apps/master/src/main/server/repositories/debt.repo.ts`, add after the `update` method:

```ts
  /**
   * Takes `amount` off an open balance in one statement. False when the debt is
   * not open or its balance is smaller than `amount` — a concurrent repayment
   * may have landed since it was read (PRD 14 G2).
   */
  async applyRepayment(id: string, amount: Prisma.Decimal, tx: Tx): Promise<boolean> {
    const result = await tx.debt.updateMany({
      where: {
        id,
        status: { in: [DebtStatus.OPEN, DebtStatus.PARTIAL] },
        remainingAmount: { gte: amount },
      },
      data: { remainingAmount: { decrement: amount } },
    });
    return result.count === 1;
  },
```

- [ ] **Step 3: Record the repayment through it**

In `apps/master/src/main/server/services/debt.service.ts`, inside `recordRepayment`, replace:

```ts
    await getPrisma().$transaction(async (tx) => {
      const repayment = await debtRepo.createRepayment({
        debt: { connect: { id: debt.id } },
        amount,
        method: input.method,
        paidAt: input.paidAt,
        note: input.note?.trim() || null,
        receivedBy: { connect: { id: input.actorUserId } },
      }, tx);

      const remainingAmount = debt.remainingAmount.minus(amount);
      const status = remainingAmount.isZero()
        ? DebtStatus.PAID
        : DebtStatus.PARTIAL;

      await debtRepo.update(debt.id, {
        remainingAmount,
        status,
        closedAt: remainingAmount.isZero() ? input.paidAt : null,
      }, tx);
```

with:

```ts
    await getPrisma().$transaction(async (tx) => {
      // Take the amount off the balance in one conditional statement, so two
      // repayments at the same moment both count and together can never
      // overpay (PRD 14 G2). The checks above only choose the error message.
      if (!(await debtRepo.applyRepayment(debt.id, amount, tx))) {
        const current = await debtRepo.findById(debt.id, tx);
        if (!current || current.status === DebtStatus.PAID || current.status === DebtStatus.WRITTEN_OFF) {
          throw Errors.DebtNotOpen();
        }
        throw Errors.DebtOverpay();
      }

      const repayment = await debtRepo.createRepayment({
        debt: { connect: { id: debt.id } },
        amount,
        method: input.method,
        paidAt: input.paidAt,
        note: input.note?.trim() || null,
        receivedBy: { connect: { id: input.actorUserId } },
      }, tx);

      const after = await debtRepo.findById(debt.id, tx);
      if (!after) {
        throw Errors.NotFound('Debt');
      }
      const remainingAmount = after.remainingAmount;
      const status = remainingAmount.isZero()
        ? DebtStatus.PAID
        : DebtStatus.PARTIAL;

      await debtRepo.update(debt.id, {
        status,
        closedAt: remainingAmount.isZero() ? input.paidAt : null,
      }, tx);
```

The two audit calls that follow still read `remainingAmount`; leave them as they are.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/06-debts.test.ts -t "issue 29"
```

Expected: 2 passed.

- [ ] **Step 5: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  43 failed | 46 passed (89)`; `48`.

- [ ] **Step 6: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/repositories/debt.repo.ts apps/master/src/main/server/services/debt.service.ts
git commit -m "fix(debts): take a repayment off the balance atomically" -m "The balance was read before the transaction and overwritten inside it, so two repayments at the same moment reduced it once. The decrement is now one conditional statement that also refuses an overpay."
```

---

### Task 6: G3 — whole so'm amounts and one Nasiya leg per bill

**Files:**
- Create: `apps/master/src/main/server/lib/money-input.ts`, `apps/master/src/main/server/lib/money-input.test.ts`
- Modify: `apps/master/src/main/server/controllers/orders.controller.ts:52`
- Modify: `apps/master/src/main/server/controllers/expense.controller.ts:8, 20`
- Modify: `apps/master/src/main/server/controllers/debt.controller.ts:13`
- Modify: `apps/master/src/main/server/middleware/errorHandler.ts`
- Modify: `apps/master/src/main/server/services/order.service.ts` (`confirm`: the DEBT leg)
- Test: `apps/master/e2e/02-payments.test.ts` (`[issue 27]` exists; `[issue 28]` is rewritten),
  `apps/master/e2e/05-expenses.test.ts` (`[latent] an avans return must be whole so'm` exists)

**Interfaces:**
- Consumes: nothing new.
- Produces: `somAmount` and `somLegAmount` (zod schemas; input `number | string`, output `number`).
  Keldi's `paidUzs` is already `z.number().int().positive()` and does not change.

The old `[issue 28]` test expected two Nasiya legs to open a debt for their sum. PRD 14 G3 chose to
refuse the second leg, so the test is rewritten to that rule.

- [ ] **Step 1: Rewrite the Nasiya-leg test to the decided rule**

In `apps/master/e2e/02-payments.test.ts`, replace the whole test that starts
`it('[issue 28] two Nasiya legs open debts for their full sum'` with:

```ts
  it('[issue 28] a second Nasiya leg is refused and nothing is written', async () => {
    const id = await sentOrder([[w.items.osh, 2]]); // 90 000
    const r = await w.admin.call('POST', `/api/orders/${id}/confirm`, {
      payments: [{ method: 'DEBT', amount: 50000 }, { method: 'DEBT', amount: 40000 }],
      debt: { debtorName: 'Ikki qism' },
    });
    const payments = await env.prisma.payment.count({ where: { orderId: id } });
    const debts = await env.prisma.debt.count({ where: { orderId: id } });
    const order = await env.prisma.order.findUniqueOrThrow({ where: { id } });
    expect(
      { status: r.status, payments, debts, order: order.status },
      JSON.stringify(r.body?.error ?? ''),
    ).toEqual({ status: 400, payments: 0, debts: 0, order: 'SENT' });
  });
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/master/src/main/server/lib/money-input.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { somAmount, somLegAmount } from './money-input';

describe('somAmount', () => {
  it("takes whole so'm as a number or a string of digits", () => {
    expect(somAmount.parse(45000)).toBe(45000);
    expect(somAmount.parse('45000')).toBe(45000);
  });

  it.each([0, -30000, 99999.5, '0', '-30000', '99999.5', '1e5', '', 'abc'])('refuses %j', (value) => {
    expect(somAmount.safeParse(value).success).toBe(false);
  });
});

describe('somLegAmount', () => {
  it('allows an empty leg of 0', () => {
    expect(somLegAmount.parse(0)).toBe(0);
    expect(somLegAmount.parse('0')).toBe(0);
  });

  it.each([-30000, 99999.5, '-4000', '12.5', '007'])('refuses %j', (value) => {
    expect(somLegAmount.safeParse(value).success).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/02-payments.test.ts e2e/05-expenses.test.ts -t "issue 27|issue 28|whole so"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/money-input.test.ts
```

Expected: 3 failed — `[issue 27]` answered 200, `[issue 28]` answered 200 with 2 payment rows,
the avans return answered 201. The unit run fails with `Failed to resolve import "./money-input"`.

- [ ] **Step 4: Write the so'm types**

Create `apps/master/src/main/server/lib/money-input.ts`:

```ts
import { z } from 'zod';

/**
 * A whole so'm amount above zero: 45000 or "45000" — never 99999.5, "1e5" or
 * -30000. Every amount that moves money uses it (PRD 14 G3).
 */
export const somAmount = z.union([
  z.number().int().positive(),
  z.string().regex(/^[1-9]\d*$/).transform(Number),
]);

/**
 * A payment leg: a whole so'm amount where 0 is allowed, because the ticket
 * sends empty legs and a fully discounted bill can pay 0.
 */
export const somLegAmount = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^(0|[1-9]\d*)$/).transform(Number),
]);
```

- [ ] **Step 5: Use them on every money field**

In `apps/master/src/main/server/controllers/orders.controller.ts`, add after
`import { z } from 'zod';`:

```ts
import { somLegAmount } from '../lib/money-input';
```

and inside `confirmSchema` replace:

```ts
    amount: z.union([z.number().int(), z.string().min(1)]),
```

with:

```ts
    amount: somLegAmount,
```

In `apps/master/src/main/server/controllers/expense.controller.ts`, add after
`import { z } from 'zod';`:

```ts
import { somAmount } from '../lib/money-input';
```

and replace both occurrences (in `createExpenseSchema` and `recordReturnSchema`) of:

```ts
  amount: z.union([z.number().positive(), z.string().min(1)]),
```

with:

```ts
  amount: somAmount,
```

In `apps/master/src/main/server/controllers/debt.controller.ts`, add after
`import { z } from 'zod';`:

```ts
import { somAmount } from '../lib/money-input';
```

and inside `repaymentSchema` replace:

```ts
  amount: z.union([z.number().positive(), z.string().min(1)]),
```

with:

```ts
  amount: somAmount,
```

- [ ] **Step 6: Answer 400, not 500, when a body fails its schema**

Replace the contents of `apps/master/src/main/server/middleware/errorHandler.ts` with:

```ts
import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // A body that fails its schema is the caller's mistake, not the server's:
  // answer 400 with the issues instead of a 500 (PRD 14 G3).
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION', message: "So'rov ma'lumotlari noto'g'ri", details: err.issues },
    });
    return;
  }

  console.error('[unhandled]', err);
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
};
```

- [ ] **Step 7: Refuse a second Nasiya leg**

In `apps/master/src/main/server/services/order.service.ts`, inside `confirm`, replace:

```ts
      const debtPayment = input.payments.find((payment) => payment.method === PaymentMethod.DEBT);
```

with:

```ts
      // One debtor per bill: a second Nasiya leg would be stored as a payment
      // but never become a debt (PRD 14 G3).
      const debtLegs = input.payments.filter((payment) => payment.method === PaymentMethod.DEBT);
      if (debtLegs.length > 1) {
        throw Errors.Validation("Bitta hisobda faqat bitta nasiya qatori bo'lishi mumkin");
      }
      const debtPayment = debtLegs[0];
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/02-payments.test.ts e2e/05-expenses.test.ts -t "issue 27|issue 28|whole so"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/money-input.test.ts
```

Expected: 3 passed; 16 passed.

- [ ] **Step 9: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  40 failed | 49 passed (89)`; `Test Files  11 passed (11)`, `Tests  114 passed (114)`; `48`.

- [ ] **Step 10: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/lib/money-input.ts apps/master/src/main/server/lib/money-input.test.ts apps/master/src/main/server/controllers/orders.controller.ts apps/master/src/main/server/controllers/expense.controller.ts apps/master/src/main/server/controllers/debt.controller.ts apps/master/src/main/server/middleware/errorHandler.ts apps/master/src/main/server/services/order.service.ts apps/master/e2e/02-payments.test.ts
git commit -m "fix(money): whole so'm amounts and one nasiya leg per bill" -m "The server accepted negative and fractional payment legs, fractional expenses, avans returns and repayments, and stored a second nasiya leg as a payment that never became a debt. Every money field now takes whole so'm, a second nasiya leg is refused, and a body that fails its schema answers 400 instead of 500."
```

---

### Task 7: G4 — draft cleanup cancels and returns its stock

**Files:**
- Modify: `apps/master/src/main/server/repositories/order.repo.ts` (add `listStaleDraftIds`)
- Modify: `apps/master/src/main/server/services/order.service.ts` (add `STALE_DRAFT_REASON`, `cancelStaleDraft`)
- Modify: `apps/master/src/main/server/lib/scheduler.ts` (`runDraftCleanup`, imports)
- Test: `apps/master/e2e/04-stock-cost.test.ts` (`[issue 7]` is rewritten)

**Interfaces:**
- Consumes: `orderRepo.cancelIfIn` (Task 2).
- Produces: `orderRepo.listStaleDraftIds(cutoff: Date, tx?: Tx): Promise<string[]>`;
  `orderService.cancelStaleDraft(orderId: string): Promise<boolean>`;
  `STALE_DRAFT_REASON = 'Avtomatik bekor qilindi: 12 soat yuborilmadi'`.

The old `[issue 7]` test expected the draft to be deleted. PRD 14 G4 keeps it as a CANCELED record.

- [ ] **Step 1: Rewrite the test to the decided rule**

In `apps/master/e2e/04-stock-cost.test.ts`, replace the whole test that starts
`it('[issue 7] when the automatic cleanup deletes a stale draft, its portions go back to stock'` with:

```ts
  it('[issue 7] the automatic cleanup cancels a stale draft and returns its portions to stock', async () => {
    const before = await itemState(env, w.items.somsa);
    const draftId = await openOrder(w.w2, w.nextTable(), [[w.items.somsa, 5]]); // never sent
    const taken = await itemState(env, w.items.somsa);
    expect(before.stock! - taken.stock!).toBe(5);
    const entriesBefore = await env.prisma.stockEntry.count({ where: { menuItemId: w.items.somsa } });

    setClock(new Date(Date.now() + 13 * 60 * 60 * 1000)); // 13 hours later
    await env.svc.scheduler.runDraftCleanup();

    const draft = await env.prisma.order.findUniqueOrThrow({ where: { id: draftId } });
    const after = await itemState(env, w.items.somsa);
    const entriesAfter = await env.prisma.stockEntry.count({ where: { menuItemId: w.items.somsa } });
    const audit = await env.prisma.auditLog.findFirst({ where: { entityId: draftId, action: 'ORDER_CANCELED' } });
    expect({
      status: draft.status,
      reason: draft.cancelReason,
      stock: after.stock,
      restoreEntries: entriesAfter - entriesBefore,
      automatic: (audit?.metadata as { automatic?: boolean } | null)?.automatic ?? false,
    }).toEqual({
      status: 'CANCELED',
      reason: 'Avtomatik bekor qilindi: 12 soat yuborilmadi',
      stock: before.stock,
      restoreEntries: 1,
      automatic: true,
    });
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/04-stock-cost.test.ts -t "issue 7"
```

Expected: 1 failed with `No Order found` — the cleanup deleted the draft.

- [ ] **Step 3: Let the repository list stale drafts**

In `apps/master/src/main/server/repositories/order.repo.ts`, add after `cancelIfIn`:

```ts
  /** Ids of drafts created before `cutoff`; the scheduler cancels them. */
  async listStaleDraftIds(cutoff: Date, tx?: Tx): Promise<string[]> {
    const rows = await (tx ?? getPrisma()).order.findMany({
      where: { status: OrderStatus.DRAFT, createdAt: { lt: cutoff } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  },
```

- [ ] **Step 4: Cancel a stale draft the way a person would**

In `apps/master/src/main/server/services/order.service.ts`, add after the line
`const ACTIVE_ORDER_STATUSES = [OrderStatus.DRAFT, OrderStatus.SENT] as const;`:

```ts

export const STALE_DRAFT_REASON = 'Avtomatik bekor qilindi: 12 soat yuborilmadi';
```

and add this method to `orderService`, directly after `cancelOrder`:

```ts
  /**
   * The scheduler's cancel for a draft left unsent for 12 hours: the same effect
   * as a person cancelling it — stock comes back through StockEntry rows and the
   * order stays as a record. AuditLog and StockEntry need a user, so the actor is
   * the draft's own waiter and the audit metadata says `automatic: true`
   * (PRD 14 G4). False when the draft was sent or cancelled meanwhile.
   */
  async cancelStaleDraft(orderId: string): Promise<boolean> {
    return completeEmitContext(async () => {
      const order = await getOrderOrThrow(orderId);
      if (order.status !== OrderStatus.DRAFT) return false;

      return getPrisma().$transaction(async (tx) => {
        if (!(await orderRepo.cancelIfIn(order.id, [OrderStatus.DRAFT], STALE_DRAFT_REASON, tx))) {
          return false;
        }

        for (const line of order.lines) {
          await maybeRestoreLineStock(line, order, order.waiterId, tx);
        }

        await auditService.log({
          userId: order.waiterId,
          action: 'ORDER_CANCELED',
          entityType: 'Order',
          entityId: order.id,
          metadata: {
            orderId: order.id,
            reason: STALE_DRAFT_REASON,
            fromStatus: OrderStatus.DRAFT,
            automatic: true,
          },
        }, tx);

        deferEmit('admin', 'order:canceled', { orderId: order.id });
        deferEmit(`waiter:${order.waiterId}`, 'order:canceled', { orderId: order.id });

        return true;
      });
    });
  },
```

- [ ] **Step 5: Point the scheduler at it**

In `apps/master/src/main/server/lib/scheduler.ts`, replace:

```ts
import { getPrisma } from './prisma';
import { financeReportService } from '../services/finance-report.service';
```

with:

```ts
import { orderRepo } from '../repositories/order.repo';
import { financeReportService } from '../services/finance-report.service';
import { orderService } from '../services/order.service';
```

and replace the whole `runDraftCleanup` function with:

```ts
export async function runDraftCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const staleIds = await orderRepo.listStaleDraftIds(cutoff);
    let canceled = 0;
    for (const id of staleIds) {
      if (await orderService.cancelStaleDraft(id)) canceled += 1;
    }
    if (canceled > 0) {
      console.log(`[scheduler] cancelled ${canceled} stale drafts`);
    }
  } catch (err) {
    console.error('[scheduler] draft cleanup failed:', err);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/04-stock-cost.test.ts -t "issue 7"
```

Expected: 1 passed.

- [ ] **Step 7: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  39 failed | 50 passed (89)`; `48`.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/repositories/order.repo.ts apps/master/src/main/server/services/order.service.ts apps/master/src/main/server/lib/scheduler.ts apps/master/e2e/04-stock-cost.test.ts
git commit -m "fix(scheduler): cancel stale drafts and return their stock" -m "The cleanup deleted drafts older than 12 hours with their lines, so the portions they had taken never came back and nothing recorded it. It now cancels them through the normal cancel path, with a reason and an automatic audit row."
```

---

### Task 8: G5 — lock the device that mistyped a PIN, not the floor

**Files:**
- Create: `apps/master/src/main/server/lib/pin-lockout.ts`, `apps/master/src/main/server/lib/pin-lockout.test.ts`
- Modify: `apps/master/src/main/server/services/auth.service.ts` (imports, `loginPin`)
- Modify: `apps/master/src/main/server/controllers/auth.controller.ts` (`loginPin`)
- Test: `apps/master/e2e/08-staff-access.test.ts` (`[misuse]` is rewritten, one test added)

**Interfaces:**
- Consumes: nothing new.
- Produces: `class PinLockout { lockedUntil(device, now): number | null; recordMiss(device, now): number | null; recordSuccess(device): void }`,
  the shared instance `pinLockout`, and
  `authService.loginPin(pin: string, deviceLabel: string | undefined, deviceKey: string)`.

Neither waiter app sends a `deviceLabel`, so the device is the client's address (`req.ip`). In the
container, a second phone is a second loopback address: `127.0.0.2`.

- [ ] **Step 1: Rewrite the e2e test and add the lock test**

In `apps/master/e2e/08-staff-access.test.ts`, add at the top, after the eslint comment line:

```ts
import { request } from 'http';
```

and add `setClock` to the harness import, so it reads:

```ts
import { Api, boot, buildWorld, capturePrints, n, openOrder, sale, sendOrder, setClock, type Env, type World } from './harness';
```

Add after the `afterAll(…)` block:

```ts
/** A PIN login from another phone on the LAN: a second loopback source address. */
function loginPinFrom(localAddress: string, pin: string): Promise<{ status: number; body: any }> {
  const url = new URL('/api/auth/login-pin', env.base);
  const payload = JSON.stringify({ pin });
  return new Promise((resolve, reject) => {
    const req = request({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      localAddress,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}
```

Replace the whole test that starts
`it('[misuse] five mistyped PINs by one waiter do not lock the other waiters out'` with:

```ts
  it('[misuse] five mistyped PINs on one phone do not lock the other waiters out', async () => {
    const attempts: number[] = [];
    for (let i = 0; i < 5; i += 1) attempts.push((await Api.rawLoginPin(env.base, '8642')).status);
    const other = await loginPinFrom('127.0.0.2', '4926'); // Bekzod's correct PIN, on his own phone
    expect(
      other.status,
      `five wrong PINs answered ${attempts.join(', ')}; then Bekzod's correct PIN from another phone answered ${other.status} ${JSON.stringify(other.body?.error ?? '')}`,
    ).toBe(200);
  });

  it('[PRD 14 G5] the phone that mistyped five times waits five minutes, even with a correct PIN', async () => {
    // Continues from the five misses above, all from 127.0.0.1.
    const locked = await Api.rawLoginPin(env.base, '5738'); // Aziz's correct PIN, same phone
    setClock(new Date(Date.now() + 5 * 60 * 1000 + 1000));
    const later = await Api.rawLoginPin(env.base, '5738');
    expect({ locked: locked.status, later: later.status }).toEqual({ locked: 423, later: 200 });
  });
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/master/src/main/server/lib/pin-lockout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PinLockout } from './pin-lockout';

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const FIVE_MINUTES = 5 * 60 * 1000;

describe('PinLockout', () => {
  it('lets a device miss four times without locking it', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) expect(lockout.recordMiss('10.0.0.5', T0)).toBeNull();
    expect(lockout.lockedUntil('10.0.0.5', T0)).toBeNull();
  });

  it('locks the device on the fifth miss, for five minutes', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.recordMiss('10.0.0.5', T0)).toBe(T0 + FIVE_MINUTES);
    expect(lockout.lockedUntil('10.0.0.5', T0 + FIVE_MINUTES - 1)).toBe(T0 + FIVE_MINUTES);
    expect(lockout.lockedUntil('10.0.0.5', T0 + FIVE_MINUTES)).toBeNull();
  });

  it('never locks another device', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 5; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.lockedUntil('10.0.0.6', T0)).toBeNull();
  });

  it('forgets the misses once the device logs in', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 4; i += 1) lockout.recordMiss('10.0.0.5', T0);
    lockout.recordSuccess('10.0.0.5');
    expect(lockout.recordMiss('10.0.0.5', T0)).toBeNull();
  });

  it('starts counting again after a lock expires', () => {
    const lockout = new PinLockout(5, FIVE_MINUTES);
    for (let i = 0; i < 5; i += 1) lockout.recordMiss('10.0.0.5', T0);
    expect(lockout.recordMiss('10.0.0.5', T0 + FIVE_MINUTES)).toBeNull();
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/08-staff-access.test.ts -t "misuse|G5"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/pin-lockout.test.ts
```

Expected: `[misuse]` fails — Bekzod's correct PIN from the other phone answered 423. `[PRD 14 G5]`
passes already: today's floor-wide lock also refuses that phone, and the test is there to keep the
device lock after the fix. The unit run fails with `Failed to resolve import "./pin-lockout"`.

- [ ] **Step 4: Write the lockout**

Create `apps/master/src/main/server/lib/pin-lockout.ts`:

```ts
export const PIN_MISS_LIMIT = 5;
export const PIN_LOCK_MS = 5 * 60 * 1000;

type Entry = { misses: number; lockedUntil: number | null };

/**
 * PIN misses and locks, per device. A PIN-only login cannot tell which waiter
 * mistyped, so the device that sent five PINs matching nobody waits five
 * minutes — never the whole floor (PRD 14 G5). In memory: a restart clears it.
 */
export class PinLockout {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly limit = PIN_MISS_LIMIT,
    private readonly lockMs = PIN_LOCK_MS,
  ) {}

  /** When the device's lock ends, or null when it may try. */
  lockedUntil(device: string, now: number): number | null {
    const entry = this.entries.get(device);
    if (!entry || entry.lockedUntil === null) return null;
    if (entry.lockedUntil <= now) {
      this.entries.delete(device);
      return null;
    }
    return entry.lockedUntil;
  }

  /** Counts a PIN that matched nobody; returns the lock's end when it locks. */
  recordMiss(device: string, now: number): number | null {
    const active = this.lockedUntil(device, now);
    if (active !== null) return active;
    const misses = (this.entries.get(device)?.misses ?? 0) + 1;
    if (misses >= this.limit) {
      const until = now + this.lockMs;
      this.entries.set(device, { misses: 0, lockedUntil: until });
      return until;
    }
    this.entries.set(device, { misses, lockedUntil: null });
    return null;
  }

  recordSuccess(device: string): void {
    this.entries.delete(device);
  }
}

export const pinLockout = new PinLockout();
```

- [ ] **Step 5: Compare the PIN first, then lock the device**

In `apps/master/src/main/server/services/auth.service.ts`, replace:

```ts
import { Session, User, UserRole } from '@prisma/client';
import { Errors } from '../lib/errors';
```

with:

```ts
import { Session, User } from '@prisma/client';
import { Errors } from '../lib/errors';
import { pinLockout } from '../lib/pin-lockout';
```

and replace the whole `loginPin` method with:

```ts
  /**
   * PIN login. The PIN is compared first, and only the matched waiter's own lock
   * applies to them. A PIN that matches nobody counts against the device it came
   * from — five lock that device for five minutes, never the floor (PRD 14 G5).
   * `deviceKey` is the client's address.
   */
  async loginPin(pin: string, deviceLabel: string | undefined, deviceKey: string): Promise<AuthResult> {
    const now = Date.now();
    const deviceLockedUntil = pinLockout.lockedUntil(deviceKey, now);
    if (deviceLockedUntil !== null) {
      throw Errors.Locked(new Date(deviceLockedUntil));
    }

    const waiters = await userRepo.findActiveByPin(pin);
    for (const waiter of waiters) {
      if (!waiter.pinHash) {
        continue;
      }
      if (await bcrypt.compare(pin, waiter.pinHash)) {
        ensureNotLocked(waiter);
        pinLockout.recordSuccess(deviceKey);
        return createSession(waiter, deviceLabel, new Date(now + 30 * 24 * 60 * 60 * 1000));
      }
    }

    const lockedUntil = pinLockout.recordMiss(deviceKey, now);
    if (lockedUntil !== null) {
      throw Errors.Locked(new Date(lockedUntil));
    }
    throw Errors.Unauthorized();
  },
```

In `apps/master/src/main/server/controllers/auth.controller.ts`, replace:

```ts
      const result = await authService.loginPin(body.pin, body.deviceLabel);
```

with:

```ts
      const result = await authService.loginPin(
        body.pin,
        body.deviceLabel,
        req.ip ?? req.socket.remoteAddress ?? 'unknown',
      );
```

- [ ] **Step 6: Run both to verify they pass**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts e2e/08-staff-access.test.ts -t "misuse|G5"
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run src/main/server/lib/pin-lockout.test.ts
```

Expected: 2 passed; 5 passed.

- [ ] **Step 7: Check nothing else moved**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
```

Expected: `Tests  38 failed | 52 passed (90)`; `Test Files  12 passed (12)`, `Tests  119 passed (119)`; `48`.

- [ ] **Step 8: Commit**

```bash
cd ~/dev/lab/project02-guards
git add apps/master/src/main/server/lib/pin-lockout.ts apps/master/src/main/server/lib/pin-lockout.test.ts apps/master/src/main/server/services/auth.service.ts apps/master/src/main/server/controllers/auth.controller.ts apps/master/e2e/08-staff-access.test.ts
git commit -m "fix(auth): lock the device that mistyped a PIN, not the floor" -m "Wrong PINs were charged to the first waiter in the list, and every login checked that waiter's lock before comparing the PIN, so five typos locked every waiter out. The PIN is now compared first, and misses lock only the device they came from."
```

---

### Task 9: Documents and handover

**Files:**
- Modify: `docs/CURRENT_WORKFLOW.md:73-84`
- Modify: `docs/prd/14-server-money-guards.md` (status line), `docs/prd/README.md` (row 14)
- Modify: `STATE.md` (NEXT ACTION item 3)

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: documents that match the code, and the handover.

- [ ] **Step 1: Correct the confirm section in CURRENT_WORKFLOW.md**

In `docs/CURRENT_WORKFLOW.md`, replace from the line
`Outside the transaction: re-read order → reject unless SENT → require debt metadata if any DEBT`
down to and including `confirm-time print failures leave no trace in the DB.)` with:

```markdown
Outside the transaction: re-read order → reject unless SENT (a fast path; the transaction decides)
→ refuse more than one DEBT leg → require debt metadata if a DEBT leg exists →
`billingService.computeTotals` → require `Σpayments === total` **exactly**. Every leg is a whole
so'm ≥ 0; a body that fails its schema answers 400.

Inside one `$transaction` (timeout 30s): claim the order with a conditional SENT→CLOSED update — a
second confirm or a racing cancel finds it no longer SENT and writes nothing → stamp approval →
write the four snapshot columns → insert `Payment` rows → create `Debt` if a DEBT leg exists →
write `ORDER_CONFIRMED` audit.

After commit: **print the bill**, then flush deferred socket emits, then fire Telegram owner alerts.

**A printer failure no longer undoes the sale** (PRD 14 G6). The bill stays CLOSED with its
payments, the `PrintJob` row is marked FAILED, and the response carries `billPrinted: false`; the
Tasdiqlash screen offers "Qayta chop etish" (`POST /api/orders/:id/reprint-bill`).
```

- [ ] **Step 2: Mark PRD 14 implemented**

In `docs/prd/14-server-money-guards.md`, replace:

```markdown
- **Status:** Decided 2026-09-30 — G1–G6 as Option A; G7 as Option B after measuring (§6, §7)
```

with:

```markdown
- **Status:** Implemented on `fix/server-money-guards` — G1–G6 as Option A, G7 as Option B;
  not released
```

In `docs/prd/README.md`, replace:

```markdown
| 14 | [Server money guards](14-server-money-guards.md) | Domain / correctness | Decided 2026-09-30 |
```

with:

```markdown
| 14 | [Server money guards](14-server-money-guards.md) | Domain / correctness | Implemented, not released |
```

- [ ] **Step 3: Move STATE.md on**

In `STATE.md`, replace item 3 of NEXT ACTION (from `3. Build the slices` down to
`Shipping needs items 4–5.`) with:

```markdown
3. Slice 1 (PRD 14, server guards) is built on `fix/server-money-guards`
   (`../project02-guards`): e2e 68 pass / 38 fail (106), `pnpm test` 142, typecheck 47. Merge
   it into `feat/auto-update` with Barkamol's go-ahead, from `~/dev/lab/project02`, setting
   aside his uncommitted CLAUDE.md and STATE.md first:
   `git stash push -m pre-merge CLAUDE.md STATE.md && git merge --no-ff fix/server-money-guards &&
   git stash pop`. Next: the design and plan for slice 2 in
   `docs/superpowers/specs/2026-09-30-money-rules-design.md` §7. Shipping needs items 4–5.
```

- [ ] **Step 4: Final verification**

```bash
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm exec vitest run --config vitest.e2e.config.ts 2>&1 | grep -E '^\s+Tests'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm test 2>&1 | grep -E '^\s+(Test Files|Tests)'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm typecheck 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:renderer 2>&1 | grep -c 'error TS'
docker exec -w /app/apps/master chayxana-guards-master-dev-1 pnpm run typecheck:gallery 2>&1 | grep -c 'error TS'
```

Expected: `Tests  38 failed | 52 passed (90)`; `Test Files  12 passed (12)`, `Tests  119 passed (119)`;
`48`; renderer and gallery at their Task 1 counts. The 38 failures are the defects later slices own;
none of them is a test listed in PRD 14 §5.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/lab/project02-guards
git add docs/CURRENT_WORKFLOW.md docs/prd/14-server-money-guards.md docs/prd/README.md STATE.md
git commit -m "docs: server money guards built, slice 1 of the money rules"
```

- [ ] **Step 6: Stop the container and hand over**

```bash
cd ~/dev/lab/project02-guards
docker compose -f compose.dev.yaml -f compose.e2e.yaml -p chayxana-guards down
```

Stop at "ready to merge". Report to Barkamol: the branch, the final counts, and the merge command
from Step 3. Nothing reaches a till until the update feed is restored and v0.1.5 is cut
(STATE items 4–5) — those are his to run.

---

## Deviations during execution

Executed 2026-09-30 and 2026-10-01 with superpowers:subagent-driven-development: 14 commits,
`e4082df..d04a2a8`, the Task 9 docs commit (`fc0e169`), then the final review's code commit
(`67455a1`) and docs commit. Each line below is a ruling made after a pre-flight audit of Tasks
2–8 against the code, after a task's review, or after the final review. It overrides the task text
above where they conflict, and none reverses a decision in PRD 14 §5–§6. The ledger that tracked
progress is not in git (`.superpowers/sdd/2026-09-30-server-money-guards/` in the main checkout).

**Pre-flight and Task 1**

- **Pre-flight, G6:** PRD 14 G6 A put a PENDING `PrintJob` inside the transaction; the plan prints
  after the commit through `printBill`, which writes its own row (none when no printer is chosen).
  Plan kept; the PRD wording was corrected in Task 9.
- **Pre-flight, G5:** the lock is per client address, so a shared till would lock everyone at it.
  Barkamol decided G5 A with that caveat (PRD 14 §6.2); recorded only.
- **Pre-flight, send:** `send` (DRAFT→SENT) reads and checks inside its own transaction, which
  SQLite serializes; it needed no claim.
- **Task 1 (`c04cbfe`):** the worktree was cut from `e4082df`, not `3f8d389`; every `docker exec`
  takes `-e NO_COLOR=1`, because the image sets `CI=1` and vitest colours the summary lines the
  greps read.
- **Task 1, fix round 1 (`d4a7157`):** the double-confirm plant also copies the first confirm's
  `ORDER_CONFIRMED` audit row and BILL `PrintJob` row, as a real double confirm left them; the test
  asserts the diagnostic's wording ("Confirmed twice: 2; printed as a bill twice: 2") and pins the
  four planted findings (double-charge 2 / 16 000, odd-legs 1 / −4 000, lost-nasiya-leg 1 / 40 000,
  repayment-race 1 / 5 000).
- **Task 1, fix round 1 (`d4a7157`):** the two-Nasiya plant uses `debt.update` by `orderId`
  (unique), so a missing Debt fails loudly instead of updating nothing; the plant comments are true
  at every commit, and the write-off comment the replacement swallowed is back.

**Task 2 — G1 (`b827140`)**

- `cancelOrder` claims from the status its checks ran against (`cancelIfIn(id, [order.status], …)`),
  not from `[DRAFT, SENT]`: the permission decision and the audit's `fromStatus` describe the
  transition actually made, and a cancel that loses a race to another transition answers 409. The
  G1 test asserts only that the confirm and the cancel never both win; the loser answers 409 or 403.
- After the claim, stock is restored from lines re-read inside the transaction, not from the read
  before it: a line added since was never restored, and one cancelled since would be restored twice.

**Task 3 — G7 (`83fc724`)**

- The `PrismaClient` also takes `transactionOptions: { maxWait: 10_000 }`: with one connection a
  `$transaction` waits for it, and Prisma's default 2 s turned that wait into P2028 for every
  transaction except confirm's, which already asked for 10 s.
- The 78-writes test also asserts that `[requireAuth] session touch failed` was never logged; with
  the new `.catch`, the unhandled-rejection check alone can no longer fail.
- A `getPrisma()` call inside a transaction shows as P2028 "Transaction already closed" at the
  transaction's timeout, not P2024; the audit found none among the 19 `$transaction` callbacks.

**Task 4 — G6 (`d0e4d9b`, `ddcb5fb`, `c5377eb`)**

- The print runs outside `completeEmitContext`, from the closed order read inside the transaction.
  The order is emits → print → owner alerts (`withEmitContext`, then explicit `flushDeferredEmits()`
  and `flushAfterCommit()`, `ddcb5fb`): the alerts await a Telegram call with no timeout and would
  otherwise hold the customer's slip (capped at 5 s each since the final review, F below). A new
  e2e test pins emit, emit, print, alert, alert.
- `printBill` writes a `PrintJob` only when a printer is chosen; with none it throws before any row
  exists. The docs say "the result says `billPrinted: false` and the admin reprints", not that a
  PrintJob always records the failure.
- The notice's "Qayta chop etish" is at least 48 px tall with 13 px text (per-toast
  `classNames.actionButton` with `!` modifiers, no inline style), and a failed reprint shows the
  same Uzbek notice again, never the server's English message.
- The notice gets a "Yopish" button and sits top-centre (`c5377eb`; bottom-centre since the final
  review, A below): it stays until dismissed, and at bottom-right it covered the next bill's
  TASDIQLASH. The same commit fixes a selection race on a slow confirm (`setSelectedId` by
  function) and shows a loading toast while a reprint waits in the print queue.
- New e2e assertions: `[issue 26]` counts a second bill print as broken and `[PRD 14 G1]` counts a
  cancelled order with a bill print as broken (the PRD's goal: charged, printed and closed once).
  New test `[PRD 14 G6] a slow reprint never fails a confirm of another bill`: at `83fc724` the
  confirm deadlocked until its 30 s timeout and answered 500.

**Task 5 — G2 (`4d6e50b`, `d48fa36`)**

- The write-off is race-safe too: it re-reads the debt inside its transaction, refuses unless OPEN
  or PARTIAL, records the balance it finds there and writes the status conditionally
  (`writeOffIfOpen`). New test `[PRD 14 G2] a write-off racing a repayment never miscounts the
  debt` fails on the old code every time (10 of 10).
- Repayments on a WRITTEN_OFF debt stay accepted (`d48fa36`), as before and as money rules D14 says
  (a payment later made on a written-off debt is Kirim on that day): `applyRepayment` allows OPEN,
  PARTIAL and WRITTEN_OFF with a balance at least the amount, and the status after follows today's
  rule. The plan's OPEN/PARTIAL-only condition would have refused them.
- The loser of two simultaneous write-offs answers `DEBT_ALREADY_WRITTEN_OFF`. The race test's
  invariant became: balance left + repayments recorded = the original, a debt repaid in full before
  the write-off is never WRITTEN_OFF, and the write-off's audit and alert amount is the balance at
  that moment. Two more tests: `[D14]` a payment on a written-off debt, and two repayments that
  together overpay.

**Task 6 — G3 (`c45fe9b`, `3891499`)**

- `somLegAmount` is named `somAmountOrZero` (it types payment legs, menu prices and discount
  presets); `somAmount` stays > 0. A number must be a safe integer (zod 4 `.int()` already refuses
  the rest) and a digit string has at most 15 digits.
- A Nasiya leg of 0 is refused with an Uzbek validation message: it would open a debt of 0 that can
  never be repaid.
- Menu `price` (create and update) and discount preset `value` are whole so'm, since they feed a
  bill total; a negative preset adds money to a bill through `Math.min(value, subtotal)`.
- Tan narx (`costPrice`) is **unchanged** (`3891499`). The plan made it `somAmount`, but Keldi
  "update cost" stores paid ÷ qty unrounded and the Menyu form sends it back on every save, so every
  edit of such a dish answered 400. A regression test covers it. The `c45fe9b` message still says
  tan narx is whole; it no longer is.

**Task 7 — G4 (`e020b94`)**

- The `[issue 7]` test expects no StockEntry row (a restore writes none): `stock: before.stock`
  proves the restore and the `automatic: true` audit row the record. The `cancelStaleDraft` comment
  says stock comes back through `stockService.restore`.
- `cancelStaleDraft` restores from lines re-read inside the transaction after the claim, as cancel
  does. `runDraftCleanup` catches per draft, so one failing draft is logged and the rest go on; a
  new test fails one of three drafts with a SQLite trigger.

**Task 8 — G5 (`3bd7b84`, `d04a2a8`)**

- The main typecheck floor is 47, not 48: the old `loginPin` carried a `User | undefined` argument
  error (`auth.service.ts:119`) that the rewrite removed.
- PRD 14 G5 A said the device is "client IP plus `deviceLabel`"; the code keys on the client
  address only (the label is client-supplied, so address-only is stricter). The PRD now says so.
- A device runs one PIN attempt at a time (`d04a2a8`). The review found that parallel requests all
  pass the lock check before the first miss is counted (a burst measured 7 evaluated guesses
  instead of 5) and that a late correct PIN erased an active lock (3 of 3); an overlapping attempt
  now answers 409 "Oldingi urinish hali tugamadi, biroz kuting".
- Not fixed, for Barkamol: a successful PIN login clears the device's misses, so under the
  30-per-minute limit on the route one device can have 24 guesses evaluated and 6 logins of its own
  a minute and never lock.
- Deploy note: the device key is the socket address, because the server binds `0.0.0.0` and sets no
  `trust proxy`. If a reverse proxy or a `::` bind is ever added, set `trust proxy` deliberately, or
  every client shares one key and a floor-wide lock returns.

**Task 9**

- The plan named four documents and a STATE.md anchor ("3. Build the slices") that no longer
  exists, and its counts were stale. The final list also covers `docs/AUDIT_FINDINGS.md`,
  `CLAUDE.md`, this section, and the diagnostic's PIN sentence in `e2e/prod-forensics.ts` (now past
  tense: it describes the floor-wide lock the old build had). Numbers verified in the container
  at `d04a2a8`: e2e 66 pass / 38 fail (104), `pnpm test` 136 tests in 13 files,
  `pnpm typecheck` 47, `typecheck:renderer` and `typecheck:gallery` 0 (the final numbers are under
  "Final review" below).
- STATE.md's built note replaced NEXT ACTION item 1 (the "Build slice 1" item), not item 3, and
  its merge command first sets aside Barkamol's uncommitted CLAUDE.md and STATE.md edits in
  `~/dev/lab/project02`, because git refuses the merge over them:
  `git stash push -m pre-merge CLAUDE.md STATE.md && git merge --no-ff fix/server-money-guards &&
  git stash pop`. Step 3 above now shows that form.
- Barkamol's instruction on 2026-10-01 (finish, commit, push as a separate branch) overrode the
  plan's "never push" for this branch. Merging, tagging and deploying stay his, and no pull request
  is opened.

**Final review (`67455a1`, then a docs commit)**

The final whole-branch review ("ready to push, with fixes") and the Task 9 docs review ran side by
side, and one fix pass took both lists (items A–S of `final-fix-wave.md` in the ledger directory):

- A. Every toast of the confirm loop sits bottom-centre, set per toast: at bottom-right the success
  toast covered the next bill's TASDIQLASH (a tap on its centre hit the toast, measured at
  1236 × 623), and top-centre covered the first queue rows. The global Toaster keeps the corner
  `docs/UI_UX_RULES.md` §8.6 sets.
- B. The print-failure notice starts with the bill's name — its table, or `Olib ketish #ABC123`
  without one — so stacked notices can be told apart.
- C. New e2e test: 30 wrong PINs at once from one address are judged at most 5 times and leave it
  locked (5 judged; 7 with the one-attempt check removed).
- D. The session touch writes `lastUsedAt` at most once a minute (a conditional `updateMany`;
  nothing reads it). New e2e test: two requests within a minute write it once; the old touch wrote
  twice.
- E. The Prisma client logs once that it opens one SQLite connection, with the URL it uses.
- F. Each owner alert waits at most 5 s for Telegram; a slower send finishes in the background with
  its error caught. Three unit tests with fake timers; two of them time out on the old `send`.
- G. `printBill` and `runQueuedJob` take no `tx`, and `printBill` says never to call it inside a
  transaction.
- H. `listStaleDraftIds` returns the oldest drafts first.
- I. `[issue 7]` asserts the audit actor is the draft's own waiter.
- J. `[issue 28]` asserts code `VALIDATION` besides the 400.
- K. Comments the branch had made wrong: `shutdown.ts` (a confirm caught by the shutdown is saved
  whole; at most its slip is lost), the header of `alert.service.ts`, `payment-legs.ts` (a zero
  Nasiya leg gets `VALIDATION`), `money-input.ts` (`somAmount` names its three users).
- L. `docs/PRD_FOUNDATION.md` §8 says a failed print never undoes a paid sale.
- M. `docs/CURRENT_WORKFLOW.md`'s line pointers re-checked (§4 combos, §10 stock and confirm rows),
  plus the behaviour above.
- N. PRD 14: STATE item numbers, line cites, the docs bullet, the rollback groups, three more §10
  items, the final numbers.
- O. This plan: Step 3's merge command and numbers, the Task 9 line above, this list. The deferred
  findings this pass fixed are gone from the list below, and two follow-ups that no committed file
  recorded (D18's doc and test alignment, CLAUDE.md's "Work in flight" block) are added to it.
- P. The merge state ("not merged") is written only in STATE.md, PRD 14's status line and
  `docs/prd/README.md` row 14.
- Q. CLAUDE.md's e2e snippet waits for `/tmp/ready`; `docs/AUDIT_FINDINGS.md` dates M-13
  2026-09-30; `docs/design/RENDERER_REBUILD.md` gives the typecheck floor as 47.
- R. STATE.md brings `chayxana-guards` down before item 2 starts `chayxana-e2e` (both bind host
  ports 4020 and 5199), and counts the extra commits.
- S. Final numbers, at `67455a1` in the container: e2e 68 pass / 38 fail (106), no test changing
  status against `d04a2a8`; `pnpm test` 142 tests in 14 files; `pnpm typecheck` 47;
  `typecheck:renderer` and `typecheck:gallery` 0.

## Deferred review findings

Smaller points the reviews raised and the plan did not act on. None changes a decision or blocks
the merge.

- `printFailureNotice` (`renderer/lib/confirm-result.ts`) tells "no printer chosen" apart by
  matching the server's English "not configured" text; a distinct error code would be sturdier.
- Notice colours differ between dev and a production build (CSS order against sonner's runtime
  style); the packaged app was not opened (PRD 14 §10).
- `orderRepo.setStatus` keeps an unconditional branch and has no callers: delete it, so every
  transition claims by construction.
- The loser of two confirms answers the English "Cannot transition from CLOSED to CLOSED" (409
  `ILLEGAL_STATE`), and the ticket shows it as sent.
- `apps/mobile/src/api/client.ts` treats every 401, a wrong PIN on `login-pin` included, as session
  loss; the order app guards with `&& token`.
- Menyu price and Chiqimlar amount have no whole-number pre-check: a typed fraction gets the generic
  "So'rov ma'lumotlari noto'g'ri". `DebtsPage.tsx` does not refetch after a repayment error (stale
  balance).
- Tests not written: the losing concurrent write-off (`DEBT_ALREADY_WRITTEN_OFF`), two simultaneous
  full repayments (409), and `requireAuth`'s `.catch`.
- "12 hours" is written twice (`scheduler.ts` and the cancel reason); `stopScheduler` does not
  interrupt a cleanup in progress (each cancel is atomic, so nothing breaks).
- `apps/master/e2e/` is outside every tsconfig, so it is never typechecked; the `sqlite-url` tests
  lack an empty string, a trailing `?` and a `%20` path.
- D18 lets ADMIN see profit, but `docs/CURRENT_WORKFLOW.md` §3, §11 #7 and §12 still call it a
  defect and `08-staff-access` `[issue 20]` still pins the old rule (money rules §5 withdraws the
  test). Align both in D18's slice.
- CLAUDE.md's "Work in flight" block (2026-08-18) still names `feat/remove-walkout` as the build
  the customer runs.
