# Phase 01-master / 04 — Printer integration

**Goal:** real receipt printing. C++ binary compiles to `apps/master/resources/bin/receipt.exe`. Node spawns it per print via `execFile`, serialized through a `p-queue` mutex. Bill approval blocks on print failure (transaction rolls back). Kitchen ticket printing is non-blocking. Every print attempt logs to `PrintJob`. A "Hello World" smoke test prints physical paper.

**Prerequisites:** `01-master/03-api-and-auth.md` complete and verified. **Plus:** the human has installed the actual thermal printer on the Master PC, configured its Windows printer name (e.g., `POS-80`), and verified Windows can print a test page to it.

**Estimated scope:** medium. The C++ source already exists (the user has provided it from a previous project — adapt to the new schema). Most of this phase is the Node-side print service and the integration into the order flow.

---

## Read these files before starting

- `docs/agent-plans/README.md`
- `docs/agent-plans/00-shared/decisions.md` ← receipts and printer section
- `docs/agent-plans/00-shared/conventions.md`

## Context

Receipt printing is the only user-visible side effect of the master backend that involves hardware. Two receipt types in v1:

1. **Customer bill** — prints when admin approves. **Blocking**: if the print fails, the approval transaction rolls back and order stays at `BILL_REQUESTED`. The admin must fix the printer and retry.
2. **Kitchen ticket** — prints when an order is sent to the kitchen (or when an add-on creates a new ticket). **Non-blocking**: kitchen display is the source of truth; paper is a redundant copy. Failure is logged but doesn't fail the request. Kitchen printer is **optional** per installation — controlled by `kitchen_printer_enabled` setting.

The printer service is a separate **C++ binary** spawned per print:

```
Node backend
  ↓ execFile('receipt.exe', [printer, heading, orderInfo, items, subtotal, discount, total])
receipt.exe (lifecycle: 1 print = 1 process)
  ↓ ESC/POS commands via Win32 RAW spool
Thermal printer
```

This is the model the user has used successfully before (their existing `receipt.cpp` is in the conversation history; the agent will adapt it). The key architectural points:

- **Child process model**, not HTTP service. No long-running daemon.
- **Args (UTF-8 positional)**, not stdin or files.
- **Node-side mutex** (`p-queue` with `concurrency: 1`) prevents simultaneous spawns from colliding on the printer.
- **Discover-on-print health.** No proactive ping. The printer is "dead" only when a print attempt fails.
- **Multi-printer dispatcher.** Args[1] is the Windows printer name. Different prints can target different printers (admin vs kitchen).

## Tasks

### 1. Place / adapt the C++ source

**`apps/master/cpp/receipt.cpp`**

Adapt the user's existing `receipt.cpp` (which they shared earlier in the project) to the canonical 7-arg interface:

```
receipt.exe <printer> <heading> <orderInfo> <items> <subtotal> <discount> <total>
```

- All UTF-8.
- `<orderInfo>` is newline-separated lines.
- `<items>` is `;`-separated; each item is `name|qty|unit|total`.
- The C++ code formats ESC/POS RAW for an 80mm thermal printer and writes via `OpenPrinterW` / `StartDocPrinterW` / `WritePrinter`.
- The footer is "Xaridingiz uchun rahmat!" / "Yana tashrif buyuring".

Use the existing implementation verbatim if it matches this interface. If field names differ, adapt only the input parsing — keep ESC/POS sequences, error reporting, and Win32 calls as-is.

### 2. Build script for the binary

**`apps/master/scripts/build-printer.ps1`**

PowerShell script that compiles the C++ source. Two paths:

```powershell
# Try MSVC first; fall back to MinGW if cl.exe is unavailable.
$src = "$PSScriptRoot\..\cpp\receipt.cpp"
$out = "$PSScriptRoot\..\resources\bin\receipt.exe"
New-Item -Force -ItemType Directory -Path "$PSScriptRoot\..\resources\bin" | Out-Null

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if ($cl) {
  Write-Host "Using MSVC..."
  cl /EHsc /std:c++17 /O2 $src /link winspool.lib /OUT:$out
  exit $LASTEXITCODE
}

$gxx = Get-Command g++ -ErrorAction SilentlyContinue
if ($gxx) {
  Write-Host "Using MinGW g++..."
  g++ -std=c++17 -O2 $src -o $out -lwinspool
  exit $LASTEXITCODE
}

Write-Error "No C++ compiler found. Install MSVC Build Tools or MinGW."
exit 1
```

