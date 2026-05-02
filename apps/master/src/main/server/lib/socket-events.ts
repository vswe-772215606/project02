import { AsyncLocalStorage } from 'async_hooks';

type DeferredEmit = { room: string; event: string; payload: unknown };
type DeferredAfterCommit = () => void | Promise<void>;
type Bag = { emits: DeferredEmit[]; afterCommit: DeferredAfterCommit[] };

const als = new AsyncLocalStorage<Bag>();

export function withEmitContext<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ emits: [], afterCommit: [] }, fn);
}

export function deferEmit(room: string, event: string, payload: unknown): void {
  const bag = als.getStore();
  if (!bag) {
    emitToRoom(room, event, payload);
    return;
  }
  bag.emits.push({ room, event, payload });
}

export function deferAfterCommit(fn: DeferredAfterCommit): void {
  const bag = als.getStore();
  if (!bag) {
    void fn();
    return;
  }
  bag.afterCommit.push(fn);
}

export async function flushDeferredEmits(): Promise<void> {
  const bag = als.getStore();
  if (!bag) {
    return;
  }
  for (const emit of bag.emits) {
    emitToRoom(emit.room, emit.event, emit.payload);
  }
  bag.emits = [];
}

export async function flushAfterCommit(): Promise<void> {
  const bag = als.getStore();
  if (!bag) {
    return;
  }
  for (const fn of bag.afterCommit) {
    try {
      await fn();
    } catch (error) {
      console.error('[afterCommit failed]', error);
    }
  }
  bag.afterCommit = [];
}

export function emitToRoom(room: string, event: string, payload: unknown): void {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[socket-stub] room=${room} event=${event}`, payload);
  }
}
