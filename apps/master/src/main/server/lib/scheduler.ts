import { orderRepo } from '../repositories/order.repo';
import { financeReportService } from '../services/finance-report.service';
import { orderService } from '../services/order.service';

let draftCleanupInterval: NodeJS.Timeout | null = null;
let financeInterval: NodeJS.Timeout | null = null;

export async function runDraftCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const staleIds = await orderRepo.listStaleDraftIds(cutoff);
    let canceled = 0;
    for (const id of staleIds) {
      // One draft that cannot be cancelled must not stop the rest. Its
      // transaction rolled back, so it is still a draft and the next run tries
      // it again.
      try {
        if (await orderService.cancelStaleDraft(id)) canceled += 1;
      } catch (err) {
        console.error(`[scheduler] stale draft ${id} not cancelled:`, err);
      }
    }
    if (canceled > 0) {
      console.log(`[scheduler] cancelled ${canceled} stale drafts`);
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
