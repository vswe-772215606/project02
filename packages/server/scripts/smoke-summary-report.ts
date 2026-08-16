// Smoke: summary report endpoint (/api/reports/summary).
// Verifies P&L identity and Cash-basis identity over a date range that
// includes today's activity. Also asserts that ingredient-purchase expense
// rows do NOT appear in pnl.expensesByCategory (only in cash.expensesByCategory).
//
// Prereq: dev:master running with the data left by prior smokes.

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
// Reports endpoint requires OWNER role (admin gets 403).
const OWNER_USER = { username: 'owner', password: 'owner123' };

const c = (code: number, s: string) => `\x1b[${code}m${s}\x1b[0m`;
const step = (n: string, msg: string) => console.log(`\n${c(36, `── ${n}`)} ${msg}`);
const ok = (msg: string) => console.log(`  ${c(32, '✓')} ${msg}`);
const note = (msg: string) => console.log(`    ${c(2, msg)}`);
const fail = (msg: string): never => { console.error(`  ${c(31, '✗')} ${msg}`); process.exit(1); };

async function http<T = unknown>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    fail(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log(c(35, '\n=== Summary report smoke ===\n'));

  step('1', 'Login owner');
  const { token } = await http<{ token: string }>('POST', '/api/auth/login', { body: OWNER_USER });
  ok('logged in');

  step('2', 'GET /api/reports/summary?from=today&to=today');
  const t = today();
  const report = await http<any>('GET', `/api/reports/summary?from=${t}&to=${t}`, { token });
  note(`range: ${report.from} → ${report.to}`);
  note(`income totals: qty=${report.incomes.totals.qty}, revenue=${report.incomes.totals.revenue}, cogs=${report.incomes.totals.cogs}`);

  step('3', 'P&L identity: revenue − cogs − operatingExpense == profit');
  const revenue = Number(report.pnl.revenue);
  const cogs = Number(report.pnl.cogs);
  const opex = Number(report.pnl.operatingExpense);
  const profit = Number(report.pnl.profit);
  const expected = revenue - cogs - opex;
  if (Math.abs(expected - profit) > 0.5) {
    fail(`P&L identity broken: ${revenue} − ${cogs} − ${opex} = ${expected}, got profit=${profit}`);
  }
  ok(`pnl identity holds: ${revenue} − ${cogs} − ${opex} = ${profit}`);

  step('4', 'Cash-basis identity: totalIn − totalOut == farq');
  const cashIn = Number(report.cash.totalIn);
  const cashOut = Number(report.cash.totalOut);
  const farq = Number(report.cash.farq);
  if (Math.abs((cashIn - cashOut) - farq) > 0.5) {
    fail(`Cash identity broken: ${cashIn} − ${cashOut} = ${cashIn - cashOut}, got farq=${farq}`);
  }
  ok(`cash identity holds: ${cashIn} − ${cashOut} = ${farq}`);

  step('5', 'pnl.expensesByCategory must NOT contain "Mahsulot xaridlari" (ingredient cat)');
  const ingredientInPnl = report.pnl.expensesByCategory.find((r: any) => r.categoryName === 'Mahsulot xaridlari');
  if (ingredientInPnl) {
    fail(`ingredient cat appeared in pnl.expensesByCategory — double-count risk! ${JSON.stringify(ingredientInPnl)}`);
  }
  ok('pnl excludes ingredient-purchase category (no double-count)');

  step('6', 'cash.expensesByCategory SHOULD contain ingredient cat (if any purchases today)');
  const ingredientInCash = report.cash.expensesByCategory.find((r: any) => r.categoryName === 'Mahsulot xaridlari');
  if (ingredientInCash) {
    ok(`cash includes "Mahsulot xaridlari" (${ingredientInCash.amount} so'm) ✓`);
  } else {
    note('No ingredient-purchase rows today — skipping cash-includes check');
  }

  step('7', 'Sum of incomes.byMenuCategory.revenue == incomes.totals.revenue');
  const summed = report.incomes.byMenuCategory.reduce((n: number, r: any) => n + Number(r.revenue), 0);
  const declared = Number(report.incomes.totals.revenue);
  if (Math.abs(summed - declared) > 0.5) {
    fail(`per-category sum ${summed} != totals.revenue ${declared}`);
  }
  ok(`per-category revenue sums correctly: ${summed}`);

  step('8', 'Try a wider range — last 7 days — and re-check identities');
  const past = new Date();
  past.setDate(past.getDate() - 7);
  const past7 = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
  const wider = await http<any>('GET', `/api/reports/summary?from=${past7}&to=${t}`, { token });
  const r2 = Number(wider.pnl.revenue), co2 = Number(wider.pnl.cogs), op2 = Number(wider.pnl.operatingExpense), p2 = Number(wider.pnl.profit);
  if (Math.abs((r2 - co2 - op2) - p2) > 0.5) fail('7-day P&L identity broken');
  const ci2 = Number(wider.cash.totalIn), cot2 = Number(wider.cash.totalOut), fq2 = Number(wider.cash.farq);
  if (Math.abs((ci2 - cot2) - fq2) > 0.5) fail('7-day cash identity broken');
  ok(`7-day range: P&L profit=${p2}, cash farq=${fq2}`);
  note(`per-menu-category rows in 7-day: ${wider.incomes.byMenuCategory.length}, per-expense-category P&L rows: ${wider.pnl.expensesByCategory.length}, cash rows: ${wider.cash.expensesByCategory.length}`);

  console.log(c(32, '\n=== Summary report smoke passed ===\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