Add an equivalent bash script for cross-platform sanity (won't actually run on Mac/Linux, but document fallback):

**`apps/master/scripts/build-printer.sh`**

```bash
#!/bin/bash
# C++ printer is Windows-specific (uses winspool.lib).
# This binary cannot be built on Linux/Mac. On those platforms, document that
# the developer must skip Phase 04 verification or work on a Windows machine.
echo "C++ printer is Windows-only. Use build-printer.ps1 on a Windows machine."
exit 1
```

Update **`apps/master/package.json`** scripts:

```json
"scripts": {
  "dev": "electron-vite dev",
  "build": "electron-vite build",
  "build:printer": "powershell -ExecutionPolicy Bypass -File ./scripts/build-printer.ps1",
  "typecheck": "tsc --noEmit -p tsconfig.json",
  "lint": "echo 'no lint configured yet'"
}
```

Run the build:

```sh
cd apps/master
pnpm build:printer
cd ../..
```

Verify `apps/master/resources/bin/receipt.exe` exists.

### 3. Hello-World print test

**`apps/master/scripts/print-hello.ts`**

A minimal script that calls `receipt.exe` with hardcoded args. It does NOT go through the print service — it's a direct sanity check that the binary works.

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execFileAsync = promisify(execFile);

async function main() {
  const printer = process.env.PRINTER_NAME || 'POS-80';
  const binary = join(__dirname, '..', 'resources', 'bin', 'receipt.exe');

  const args = [
    printer,
    'Chayxana',
    'Buyurtma #TEST\nStol: Stol 1\nTur: Zalda\nSana: 02.05.2026 13:00',
    'Salat|1|20000|20000;Choy|2|5000|10000',
    '30000',
    '0',
    '30000',
  ];

  console.log('Calling:', binary);
  console.log('Args:', args);

  const result = await execFileAsync(binary, args, {
    timeout: 15000,
    windowsHide: true,
  });

  console.log('stdout:', result.stdout);
  console.log('stderr:', result.stderr);
  console.log('SUCCESS: paper should have printed');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
```

Run:

```sh
cd apps/master
PRINTER_NAME=POS-80 pnpm tsx scripts/print-hello.ts
cd ../..
```

(Use `set PRINTER_NAME=POS-80&&` syntax on Windows cmd, or `$env:PRINTER_NAME='POS-80';` in PowerShell.)

A receipt should print. If not, the agent must STOP and report the error to the human — the fix is environment-specific (printer name wrong, driver not installed, etc.) and the agent must not improvise.

### 4. Add the print queue mutex

```sh
cd apps/master
pnpm add p-queue
cd ../..
```

**`apps/master/src/main/server/lib/print-queue.ts`**

```ts
import PQueue from 'p-queue';

// Concurrency 1 = serialized prints across the whole process.
// Prevents two spawns from racing on the same physical printer.
export const printQueue = new PQueue({ concurrency: 1 });
```

### 5. Implement the binary resolver

**`apps/master/src/main/server/printer/binary-resolver.ts`**

Locates `receipt.exe` in dev mode (under `apps/master/resources/bin/`) and packaged mode (under `process.resourcesPath/bin/`).

```ts
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

const BINARY_NAME = process.platform === 'win32' ? 'receipt.exe' : 'receipt';

function candidates(): string[] {
  const out: string[] = [];
  if (app.isPackaged) {
    out.push(join(process.resourcesPath, 'bin', BINARY_NAME));
  }
  out.push(join(app.getAppPath(), 'resources', 'bin', BINARY_NAME));
  out.push(join(__dirname, '..', '..', '..', 'resources', 'bin', BINARY_NAME));
  return out;
}

export function resolveBinaryPath(): string | null {
  for (const c of candidates()) {
    if (existsSync(c)) return c;
  }
  return null;
}
```

### 6. Implement the receipt builders

**`apps/master/src/main/server/printer/receipt-builder.ts`**

Builds the 7 args for a customer bill:

```ts
import type { Order, OrderLine, Discount, Table } from '@prisma/client';
import { formatUZS, formatDateTimeUZ } from '../lib/format';

type OrderForReceipt = Order & {
  lines: OrderLine[];
  table: Table | null;
  appliedDiscount: Discount | null;
};

const SAFE = (s: string) => s.replace(/[|;\r\n]/g, ' ').trim();

export function buildBillArgs(
  order: OrderForReceipt,
  opts: { storeHeading: string },
): string[] {
  const subtotal = order.subtotalSnapshot?.toString() ?? '0';
  const discount = order.discountAmountSnapshot?.toString() ?? '0';
  const total = order.totalSnapshot?.toString() ?? '0';

  const orderInfoLines: string[] = [`Buyurtma #${order.id.slice(-6)}`];
  if (order.orderType === 'DINE_IN' && order.table) {
    orderInfoLines.push(`Stol: ${order.table.name}`);
  }
  orderInfoLines.push(`Tur: ${order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}`);
  orderInfoLines.push(`Sana: ${formatDateTimeUZ(order.approvedAt ?? new Date())}`);

  const items = order.lines
    .filter((l) => !l.isCanceled)
    .map((l) =>
      [
        SAFE(l.nameSnapshot),
        l.quantity.toString(),
        l.unitPriceSnapshot.toString(),
        (Number(l.unitPriceSnapshot) * l.quantity).toString(),
      ].join('|'),
    )
    .join(';');

  return [
    opts.storeHeading,
    orderInfoLines.map(SAFE).join('\n'),
    items,
    formatUZS(subtotal),
    formatUZS(discount),
    formatUZS(total),
  ];
}
```

Note: the C++ binary expects 7 args BUT the printer name is the first one — that's added at spawn time, not in the builder. The builder returns 6 strings; the print service prepends the printer name.

**`apps/master/src/main/server/printer/kitchen-ticket-builder.ts`**

Different format. Kitchen tickets show items with notes, no prices, large readable text. The format must still fit the 7-arg interface (the C++ binary doesn't know the difference between bill and ticket — it just formats whatever is given).

For kitchen tickets, the call uses these args:
- `printer`: kitchen printer name
- `heading`: short text like `"OSHXONA"` or table label
- `orderInfo`: lines like `"Buyurtma #ID\nStol: X\nVaqt: HH:MM"`
- `items`: same `;`-separated `name|qty|notes|""` format. Override the "total" field to be empty string or the note. Cosmetically the C++ binary treats it as a number column — for tickets, we put the **note** in the unit field and "" in the total. Discuss with the human if the C++ formatter needs a specific tweak; for v1 v ship as-is. Document trade-off.
- `subtotal`, `discount`, `total`: empty strings.

Alternatively, write a simplified ticket using the same binary by leaving totals empty. The current C++ binary will print a structured receipt regardless. For better aesthetics, the agent can extend the C++ binary in a follow-up phase to take a `mode` arg (`BILL` vs `KITCHEN`), but that's NOT in this phase. Use the existing binary as-is for both.

### 7. Implement the print service

**Replace** `apps/master/src/main/server/services/print.service.ts` (currently a stub) with a real implementation. Per `chayxana-pos-build-plan.md` section 5.9 with adjustments to match this codebase.

Key behaviors:

- `printBill(order)`:
  - Reads `admin_printer_name` from settings. If empty, throws `PrintFailed('Admin printer not configured')`.
  - Builds args via `buildBillArgs`.
  - Creates a `PrintJob` row with `status: PENDING, type: BILL`.
  - Submits to `printQueue.add(...)` which:
    - Resolves binary path.
    - Calls `execFile` with 15s timeout.
    - On success: marks job SUCCESS.
    - On failure: marks job FAILED with the error message; throws `Errors.PrintFailed(...)`.
  - Returns when print succeeds. Throws on failure (so the calling transaction rolls back).

- `tryPrintKitchenTicket(ticketId)`:
  - Reads `kitchen_printer_enabled`. If false, no-op.
  - Reads `kitchen_printer_name`. If empty, no-op.
  - Loads ticket with lines via `kitchenRepo.findByIdWithLines`.
  - Builds args via `buildKitchenTicketArgs`.
  - Creates `PrintJob` row.
  - Submits via the queue. Catches errors — does NOT throw (non-blocking).

- `reprintBill(order, requestingUserId, reason?)`:
  - Same as `printBill` but with `type: BILL_REPRINT`.
  - Audit-logs `RECEIPT_REPRINTED`.

### 8. Wire approval to use real print service

The order service's `approve` method already calls `printService.printBill` per phase 02. With the real implementation now in place, the blocking behavior automatically activates.

Verify in code review:

- `approve` opens a `prisma.$transaction`.
- Inside the transaction, the print call happens AFTER snapshot fields are written.
- If print throws, the transaction's `await` rejects, Prisma rolls back automatically.
- Status transition to `PENDING_PAYMENT` only happens AFTER the print succeeds.

### 9. Wire `send` and `addLine` to use real kitchen ticket print

Same as above — already wired via `deferAfterCommit(() => printService.tryPrintKitchenTicket(ticketId))`. With real implementation, it now does real work but stays non-blocking.

### 10. Add reprint endpoints/services

- `POST /api/orders/:id/reprint-bill` calls `printService.reprintBill(order, req.user.id, req.body.reason)`.
- `POST /api/kitchen/tickets/:id/reprint` calls `printService.tryPrintKitchenTicket(ticketId)` (or a `reprintKitchenTicket` method that's a thin wrapper logging RECEIPT_REPRINTED).

Already on the route list from phase 03; just verify they call the real service now.

## Constraints

- Do NOT modify the C++ binary's interface beyond ensuring it matches the 7-arg spec. Print-formatting tweaks happen in a future phase (or at deployment time once a real printer is in hand).
- Print queue concurrency is 1. Not 2. Not unbounded.
- Bill print is BLOCKING. Kitchen ticket print is NON-BLOCKING.
- Print attempts log to `PrintJob` regardless of outcome.
- Do NOT add proactive printer health-check polling. Discover-on-print only.
- Do NOT modify the order service's approve flow except where this phase explicitly says to.
- Verify every print action also writes to `PrintJob` for audit purposes.

## Verification gate

### V1. Binary exists

```sh
ls apps/master/resources/bin/receipt.exe
```

File present.

### V2. Hello-World prints

Verify with the human that paper actually came out of the printer when running:

```sh
cd apps/master
$env:PRINTER_NAME='POS-80'; pnpm tsx scripts/print-hello.ts
cd ../..
```

If no paper, STOP. Do not proceed.

### V3. Bill print via API end-to-end

While master is running, simulate the full flow via curl (similar to phase 03's V5):

1. Login admin → token.
2. Login waiter via PIN → create order, add items, send.
3. Login kitchen → mark ticket IN_PROGRESS, READY.
4. Login admin → request bill.
5. Approve via `POST /api/orders/:id/approve`.

Verify:

- A second receipt prints (the customer bill).
- Order status transitions to `PENDING_PAYMENT`.
- A `PrintJob` row exists with status SUCCESS, type BILL.

### V4. Bill print failure rolls back approval

Simulate a print failure: temporarily rename or move `receipt.exe` so it can't be found. Approve a bill via API.

Expected:

- 500 response with `code: "PRINT_FAILED"`.
- Order remains at `BILL_REQUESTED`.
- A `PrintJob` row exists with status FAILED and an error message.

Restore the binary. Re-approve the same order. Now succeeds.

### V5. Kitchen ticket print non-blocking

With kitchen printer disabled (default — `kitchen_printer_enabled = false`):

- Send an order. Order moves to SENT successfully. No paper from kitchen printer (none configured).
- `PrintJob` rows for KITCHEN_TICKET should not be created (since the service no-ops when disabled).

Enable kitchen printer (set `kitchen_printer_enabled = "true"` and `kitchen_printer_name = "POS-80"` for the test):

- Send another order. Paper comes out from kitchen printer.
- `PrintJob` row exists with status SUCCESS, type KITCHEN_TICKET.

Disable kitchen printer back to `false` after testing if the human prefers.

### V6. Concurrent prints serialize

Write a quick script that fires 3 bill approvals in rapid succession (e.g., approving 3 orders within 100ms via `Promise.all`). Watch the printer.

Expected: 3 receipts come out cleanly, one after the other. No garbled output. No interleaving.

If the agent's environment doesn't allow this (only one approver), document and skip — but flag for human to verify before going to production.

### V7. Reprint works

```sh
curl -X POST http://localhost:4000/api/orders/$ORDER_ID/reprint-bill \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"customer requested copy"}'
```

Paper prints. `AuditLog` shows `RECEIPT_REPRINTED`.

### V8. Typecheck

```sh
pnpm typecheck
```

Pass.

## Definition of done

- [ ] `apps/master/cpp/receipt.cpp` adapted and committed.
- [ ] `build:printer` script compiles to `resources/bin/receipt.exe`.
- [ ] Hello-World prints physical paper.
- [ ] Print service replaces stub with real implementation.
- [ ] Bill approval is blocking on print failure (V4 verified).
- [ ] Kitchen ticket print is non-blocking (V5 verified).
- [ ] Reprint endpoint produces paper and audit entry.
- [ ] Print queue serializes concurrent prints.
- [ ] `PrintJob` rows reflect every attempt with correct status.
- [ ] Typecheck passes.

When all are checked, stop. Wait for human approval before phase `01-master/05-admin-ui.md`.
