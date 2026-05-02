import { getPrisma } from './prisma';

let interval: NodeJS.Timeout | null = null;

export async function runDraftCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const result = await getPrisma().order.deleteMany({
      where: {
        status: 'DRAFT',
        createdAt: { lt: cutoff },
        kitchenTickets: { none: {} },
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
  if (interval) return;
  // Run cleanup once on boot, then every 6 hours
  void runDraftCleanup();
  interval = setInterval(() => void runDraftCleanup(), 6 * 60 * 60 * 1000);
}

export function stopScheduler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
