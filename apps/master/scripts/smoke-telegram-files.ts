/**
 * Telegram fayl saqlash smoke. PDF (kunlik hisobot) va Excel (Umumiy 4
 * sheet) generatori xatosiz ishlashini tekshiradi. Master server ishlamasa
 * ham (no Telegraf), reportsService va pdf-report bevosita chaqiriladi.
 *
 * Run: pnpm exec tsx scripts/smoke-telegram-files.ts [YYYY-MM-DD]
 */
import { generateDailyReportPdf } from '../src/main/pdf-report';
import { reportsService } from '../src/main/server/services/reports.service';
import { localDayKey, parseLocalDay } from '../src/main/server/lib/time';
import { getPrisma } from '../src/main/server/lib/prisma';
import { existsSync, readFileSync, statSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

async function checkPdf(dayKey: string): Promise<void> {
  const date = parseLocalDay(dayKey);
  const out = join(tmpdir(), `chayxana-smoke-${Date.now()}.pdf`);
  console.log(`[PDF] generating for ${dayKey} → ${out}`);
  const t0 = Date.now();
  await generateDailyReportPdf({ date, outputPath: out });
  const took = Date.now() - t0;

  if (!existsSync(out)) throw new Error('PDF not written');
  const stats = statSync(out);
  if (stats.size === 0) throw new Error('PDF is empty');
  // PDF magic header
  const head = readFileSync(out, { encoding: 'utf8', flag: 'r' }).slice(0, 5);
  if (!head.startsWith('%PDF-')) throw new Error(`bad PDF magic: ${JSON.stringify(head)}`);

  console.log(`[PDF] ✓ ${took}ms, ${(stats.size / 1024).toFixed(1)} KB, valid magic`);
  unlinkSync(out);
}

async function checkExcel(from: string, to: string): Promise<void> {
  // Inline replication of telegram-bot.service.ts's /excel flow without
  // Telegraf — same library, same writeFile.
  const ExcelJS = (await import('exceljs')).default;
  const report = await reportsService.summary({ from: parseLocalDay(from), to: parseLocalDay(to) });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Chayxana POS';
  wb.created = new Date();

  // 1) Kirimlar
  const incomesSheet = wb.addWorksheet('Kirimlar');
  incomesSheet.columns = [
    { header: 'Kategoriya', key: 'cat', width: 28 },
    { header: 'Soni', key: 'qty', width: 8 },
    { header: "Sotuv (so'm)", key: 'revenue', width: 16 },
    { header: "Tan narxi (so'm)", key: 'cogs', width: 16 },
    { header: "Foyda (so'm)", key: 'profit', width: 16 },
  ];
  for (const r of report.incomes.byMenuCategory) {
    incomesSheet.addRow({ cat: r.categoryName, qty: r.qty, revenue: Number(r.revenue), cogs: Number(r.cogs), profit: Number(r.profit) });
  }

  // 2) Foyda chiqimi
  const pnlSheet = wb.addWorksheet('Foyda chiqimi');
  pnlSheet.columns = [{ header: 'Kategoriya', key: 'cat', width: 28 }, { header: 'Summa', key: 'amount', width: 18 }];
  for (const r of report.pnl.expensesByCategory) {
    pnlSheet.addRow({ cat: r.categoryName, amount: Number(r.amount) });
  }
  pnlSheet.addRow({ cat: 'Sotuv', amount: Number(report.pnl.revenue) });
  pnlSheet.addRow({ cat: 'Tan narxi', amount: -Number(report.pnl.cogs) });
  pnlSheet.addRow({ cat: 'Chiqim', amount: -Number(report.pnl.operatingExpense) });
  pnlSheet.addRow({ cat: 'SOF FOYDA', amount: Number(report.pnl.profit) });

  // 3) Pul harakati
  const cashSheet = wb.addWorksheet('Pul harakati');
  cashSheet.columns = [{ header: 'Kategoriya', key: 'cat', width: 28 }, { header: 'Summa', key: 'amount', width: 18 }];
  for (const r of report.cash.expensesByCategory) {
    cashSheet.addRow({ cat: r.categoryName, amount: Number(r.amount) });
  }
  cashSheet.addRow({ cat: 'Jami kelgan', amount: Number(report.cash.totalIn) });
  cashSheet.addRow({ cat: 'Jami ketgan', amount: -Number(report.cash.totalOut) });
  cashSheet.addRow({ cat: 'FARQ', amount: Number(report.cash.farq) });

  // 4) Yakun
  const summarySheet = wb.addWorksheet('Yakun');
  summarySheet.columns = [
    { header: "Ko'rsatkich", key: 'k', width: 30 },
    { header: 'Sof foyda', key: 'pnl', width: 18 },
    { header: 'Pul harakati', key: 'cash', width: 18 },
  ];
  summarySheet.addRow({ k: 'Davr boshi', pnl: report.from, cash: report.from });
  summarySheet.addRow({ k: 'Davr oxiri', pnl: report.to, cash: report.to });
  summarySheet.addRow({ k: 'Sotuv / Kelgan pul', pnl: Number(report.pnl.revenue), cash: Number(report.cash.totalIn) });
  summarySheet.addRow({ k: 'Tan narxi / —', pnl: Number(report.pnl.cogs), cash: '—' });
  summarySheet.addRow({ k: 'Chiqim / Ketgan pul', pnl: Number(report.pnl.operatingExpense), cash: Number(report.cash.totalOut) });
  summarySheet.addRow({ k: 'YAKUN', pnl: Number(report.pnl.profit), cash: Number(report.cash.farq) });

  const out = join(tmpdir(), `chayxana-smoke-${Date.now()}.xlsx`);
  console.log(`[XLSX] writing ${out}`);
  const t0 = Date.now();
  await wb.xlsx.writeFile(out);
  const took = Date.now() - t0;

  if (!existsSync(out)) throw new Error('XLSX not written');
  const stats = statSync(out);
  if (stats.size === 0) throw new Error('XLSX is empty');
  // XLSX is a ZIP archive — magic PK\x03\x04
  const magic = readFileSync(out).slice(0, 2).toString('hex');
  if (magic !== '504b') throw new Error(`bad XLSX magic: ${magic}`);

  // Read back and confirm sheet names
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(out);
  const names = wb2.worksheets.map((s) => s.name);
  const expected = ['Kirimlar', 'Foyda chiqimi', 'Pul harakati', 'Yakun'];
  const missing = expected.filter((e) => !names.includes(e));
  if (missing.length > 0) throw new Error(`missing sheets: ${missing.join(', ')}`);

  console.log(`[XLSX] ✓ ${took}ms, ${(stats.size / 1024).toFixed(1)} KB, sheets=${names.join(', ')}`);
  unlinkSync(out);
}

async function main() {
  const cliDate = process.argv[2] ?? localDayKey();
  console.log(`Day: ${cliDate}`);

  await checkPdf(cliDate);
  await checkExcel(cliDate, cliDate);

  await getPrisma().$disconnect();
  console.log('\nFILE SAVE: OK');
}

main().catch(async (e) => {
  console.error('FAIL:', e?.stack ?? e);
  try { await getPrisma().$disconnect(); } catch {}
  process.exit(1);
});
