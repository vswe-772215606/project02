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
