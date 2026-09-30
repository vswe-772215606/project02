/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Read-only diagnostic for a copy of the customer's master.sqlite.
 *
 * It measures, on real data, each cause the finance e2e suite reproduced.
 * The database is copied to a temp file first; the original is never opened.
 *
 *   pnpm exec tsx e2e/prod-forensics.ts /path/to/master.sqlite [--days=30] [--json]
 *
 * Personal data: debtor names are shown only as counts and totals. The bot
 * token is reported as set / not set, never printed.
 */
import { copyFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// ─── SQL helpers: Prisma stores DateTime as integer ms; Tashkent is UTC+5 ──

const sec = (c: string) =>
  `(CASE typeof(${c}) WHEN 'integer' THEN ${c}/1000 WHEN 'real' THEN CAST(${c}/1000 AS INTEGER) ELSE CAST(strftime('%s', ${c}) AS INTEGER) END)`;
const tday = (c: string) => `date(${sec(c)} + 18000, 'unixepoch')`;
const thm = (c: string) => `strftime('%H:%M', ${sec(c)} + 18000, 'unixepoch')`;

const words = (col: string, list: string[]) =>
  '(' + list.map((w) => `(' ' || lower(${col}) || ' ') LIKE '%${w.replace(/'/g, "''")}%'`).join(' OR ') + ')';

const PURCHASE_WORDS = [
  'go_sht', 'gosht', 'qassob', 'qo_y', 'tovuq', 'baliq', ' un ', 'guruch', 'yog', 'sabzi', 'piyoz', 'kartoshka',
  'pomidor', 'bodring', 'karam', 'sabzavot', 'meva', 'choy', ' non', 'sut', 'qatiq', 'qaymoq', 'tuxum', 'shakar',
  ' tuz', 'ziravor', 'masalliq', 'mahsulot', 'xarid', 'bozor', 'xamir', 'kabob', 'somsa', 'lagmon', 'osh ',
];
const PAY_WORDS = ['ofitsiant', 'xizmat', 'maosh', 'oylik', 'ish haq', 'zarplat', 'afitsant'];

export type Finding = {
  id: string;
  area: string;
  title: string;
  issue: string;
  count: number;
  amount: number | null;
  meaning: string;
  detail: string[];
};

export async function runForensics(dbPath: string, opts: { days?: number } = {}) {
  const days = opts.days ?? 30;
  const work = join(mkdtempSync(join(tmpdir(), 'chayxana-forensics-')), 'copy.sqlite');
  copyFileSync(dbPath, work);
  const db = new PrismaClient({ datasources: { db: { url: `file:${work}` } } });
  const q = async (sql: string): Promise<any[]> =>
    (await db.$queryRawUnsafe<any[]>(sql)).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])),
    );
  const one = async (sql: string) => (await q(sql))[0] ?? {};
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  const fmt = (v: unknown) => Math.round(num(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  try {
    // ─── Window: the last `days` Tashkent days that have a closed bill ────
    const span = await one(`SELECT MIN(d) first, MAX(d) last, COUNT(*) bills FROM (SELECT ${tday('closedAt')} d FROM "Order" WHERE status = 'CLOSED' AND closedAt IS NOT NULL)`);
    const to: string = span.last ?? new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const from: string = (await one(`SELECT date('${to}', '-${days - 1} days') d`)).d;
    const W = (c: string) => `${tday(c)} BETWEEN '${from}' AND '${to}'`;
    const settings = Object.fromEntries((await q(`SELECT key, value FROM Setting`)).map((r) => [r.key, r.value]));
    const maxDiscount = num(settings.max_discount_amount ?? 100000);
    const reportTime: string = settings.daily_report_telegram_time || '23:30';

    const overview = await one(`SELECT COUNT(*) bills, SUM(subtotalSnapshot) gross, SUM(discountAmountSnapshot) discount,
      SUM(subtotalSnapshot) - SUM(discountAmountSnapshot) netSales, SUM(serviceChargeSnapshot) service, SUM(totalSnapshot) total
      FROM "Order" WHERE status = 'CLOSED' AND ${W('closedAt')}`);
    const tenders = Object.fromEntries((await q(`SELECT p.method m, SUM(p.amount) a FROM Payment p JOIN "Order" o ON o.id = p.orderId
      WHERE o.status = 'CLOSED' AND ${W('o.closedAt')} GROUP BY p.method`)).map((r) => [r.m, num(r.a)]));
    const cogs = await one(`SELECT SUM(COALESCE(ol.cogsSnapshot, 0)) cogs FROM OrderLine ol JOIN "Order" o ON o.id = ol.orderId
      WHERE o.status = 'CLOSED' AND ol.isCanceled = 0 AND ${W('o.closedAt')}`);

    const findings: Finding[] = [];
    const add = (f: Finding) => findings.push(f);

    // ─── Profit inputs ────────────────────────────────────────────────────
    const noCost = await q(`SELECT mi.name, SUM(ol.quantity) qty, SUM(ol.quantity * ol.unitPriceSnapshot) revenue
      FROM OrderLine ol JOIN "Order" o ON o.id = ol.orderId JOIN MenuItem mi ON mi.id = ol.menuItemId
      WHERE o.status = 'CLOSED' AND ol.isCanceled = 0 AND mi.kind = 'FOOD' AND COALESCE(ol.cogsSnapshot, 0) = 0 AND ${W('o.closedAt')}
      GROUP BY mi.id ORDER BY revenue DESC`);
    const menuNoCost = await one(`SELECT SUM(CASE WHEN costPrice IS NULL THEN 1 ELSE 0 END) missing, COUNT(*) food FROM MenuItem WHERE kind = 'FOOD' AND isActive = 1`);
    add({
      id: 'no-tan-narx', area: 'Profit', issue: '4', title: 'Dishes sold with no tan narx (booked at 0 food cost)',
      count: noCost.length, amount: noCost.reduce((s, r) => s + num(r.revenue), 0),
      meaning: `Their whole price counts as profit. ${num(menuNoCost.missing)} of ${num(menuNoCost.food)} active dishes have no tan narx today.`,
      detail: noCost.slice(0, 15).map((r) => `${r.name}: ${fmt(r.qty)} portions, ${fmt(r.revenue)} so'm counted as 100% margin`),
    });

    const costed = await one(`SELECT SUM(COALESCE(ol.cogsSnapshot, 0)) cogs FROM OrderLine ol JOIN "Order" o ON o.id = ol.orderId
      WHERE o.status = 'CLOSED' AND ol.isCanceled = 0 AND COALESCE(ol.cogsSnapshot, 0) > 0 AND ${W('o.closedAt')}`);
    const purchaseLike = await q(`SELECT e.reason, e.amount, ${tday('e.occurredAt')} day, c.name category FROM Expense e JOIN ExpenseCategory c ON c.id = e.categoryId
      WHERE e.status = 'ACTIVE' AND e.categoryId <> 'seed-cat-ingredients' AND e.repayable = 0 AND ${W('e.occurredAt')} AND ${words('e.reason', PURCHASE_WORDS)}
      ORDER BY e.amount DESC`);
    const purchaseSum = purchaseLike.reduce((s, r) => s + num(r.amount), 0);
    const keldiNoPrice = await one(`SELECT COUNT(*) n, SUM(qty) qty FROM StockEntry WHERE kind = 'RESTOCK' AND paidUzs IS NULL AND ${W('occurredAt')}`);
    add({
      id: 'double-count', area: 'Profit', issue: '3', title: 'Food purchases filed as ordinary Chiqim while dishes carry a tan narx',
      count: purchaseLike.length, amount: Math.min(purchaseSum, num(costed.cogs)),
      meaning: `Profit already subtracts ${fmt(costed.cogs)} as Tan narxi; these ${fmt(purchaseSum)} of purchase-like Chiqim are subtracted again (up to the smaller of the two). Deliveries recorded without a price: ${num(keldiNoPrice.n)}. Review the list — matching is by keyword.`,
      detail: purchaseLike.slice(0, 20).map((r) => `${r.day} · ${r.category} · ${fmt(r.amount)} · ${r.reason}`),
    });

    // ─── Cash drawer ──────────────────────────────────────────────────────
    const cardRepaid = await one(`SELECT SUM(amount) a FROM DebtRepayment WHERE method = 'CARD' AND ${W('paidAt')}`);
    const cardIn = num(tenders.CARD) + num(cardRepaid.a);
    add({
      id: 'card-in-kassa', area: 'Cash', issue: '2', title: 'Card money inside "Kassa o\'zgarishi" / "Kassada"',
      count: cardIn > 0 ? 1 : 0, amount: cardIn,
      meaning: 'The till figures overstate the cash in the drawer by this amount over the period; a cash count can never match them.',
      detail: [`card sales ${fmt(tenders.CARD)}, card debt repayments ${fmt(cardRepaid.a)}`],
    });

    const crossDay = await q(`SELECT ${tday('r.occurredAt')} day, COUNT(*) n, SUM(r.amount) amount FROM Expense r JOIN Expense o ON o.id = r.reversedExpenseId
      WHERE r.status = 'REVERSAL' AND ${tday('r.occurredAt')} <> ${tday('o.occurredAt')} GROUP BY day ORDER BY day`);
    add({
      id: 'cross-day-reversal', area: 'Cash', issue: '25', title: 'Days holding a correction of an earlier day (all time)',
      count: crossDay.length, amount: crossDay.reduce((s, r) => s + num(r.amount), 0),
      meaning: 'On these days Chiqimlar "Jami chiqim" (net) is lower than the cash that left, and can go negative.',
      detail: crossDay.slice(0, 15).map((r) => `${r.day}: ${r.n} correction(s), ${fmt(r.amount)}`),
    });

    // ─── Payments ─────────────────────────────────────────────────────────
    const mismatch = await q(`SELECT o.id, o.totalSnapshot total, SUM(p.amount) paid, COUNT(p.id) legs, ${tday('o.closedAt')} day
      FROM "Order" o JOIN Payment p ON p.orderId = o.id WHERE o.status = 'CLOSED' GROUP BY o.id HAVING SUM(p.amount) <> o.totalSnapshot`);
    const doubleConfirm = await q(`SELECT entityId, COUNT(*) n FROM AuditLog WHERE action = 'ORDER_CONFIRMED' GROUP BY entityId HAVING COUNT(*) > 1`);
    const printedTwice = await q(`SELECT orderId, COUNT(*) n FROM PrintJob WHERE type = 'BILL' AND orderId IS NOT NULL GROUP BY orderId HAVING COUNT(*) > 1`);
    add({
      id: 'double-charge', area: 'Payments', issue: '26', title: 'Bills whose payments do not equal the bill (all time)',
      count: mismatch.length, amount: mismatch.reduce((s, r) => s + num(r.paid) - num(r.total), 0),
      meaning: `A double confirm records the payments twice. Confirmed twice: ${doubleConfirm.length}; printed as a bill twice: ${printedTwice.length}.`,
      detail: mismatch.slice(0, 15).map((r) => `${r.day} · #${String(r.id).slice(-6).toUpperCase()} · bill ${fmt(r.total)} · paid ${fmt(r.paid)} in ${r.legs} leg(s)`),
    });

    const negative = await one(`SELECT COUNT(*) n, SUM(amount) a FROM Payment WHERE amount < 0 OR amount <> CAST(amount AS INTEGER)`);
    add({
      id: 'odd-legs', area: 'Payments', issue: '27', title: 'Negative or fractional payment legs (all time)',
      count: num(negative.n), amount: num(negative.a),
      meaning: 'Only possible through the API; any row here means something other than the till posted payments.', detail: [],
    });

    const multiDebt = await q(`SELECT o.id, SUM(p.amount) legs, COUNT(p.id) n, d.originalAmount opened FROM "Order" o
      JOIN Payment p ON p.orderId = o.id AND p.method = 'DEBT' LEFT JOIN Debt d ON d.orderId = o.id
      GROUP BY o.id HAVING SUM(p.amount) <> COALESCE(d.originalAmount, 0)`);
    add({
      id: 'lost-nasiya-leg', area: 'Nasiya', issue: '28', title: 'Nasiya legs that never became a debt (all time)',
      count: multiDebt.length, amount: multiDebt.reduce((s, r) => s + num(r.legs) - num(r.opened), 0),
      meaning: 'Sold on credit, recorded as revenue, but nobody is recorded as owing it.', detail: [],
    });

    // ─── Nasiya ───────────────────────────────────────────────────────────
    const lostUpdate = await q(`SELECT d.id, d.originalAmount o, d.remainingAmount r, COALESCE(SUM(x.amount), 0) repaid FROM Debt d
      LEFT JOIN DebtRepayment x ON x.debtId = d.id WHERE d.writtenOffAt IS NULL GROUP BY d.id
      HAVING d.originalAmount - d.remainingAmount <> COALESCE(SUM(x.amount), 0)`);
    const outstanding = await one(`SELECT (SELECT COALESCE(SUM(remainingAmount), 0) FROM Debt WHERE status IN ('OPEN', 'PARTIAL')) live,
      (SELECT COALESCE(SUM(originalAmount), 0) FROM Debt WHERE writtenOffAt IS NULL)
        - (SELECT COALESCE(SUM(x.amount), 0) FROM DebtRepayment x JOIN Debt d ON d.id = x.debtId WHERE d.writtenOffAt IS NULL) events`);
    add({
      id: 'repayment-race', area: 'Nasiya', issue: '29', title: 'Debts whose balance disagrees with their repayments (all time)',
      count: lostUpdate.length, amount: lostUpdate.reduce((s, r) => s + num(r.repaid) - (num(r.o) - num(r.r)), 0),
      meaning: `Balances overstated by this amount: repayments were taken but not subtracted. Qarzlar shows ${fmt(outstanding.live)} owed; the reports rebuild ${fmt(outstanding.events)}.`, detail: [],
    });

    const writtenOff = await one(`SELECT COUNT(*) n, SUM(remainingAmount) a FROM Debt WHERE writtenOffAt IS NOT NULL`);
    add({
      id: 'debt-write-off', area: 'Nasiya', issue: '31', title: 'Written-off nasiya (all time)',
      count: num(writtenOff.n), amount: num(writtenOff.a),
      meaning: 'Counted in Sof sotuv when sold and never taken out of profit; the ledger shows it as repaid.', detail: [],
    });

    // ─── Expenses and avans ───────────────────────────────────────────────
    const backdated = await q(`SELECT e.reason, e.amount, ${tday('e.occurredAt')} bookedFor, ${tday('e.createdAt')} enteredOn,
      CAST(julianday(${tday('e.createdAt')}) - julianday(${tday('e.occurredAt')}) AS INTEGER) daysBack
      FROM Expense e WHERE e.status IN ('ACTIVE', 'REVERSED') AND ${tday('e.occurredAt')} < ${tday('e.createdAt')}
      ORDER BY e.amount DESC`);
    add({
      id: 'backdated', area: 'Expenses', issue: '5', title: 'Expenses booked into an earlier day (all time)',
      count: backdated.length, amount: backdated.reduce((s, r) => s + num(r.amount), 0),
      meaning: 'Each one changed a day after it was reported (Kassa o\'zgarishi and Sof foyda), and cannot be undone.',
      detail: backdated.slice(0, 15).map((r) => `entered ${r.enteredOn} for ${r.bookedFor} (${r.daysBack} day(s) back) · ${fmt(r.amount)} · ${r.reason}`),
    });

    const avansOff = await q(`SELECT e.amount, COALESCE((SELECT SUM(amount) FROM ExpenseReturn WHERE expenseId = e.id), 0) returned,
      ${tday('e.occurredAt')} given, ${tday('e.writtenOffAt')} off FROM Expense e WHERE e.repayable = 1 AND e.writtenOffAt IS NOT NULL`);
    const restated = avansOff.filter((r) => String(r.given) !== String(r.off));
    add({
      id: 'avans-write-off', area: 'Expenses', issue: '18', title: 'Avans written off on a later day than given (all time)',
      count: restated.length, amount: restated.reduce((s, r) => s + num(r.amount) - num(r.returned), 0),
      meaning: 'Each loss was booked back onto the day the avans was given, changing that day (and month) after it was reported.',
      detail: restated.slice(0, 15).map((r) => `given ${r.given}, written off ${r.off}: loss ${fmt(num(r.amount) - num(r.returned))}`),
    });

    const avansUndone = await one(`SELECT COUNT(*) n, SUM(amount) a FROM Expense WHERE repayable = 1 AND status = 'REVERSED'`);
    add({
      id: 'avans-undone', area: 'Expenses', issue: '30', title: 'Undone avans (all time)',
      count: num(avansUndone.n), amount: num(avansUndone.a),
      meaning: 'Each one pushed that day\'s Chiqim below zero (profit up by its amount) and stayed in Kutilayotgan qaytim.', detail: [],
    });

    const keldiUndone = await q(`SELECT mi.name, s.qty, s.paidUzs, ${tday('s.occurredAt')} day FROM StockEntry s JOIN Expense e ON e.id = s.expenseId
      JOIN MenuItem mi ON mi.id = s.menuItemId WHERE e.status = 'REVERSED'`);
    add({
      id: 'keldi-undone', area: 'Stock', issue: '19', title: 'Keldi payments undone while the stock stayed (all time)',
      count: keldiUndone.length, amount: keldiUndone.reduce((s, r) => s + num(r.paidUzs), 0),
      meaning: 'The count still includes these deliveries, and any tan narx they set is still in use.',
      detail: keldiUndone.slice(0, 15).map((r) => `${r.day} · ${r.name} +${r.qty} · ${fmt(r.paidUzs)}`),
    });

    // ─── Waiters and line edits ───────────────────────────────────────────
    const payLike = await q(`SELECT e.reason, e.amount, ${tday('e.occurredAt')} day, e.repayable FROM Expense e
      WHERE e.status IN ('ACTIVE', 'REVERSED') AND ${W('e.occurredAt')} AND ${words('e.reason', PAY_WORDS)} ORDER BY e.amount DESC`);
    add({
      id: 'waiter-pay', area: 'Staff', issue: '6', title: 'Xizmat haqi collected vs how waiter pay is recorded',
      count: payLike.length, amount: num(overview.service),
      meaning: `Xizmat haqi collected in the period: ${fmt(overview.service)} — waiters' money inside the till figures. Expenses that look like paying waiters: ${fmt(payLike.reduce((s, r) => s + num(r.amount), 0))} (these reduce profit for money never counted as income).`,
      detail: payLike.slice(0, 15).map((r) => `${r.day} · ${fmt(r.amount)} · ${r.reason}${r.repayable ? ' (avans)' : ''}`),
    });

    const cutAfterSend = await q(`SELECT mi.kind, COUNT(*) n, SUM(ol.quantity * ol.unitPriceSnapshot) value FROM OrderLine ol
      JOIN "Order" o ON o.id = ol.orderId JOIN MenuItem mi ON mi.id = ol.menuItemId
      WHERE ol.isCanceled = 1 AND o.sentAt IS NOT NULL AND ol.canceledAt > o.sentAt AND ${W('ol.canceledAt')} GROUP BY mi.kind`);
    add({
      id: 'lines-cut', area: 'Staff', issue: '24', title: 'Lines removed after the order was sent (no log, no name)',
      count: cutAfterSend.reduce((s, r) => s + num(r.n), 0), amount: cutAfterSend.reduce((s, r) => s + num(r.value), 0),
      meaning: 'Served food or Xizmat haqi taken off a bill with no record of who did it. Quantity cuts leave no trace at all.',
      detail: cutAfterSend.map((r) => `${r.kind}: ${r.n} line(s), ${fmt(r.value)}`),
    });

    const notWaiter = await q(`SELECT u.role, u.fullName, COUNT(*) n, SUM(o.totalSnapshot) total FROM "Order" o JOIN User u ON u.id = o.waiterId
      WHERE u.role <> 'WAITER' AND o.status = 'CLOSED' AND ${W('o.closedAt')} GROUP BY u.id`);
    const locked = await q(`SELECT fullName, failedLogins, lockedUntil FROM User WHERE role = 'WAITER' AND (failedLogins > 0 OR lockedUntil IS NOT NULL)`);
    add({
      id: 'attribution', area: 'Staff', issue: 'PIN', title: 'Bills taken under a non-waiter account; waiters with failed PINs',
      count: notWaiter.reduce((s, r) => s + num(r.n), 0), amount: notWaiter.reduce((s, r) => s + num(r.total), 0),
      meaning: 'Five wrong PINs anywhere lock every waiter out; bills then go under someone else\'s name, and so does their Xizmat haqi.',
      detail: [...notWaiter.map((r) => `${r.role} ${r.fullName}: ${r.n} bill(s), ${fmt(r.total)}`), ...locked.map((r) => `waiter ${r.fullName}: ${r.failedLogins} failed PIN(s) on record`)],
    });

    // ─── Discounts and timing ─────────────────────────────────────────────
    const disc = await one(`SELECT COUNT(*) n, SUM(discountAmountSnapshot) total, MAX(discountAmountSnapshot) max,
      SUM(CASE WHEN discountAmountSnapshot > ${maxDiscount} THEN 1 ELSE 0 END) aboveMax,
      SUM(CASE WHEN discountAmountSnapshot >= subtotalSnapshot AND subtotalSnapshot > 0 THEN 1 ELSE 0 END) fullComp
      FROM "Order" WHERE status = 'CLOSED' AND discountAmountSnapshot > 0 AND ${W('closedAt')}`);
    add({
      id: 'discounts', area: 'Discounts', issue: '15', title: 'Discounts in the period',
      count: num(disc.n), amount: num(disc.total),
      meaning: `Largest ${fmt(disc.max)}; above the "Maksimal" setting (${fmt(maxDiscount)}): ${num(disc.aboveMax)}; whole food bill given away: ${num(disc.fullComp)}. No reason is recorded for any of them.`,
      detail: [],
    });

    const late = await one(`SELECT COUNT(*) n, SUM(totalSnapshot) total FROM "Order" WHERE status = 'CLOSED' AND ${W('closedAt')} AND ${thm('closedAt')} >= '${reportTime}'`);
    const night = await one(`SELECT COUNT(*) n, SUM(totalSnapshot) total FROM "Order" WHERE status = 'CLOSED' AND ${W('closedAt')} AND ${thm('closedAt')} < '05:00'`);
    add({
      id: 'late-bills', area: 'Reports', issue: '22', title: `Bills closed after the nightly report time (${reportTime})`,
      count: num(late.n), amount: num(late.total),
      meaning: `Never in any scheduled report. Also ${num(night.n)} bill(s) (${fmt(night.total)}) closed between 00:00 and 05:00 count for the next calendar day.`,
      detail: [],
    });

    // ─── Stock ────────────────────────────────────────────────────────────
    const shrink = await q(`SELECT mi.name, SUM(s.countAfter - s.countBefore) diff, SUM((s.countAfter - s.countBefore) * COALESCE(mi.costPrice, 0)) value
      FROM StockEntry s JOIN MenuItem mi ON mi.id = s.menuItemId
      WHERE s.kind = 'COUNT' AND s.countBefore IS NOT NULL AND ${W('s.occurredAt')} GROUP BY mi.id HAVING diff < 0 ORDER BY value`);
    add({
      id: 'count-shrinkage', area: 'Stock', issue: '7', title: 'Portions missing at Sanoq (count lower than the system expected)',
      count: shrink.length, amount: -shrink.reduce((s, r) => s + num(r.value), 0),
      meaning: 'Includes portions taken by drafts the automatic cleanup deleted — they are never returned — as well as real loss.',
      detail: shrink.slice(0, 15).map((r) => `${r.name}: ${r.diff} portion(s), ${fmt(-num(r.value))} at tan narx`),
    });

    const neverCounted = await q(`SELECT name FROM MenuItem WHERE kind = 'FOOD' AND counted = 1 AND isActive = 1 AND stockCount IS NULL`);

    return {
      source: resolve(dbPath),
      period: { from, to, days, billsAllTime: num(span.bills), firstBill: span.first ?? null },
      overview: {
        bills: num(overview.bills), grossFood: num(overview.gross), discount: num(overview.discount), netSales: num(overview.netSales),
        service: num(overview.service), cash: num(tenders.CASH), card: num(tenders.CARD), nasiya: num(tenders.DEBT), foodCost: num(cogs.cogs),
      },
      settings: {
        nightlyReport: settings.daily_report_telegram_enabled === 'true' ? `on at ${reportTime}` : 'off',
        telegramBot: settings.telegram_bot_token ? 'set' : 'not set',
        ownerChat: settings.owner_telegram_chat_id ? 'set' : 'not set',
        lastNightlySent: settings.daily_report_last_sent_date || null,
        maxDiscount,
        alertDiscount: num(settings.alert_discount_threshold ?? 50000),
        alertExpense: num(settings.alert_expense_threshold ?? 500000),
      },
      neverCounted: neverCounted.map((r) => r.name),
      findings,
      fmt,
    };
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--')) ?? process.env.DB;
  if (!src) {
    console.error('usage: tsx e2e/prod-forensics.ts <path/to/master.sqlite> [--days=30] [--json]');
    process.exit(2);
  }
  const days = Number(args.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 30);
  const r = await runForensics(src, { days });
  if (args.includes('--json')) {
    const { fmt: _f, ...rest } = r;
    console.log(JSON.stringify(rest, null, 2));
    return;
  }
  const f = r.fmt;
  const o = r.overview;
  console.log(`Chayxana POS — money diagnostic\n${r.source}\nPeriod: ${r.period.from} … ${r.period.to} (${r.period.days} days; ${r.period.billsAllTime} bills all time since ${r.period.firstBill})\n`);
  console.log(`Bills ${o.bills} · food ${f(o.grossFood)} − Chegirma ${f(o.discount)} = Sof sotuv ${f(o.netSales)} · Xizmat haqi ${f(o.service)}`);
  console.log(`Naqd ${f(o.cash)} · Karta ${f(o.card)} · Nasiya ${f(o.nasiya)} · Tan narxi booked ${f(o.foodCost)}`);
  console.log(`Settings: nightly report ${r.settings.nightlyReport}; bot ${r.settings.telegramBot}; owner chat ${r.settings.ownerChat}; last nightly sent ${r.settings.lastNightlySent ?? '—'}; Maksimal ${f(r.settings.maxDiscount)}\n`);
  if (r.neverCounted.length) console.log(`Counted dishes never counted (cannot be sold): ${r.neverCounted.join(', ')}\n`);
  for (const x of r.findings) {
    const flag = x.count > 0 ? '●' : '○';
    console.log(`${flag} [${x.area} · issue ${x.issue}] ${x.title}: ${x.count}${x.amount !== null ? ` · ${f(x.amount)} so'm` : ''}`);
    console.log(`    ${x.meaning}`);
    for (const d of x.detail) console.log(`      - ${d}`);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
