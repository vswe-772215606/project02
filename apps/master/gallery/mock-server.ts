import { auditRoutes } from './fixtures/audit';
import { debtsRoutes } from './fixtures/debts';
import { discountsRoutes } from './fixtures/discounts';
import { expensesRoutes } from './fixtures/expenses';
import { financeRoutes } from './fixtures/finance';
import { menuRoutes } from './fixtures/menu';
import { ordersRoutes } from './fixtures/orders';
import { reportsRoutes } from './fixtures/reports';
import { settingsRoutes } from './fixtures/settings';
import { stockRoutes } from './fixtures/stock';
import { tablesRoutes } from './fixtures/tables';
import { usersRoutes } from './fixtures/users';
import type { RouteHandler } from './fixtures/util';

/**
 * A stand-in for the master's HTTP API, so the real pages can be looked at in
 * a browser on a machine that cannot run Electron.
 *
 * It stubs `window.fetch` rather than the api client, which means the pages,
 * their queries, their mutations and their cache invalidation all run exactly
 * as they do in the app — only the responses are invented. Each domain's seed
 * data and route handler lives in `gallery/fixtures/`; this file only
 * composes them in order and keeps the fall-through to the real network,
 * which in a browser simply fails — loudly, rather than silently — for
 * anything none of them model.
 */
const ROUTES: RouteHandler[] = [
  ordersRoutes,
  stockRoutes,
  menuRoutes,
  tablesRoutes,
  financeRoutes,
  expensesRoutes,
  debtsRoutes,
  discountsRoutes,
  settingsRoutes,
  usersRoutes,
  auditRoutes,
  reportsRoutes,
];

/** Replaces `window.fetch` for the preview only. */
export function installMockServer() {
  const original = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace('http://localhost:4000', '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};

    // A touch of latency so loading states are visible rather than skipped.
    await new Promise((resolve) => setTimeout(resolve, 120));

    for (const route of ROUTES) {
      const response = route(path, method, body);
      if (response) return response;
    }

    return original(input as RequestInfo, init);
  };
}
