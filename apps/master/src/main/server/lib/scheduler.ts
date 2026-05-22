import { getPrisma } from './prisma';
import { financeReportService } from '../services/finance-report.service';

let draftCleanupInterval: NodeJS.Timeout | null = null;
let financeInterval: NodeJS.Timeout | null = null;

export async function runDraftCleanup(): Promise<void> {
  try {
    const now = Date.now();
    // Empty drafts (no lines) are abandoned fast — a waiter opened a table
    // and walked away. Drafts with lines get a longer grace period.
    const emptyCutoff = new Date(now - 30 * 60 * 1000);
    const withLinesCutoff = new Date(now - 4 * 60 * 60 * 1000);
    const prisma = getPrisma();

    const emptyResult = await prisma.order.deleteMany({
      where: {
        status: 'DRAFT',
        createdAt: { lt: emptyCutoff },
        lines: { none: {} },
      },
    });
    const withLinesResult = await prisma.order.deleteMany({
      where: {
        status: 'DRAFT',
        createdAt: { lt: withLinesCutoff },
        lines: { some: {} },
      },
    });

    const count = emptyResult.count + withLinesResult.count;
    if (count > 0) {
      console.log(`[scheduler] cleaned ${count} stale drafts`);
    }
  } catch (err) {
    console.error('[scheduler] draft cleanup failed:', err);
  }
}

export function startScheduler(): void {
  if (draftCleanupInterval || financeInterval) return;
  // Run cleanup once on boot, then every hour
  void runDraftCleanup();
  draftCleanupInterval = setInterval(() => void runDraftCleanup(), 60 * 60 * 1000);

  void financeReportService.runScheduledDailyTelegram().catch((error) => {
    console.error('[scheduler] daily report send failed:', error);
  });
  void financeReportService.runScheduledMonthlyTelegram().catch((error) => {
    console.error('[scheduler] monthly report send failed:', error);
  });
  financeInterval = setInterval(() => {
    void financeReportService.runScheduledDailyTelegram().catch((error) => {
      console.error('[scheduler] daily report send failed:', error);
    });
    void financeReportService.runScheduledMonthlyTelegram().catch((error) => {
      console.error('[scheduler] monthly report send failed:', error);
    });
  }, 60 * 1000);
}

export function stopScheduler(): void {
  if (draftCleanupInterval) {
    clearInterval(draftCleanupInterval);
    draftCleanupInterval = null;
  }
  if (financeInterval) {
    clearInterval(financeInterval);
    financeInterval = null;
  }
}
