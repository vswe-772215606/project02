import { getPrisma } from './prisma';
import { financeReportService } from '../services/finance-report.service';

let draftCleanupInterval: NodeJS.Timeout | null = null;
let financeInterval: NodeJS.Timeout | null = null;

export async function runDraftCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const result = await getPrisma().order.deleteMany({
      where: {
        status: 'DRAFT',
        createdAt: { lt: cutoff },
      },
    });
    if (result.count > 0) {
      console.log(`[scheduler] cleaned ${result.count} stale drafts`);
    }
  } catch (err) {
    console.error('[scheduler] draft cleanup failed:', err);
  }
}

export function startScheduler(): void {
  if (draftCleanupInterval || financeInterval) return;
  // Run cleanup once on boot, then every 6 hours
  void runDraftCleanup();
  draftCleanupInterval = setInterval(() => void runDraftCleanup(), 6 * 60 * 60 * 1000);

  void financeReportService.runScheduledDailyTelegram().catch((error) => {
    console.error('[scheduler] finance report send failed:', error);
  });
  financeInterval = setInterval(() => {
    void financeReportService.runScheduledDailyTelegram().catch((error) => {
      console.error('[scheduler] finance report send failed:', error);
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
