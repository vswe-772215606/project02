/* eslint-disable @typescript-eslint/no-explicit-any */
import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { vi } from 'vitest';

const DATA = join(__dirname, '.data');

// ─── HTTP client ──────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(readonly status: number, readonly body: unknown, what: string) {
    super(`${what} → HTTP ${status}: ${JSON.stringify(body)}`);
  }
}

type Raw = { status: number; body: any };

async function raw(base: string, method: string, path: string, body?: unknown, token?: string): Promise<Raw> {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body; keep the text
  }
  return { status: res.status, body: parsed };
}

export class Api {
  constructor(
    readonly base: string,
    public token: string,
    readonly who: string,
    private readonly cred: { username?: string; password?: string; pin?: string },
  ) {}

  static async login(base: string, username: string, password: string): Promise<Api> {
    const r = await raw(base, 'POST', '/api/auth/login', { username, password });
    if (r.status !== 200) throw new ApiError(r.status, r.body, `login ${username}`);
    return new Api(base, r.body.token, username, { username, password });
  }

  static async loginPin(base: string, pin: string, who = `waiter ${pin}`): Promise<Api> {
    const r = await raw(base, 'POST', '/api/auth/login-pin', { pin });
    if (r.status !== 200) throw new ApiError(r.status, r.body, `login-pin ${pin}`);
    return new Api(base, r.body.token, who, { pin });
  }

  static rawLoginPin(base: string, pin: string): Promise<Raw> {
    return raw(base, 'POST', '/api/auth/login-pin', { pin });
  }

  /** Sessions are single-device and expire; call after moving the clock. */
  async relogin(): Promise<void> {
    const fresh = this.cred.pin
      ? await Api.loginPin(this.base, this.cred.pin)
      : await Api.login(this.base, this.cred.username!, this.cred.password!);
    this.token = fresh.token;
  }

  call(method: string, path: string, body?: unknown): Promise<Raw> {
    return raw(this.base, method, path, body, this.token);
  }

  async get(path: string): Promise<any> {
    const r = await this.call('GET', path);
    if (r.status >= 300) throw new ApiError(r.status, r.body, `GET ${path} as ${this.who}`);
    return r.body;
  }

  async post(path: string, body: unknown = {}): Promise<any> {
    const r = await this.call('POST', path, body);
    if (r.status >= 300) throw new ApiError(r.status, r.body, `POST ${path} as ${this.who}`);
    return r.body;
  }

  async patch(path: string, body: unknown = {}): Promise<any> {
    const r = await this.call('PATCH', path, body);
    if (r.status >= 300) throw new ApiError(r.status, r.body, `PATCH ${path} as ${this.who}`);
    return r.body;
  }
}

// ─── Boot: fresh DB copy + prod-like seed + real app on an ephemeral port ─

export async function boot(name: string) {
  mkdirSync(DATA, { recursive: true });
  const dbPath = join(DATA, `t-${name}.db`);
  copyFileSync(join(DATA, 'template.db'), dbPath);
  process.env.DATABASE_URL = `file:${dbPath}`;

  const { getPrisma } = await import('../src/main/server/lib/prisma');
  const prisma = getPrisma();
  const { seedLikeProd } = await import('./seed-like-prod');
  await seedLikeProd(prisma);

  const { settingsService } = await import('../src/main/server/services/settings.service');
  await settingsService.loadAll();

  const { createApp } = await import('../src/main/server/app');
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const svc = {
    reports: (await import('../src/main/server/services/reports.service')).reportsService,
    finance: (await import('../src/main/server/services/finance.service')).financeService,
    expenses: (await import('../src/main/server/services/expense.service')).expenseService,
    telegram: (await import('../src/main/server/services/telegram-bot.service')).telegramBotService,
    financeReport: (await import('../src/main/server/services/finance-report.service')).financeReportService,
    scheduler: await import('../src/main/server/lib/scheduler'),
    time: await import('../src/main/server/lib/time'),
    settings: settingsService,
  };

  return {
    base,
    prisma,
    svc,
    dbPath,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type Env = Awaited<ReturnType<typeof boot>>;

// ─── Clock: the server runs in this process, so faking Date moves its clock ─

/** Tashkent wall-clock time, e.g. at('2026-09-28T10:00'). */
export const at = (local: string): Date => new Date(`${local}:00+05:00`);

export function setClock(d: Date): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(d);
}

// ─── Printer: the Linux stub logs the exact receipt.exe arguments ─────────

export type Bill = ReturnType<typeof parseBill>;

export function parseBill(args: string[]) {
  const [heading = '', info = '', items = '', subtotal = '0', discount = '0', total = '0'] = args;
  const num = (s: string) => Number(String(s).replace(/[^\d-]/g, ''));
  const lines = items
    ? items.split(';').map((row) => {
        const [name = '', qty = '0', unit = '0', amount = '0'] = row.split('|');
        return { name, qty: Number(qty), unit: num(unit), amount: num(amount) };
      })
    : [];
  // receipt.cpp prints: items, then "Jami:" subtotal, "Chegirma:" discount, "Umumiy:" total.
  return { heading, info, lines, jami: num(subtotal), chegirma: num(discount), umumiy: num(total), raw: args };
}

export function capturePrints() {
  const prints: Array<{ label: string; orderId: string; args: string[] }> = [];
  const original = console.log.bind(console);
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    const first = a[0];
    if (typeof first === 'string' && first.startsWith('[print-linux-stub]')) {
      const m = first.match(/order=(\S+)/);
      prints.push({ label: first, orderId: m?.[1] ?? '', args: (a[1] as { args: string[] }).args });
      return;
    }
    if (process.env.E2E_DEBUG) original(...a);
  });
  // "no socket attached" warnings from deferred emits — noise without Socket.io.
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  return {
    prints,
    restore: () => {
      spy.mockRestore();
      warnSpy.mockRestore();
    },
    billFor(orderId: string): Bill {
      const p = [...prints].reverse().find((x) => x.orderId === orderId);
      if (!p) throw new Error(`no bill printed for order ${orderId}`);
      return parseBill(p.args);
    },
  };
}

