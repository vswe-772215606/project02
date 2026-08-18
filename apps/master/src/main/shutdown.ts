/**
 * Ordered teardown of everything the master process owns, for the one case
 * that needs it: installing an update.
 *
 * Ordinary quits do not go through here. Today `will-quit` stops the mDNS
 * advert and nothing else — the HTTP server handle is function-local in
 * `startServer`, and `stopScheduler` / `disconnectPrisma` have no call sites at
 * all. That is survivable when Windows is about to reap the process anyway. It
 * is not survivable when NSIS is about to overwrite the binary and SQLite still
 * has an open handle on `master.sqlite`.
 *
 * ── Accepted race (RISK 7) ────────────────────────────────────────────────
 * There is no drain-mode middleware, so between step 3 (print queue drained)
 * and step 5 (HTTP closed) a waiter could still send an order or the admin
 * could confirm a tender. The window is two to three seconds, the waiter
 * notice goes out first so clients stop sending before the drain begins, and
 * nothing is lost either way: the bill print lives inside the closing
 * transaction, so an in-flight confirm either commits whole or rolls back
 * whole. Adding request-rejection middleware is real scope and was not taken.
 */

import type { Server } from 'http';
import { formatErrorForLog, type StartupLogger } from './startup-log';
import { SHUTDOWN_NOTICE } from './updater/updater-messages';

/** Whole-sequence budget for steps 1–7. Step 8 is never included in it. */
const TEARDOWN_BUDGET_MS = 25_000;
const PRISMA_TIMEOUT_MS = 5_000;

let httpServer: Server | null = null;
let teardownDone = false;

/**
 * Called from `index.ts` the moment the server object exists, because that is
 * the only scope it is otherwise reachable from.
 */
export function registerHttpServer(server: Server): void {
  httpServer = server;
}

/**
 * True once `shutdownForUpdate` has run, so `will-quit` does not repeat work
 * that has already happened.
 */
export function isUpdateTeardownDone(): boolean {
  return teardownDone;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T | void> {
  // The loser of the race is deliberately left running with its rejection
  // swallowed: abandoning a step must not turn into an unhandledRejection that
  // the process-level handler logs as a crash.
  promise.catch(() => undefined);
  return Promise.race([
    promise,
    new Promise<void>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      void promise.then(
        () => clearTimeout(timer),
        () => clearTimeout(timer),
      );
    }),
  ]);
}

type StepContext = {
  logger: StartupLogger;
  /** epoch ms after which steps 1–7 are abandoned. */
  deadline: number;
};

async function runStep(
  ctx: StepContext,
  index: number,
  label: string,
  timeoutMs: number,
  run: () => Promise<unknown> | unknown,
): Promise<void> {
  const remaining = ctx.deadline - Date.now();
  if (remaining <= 0) {
    ctx.logger.error(`[updater] teardown step ${index} (${label}) skipped: budget exhausted`);
    return;
  }

  try {
    const result = run();
    if (result instanceof Promise) {
      await withTimeout(result, Math.min(timeoutMs, remaining), `step ${index} (${label})`);
    }
    ctx.logger.info(`[updater] teardown step ${index} (${label}) done`);
  } catch (error) {
    ctx.logger.error(`[updater] teardown step ${index} (${label}) failed: ${formatErrorForLog(error)}`);
  }
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      // socket.io's own close() already closes the http server it was attached
      // to, so by the time we get here it is routinely closed already. That is
      // success, not a failure worth logging.
      if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });

    const closeAll = (server as Server & { closeAllConnections?: () => void }).closeAllConnections;
    if (typeof closeAll === 'function') {
      // `close()` on its own waits on keep-alive sockets forever, and every
      // waiter device holds one. Node 18.2+; Electron 31 ships Node 20.
      closeAll.call(server);
    }
  });
}

/**
 * Bring the master down cleanly so NSIS can replace the binary.
 *
 * Every step is individually wrapped: a throw or a timeout is logged and the
 * sequence continues, because an update that cannot start is worse than an
 * untidy socket close. Step 8 — closing SQLite — is the one that protects
 * data, so it runs even when the budget for steps 1–7 is blown, and it always
 * gets its full timeout.
 */
export async function shutdownForUpdate(logger: StartupLogger): Promise<void> {
  if (teardownDone) {
    logger.info('[updater] teardown already ran');
    return;
  }
  teardownDone = true;

  const ctx: StepContext = { logger, deadline: Date.now() + TEARDOWN_BUDGET_MS };
  logger.info('[updater] teardown begin');

  // 1. Stop new work first, or the finance and draft-cleanup intervals fire a
  //    Prisma write after $disconnect.
  await runStep(ctx, 1, 'scheduler', 1_000, async () => {
    const { stopScheduler } = await import('./server/lib/scheduler');
    stopScheduler();
  });

  // 2. Tell the waiters BEFORE the socket dies, so the order app and mobile
  //    show a reason instead of a silent dead connection. Every authenticated
  //    socket is in the `all` room. The pause lets the frames flush.
  await runStep(ctx, 2, 'notify waiters', 2_000, async () => {
    const { emitToRoom } = await import('./server/lib/socket-events');
    emitToRoom('all', 'server:shutdown', { reason: 'update', message: SHUTDOWN_NOTICE });
    await delay(300);
  });

  // 3. `confirm` prints the bill inside the closing transaction and a print
  //    failure rolls the whole tender back. Killing receipt.exe mid-spool is a
  //    lost sale.
  await runStep(ctx, 3, 'print queue', 5_000, async () => {
    const { printQueue } = await import('./server/lib/print-queue');
    await printQueue.onIdle();
  });

  // 4. Sockets. getIO() throws if the server never started — that is what the
  //    wrapper is for.
  await runStep(ctx, 4, 'socket.io', 2_000, async () => {
    const { getIO } = await import('./server/socket');
    const io = getIO();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  });

  // 5. HTTP.
  await runStep(ctx, 5, 'http server', 3_000, async () => {
    if (!httpServer) {
      throw new Error('http server was never registered');
    }
    await closeHttpServer(httpServer);
  });

  // 6. Long polling keeps the event loop alive and will fight the quit.
  await runStep(ctx, 6, 'telegram bot', 3_000, async () => {
    const { telegramBotService } = await import('./server/services/telegram-bot.service');
    await telegramBotService.stop();
  });

  // 7. `will-quit` fires this with `void` and does not preventDefault, so
  //    normally it is best-effort. Here it is awaited.
  await runStep(ctx, 7, 'mdns', 2_000, async () => {
    const { stopAdvertising } = await import('./mdns-advertise');
    await stopAdvertising();
  });

  // 8. The data-integrity step, outside the budget and never skipped. Closes
  //    SQLite so the journal is checkpointed before NSIS replaces the binary —
  //    and so Windows does not refuse the install over an open file handle.
  try {
    const { disconnectPrisma } = await import('./server/lib/prisma');
    await withTimeout(disconnectPrisma(), PRISMA_TIMEOUT_MS, 'step 8 (prisma)');
    logger.info('[updater] teardown step 8 (prisma) done');
  } catch (error) {
    logger.error(`[updater] teardown step 8 (prisma) failed: ${formatErrorForLog(error)}`);
  }

  logger.info('[updater] teardown end');
}