// ─── World: users, tables and a menu shaped like the customer's ───────────

export async function buildWorld(base: string) {
  const owner = await Api.login(base, 'owner', 'owner123');
  const admin = await Api.login(base, 'admin', 'admin123');
  const aziz = await owner.post('/api/users', { role: 'WAITER', fullName: 'Aziz', pin: '5738' });
  const bekzod = await owner.post('/api/users', { role: 'WAITER', fullName: 'Bekzod', pin: '4926' });
  const w1 = await Api.loginPin(base, '5738', 'Aziz');
  const w2 = await Api.loginPin(base, '4926', 'Bekzod');

  const tables: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    tables.push((await admin.post('/api/tables', { name: `Stol ${i}`, type: 'TABLE' })).id);
  }

  const cFood = (await admin.post('/api/menu/categories', { name: 'Taomlar' })).id;
  const cTea = (await admin.post('/api/menu/categories', { name: 'Choy va non' })).id;
  const cSvc = (await admin.post('/api/menu/categories', { name: 'Xizmat' })).id;
  const item = async (b: Record<string, unknown>) => (await admin.post('/api/menu/items', b)).id as string;

  const items = {
    // counted, with a tan narx
    osh: await item({ categoryId: cFood, name: 'Osh', price: 45000, mode: 'COUNTED', costPrice: 25000, initialCount: 50 }),
    somsa: await item({ categoryId: cFood, name: 'Somsa', price: 8000, mode: 'COUNTED', costPrice: 4000, initialCount: 100 }),
    // uncounted, no tan narx — how most dishes came out of the 13.08.2026 migration
    salat: await item({ categoryId: cFood, name: 'Achichuk', price: 20000, mode: 'UNCOUNTED' }),
    non: await item({ categoryId: cTea, name: 'Non', price: 3000, mode: 'UNCOUNTED' }),
    // uncounted, with a tan narx (the design's fix for the old 100%-margin items)
    choy: await item({ categoryId: cTea, name: 'Choy', price: 5000, mode: 'UNCOUNTED', costPrice: 1000 }),
    // the waiter's pay
    xizmat: await item({ categoryId: cSvc, name: 'Xizmat haqi', price: 5000, mode: 'SERVICE' }),
  };

  const world = {
    base,
    owner,
    admin,
    w1,
    w2,
    waiterIds: { w1: aziz.id as string, w2: bekzod.id as string },
    tables,
    items,
    nextTable: (() => {
      let i = 0;
      return () => tables[i++ % tables.length]!;
    })(),
    async relogin() {
      await owner.relogin();
      await admin.relogin();
      await w1.relogin();
      await w2.relogin();
    },
  };
  return world;
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

// ─── Orders ───────────────────────────────────────────────────────────────

export async function openOrder(waiter: Api, tableId: string, lines: Array<[string, number]>): Promise<string> {
  const o = await waiter.post('/api/orders', { orderType: 'DINE_IN', tableId });
  for (const [menuItemId, quantity] of lines) {
    await waiter.post(`/api/orders/${o.id}/items`, { menuItemId, quantity });
  }
  return o.id as string;
}

export async function sendOrder(waiter: Api, id: string): Promise<void> {
  await waiter.post(`/api/orders/${id}/send`);
}

/** Waiter takes the order and sends it; admin confirms it with `body`. */
export async function sale(w: World, waiter: Api, lines: Array<[string, number]>, body: Record<string, unknown>) {
  const id = await openOrder(waiter, w.nextTable(), lines);
  await sendOrder(waiter, id);
  const closed = await w.admin.post(`/api/orders/${id}/confirm`, body);
  return { id, closed };
}

export const n = (v: unknown): number => Number(v);

export async function itemState(env: Env, id: string) {
  const row = await env.prisma.menuItem.findUniqueOrThrow({ where: { id }, select: { stockCount: true, costPrice: true } });
  return { stock: row.stockCount, cost: row.costPrice === null ? null : Number(row.costPrice) };
}
