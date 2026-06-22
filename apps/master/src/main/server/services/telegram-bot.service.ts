import { settingsService } from './settings.service';
import { reportsService } from './reports.service';
import { debtService } from './debt.service';
import { expenseService } from './expense.service';
import { ingredientService } from './ingredient.service';
import {
  localDayKey,
  localDayRangeFor,
  localMonthRangeFor,
  parseLocalDay,
} from '../lib/time';

const MS_PER_DAY = 86_400_000;

function formatMoney(value: string | number) {
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

/**
 * Render "DD.MM.YYYY" in Tashkent. The previous implementation used
 * `date.getDate()/getMonth()/getFullYear()` which is server-local and
 * shifts the label across midnight on non-Tashkent hosts.
 */
function formatDateLabel(date: Date) {
  const key = localDayKey(date); // YYYY-MM-DD in Tashkent
  const [yyyy, mm, dd] = key.split('-');
  return `${dd}.${mm}.${yyyy}`;
}

/** Tashkent calendar day anchor for "today" (00:00 +05:00, as a UTC instant). */
function tashkentTodayAnchor(): Date {
  return parseLocalDay(localDayKey());
}

/** Tashkent calendar day N days before today, as a day-anchor instant. */
function tashkentDaysAgoAnchor(n: number): Date {
  return new Date(tashkentTodayAnchor().getTime() - n * MS_PER_DAY);
}

const UZBEK_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

function formatMonthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split('-');
  const idx = Number(m) - 1;
  return `${UZBEK_MONTHS[idx] ?? m} ${y}`;
}

function parseMonthArg(text: string): { year: number; month: number } | null {
  const m = text.match(/(\d{4})-(\d{1,2})/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

let botInstance: any = null;
let restartTimeout: NodeJS.Timeout | null = null;

export const telegramBotService = {
  async start() {
    const token = settingsService.get('telegram_bot_token');
    const ownerChatId = settingsService.get('owner_telegram_chat_id');

    if (!token || !ownerChatId) {
      console.log('[TelegramBot] Token yoki Chat ID topilmadi, bot ishga tushmadi');
      return;
    }

    try {
      const { Telegraf, Markup } = await import('telegraf');
      const bot = new Telegraf(token);

      const botInfo = await bot.telegram.getMe();
      console.log(`[TelegramBot] Bot @${botInfo.username} sifatida ulandi`);

      // Security: only respond to the configured owner chat.
      bot.use(async (ctx, next) => {
        if (ctx.chat?.id.toString() !== ownerChatId) {
          console.warn(`[TelegramBot] Ruxsatsiz foydalanish: ${ctx.chat?.id}`);
          if (ctx.updateType === 'message') {
            await ctx.reply('⛔️ Sizda ushbu botdan foydalanish huquqi yo\'q.');
          }
          return;
        }
        return next();
      });

      const mainMenu = Markup.inlineKeyboard([
        [
          Markup.button.callback('📊 Bugun', 'report_today'),
          Markup.button.callback('📅 Kecha', 'report_yesterday'),
        ],
        [
          Markup.button.callback('📄 Bugungi PDF', 'pdf_today'),
          Markup.button.callback('📄 Kechagi PDF', 'pdf_yesterday'),
        ],
        [
          Markup.button.callback('📋 Hafta yakuni', 'report_week'),
          Markup.button.callback('📈 Oylik hisobot', 'report_month'),
        ],
        [
          Markup.button.callback('💳 Qarzlar', 'debts_now'),
          Markup.button.callback('📤 Xarajatlar', 'expenses_today'),
        ],
        [
          Markup.button.callback('📦 Omborxona', 'stock_low'),
          Markup.button.callback('❓ Yordam', 'help_action'),
        ],
      ]);

      const sendDailyReport = async (ctx: any, date: Date) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          const report = await reportsService.daily(date);
          const message = this.formatReportMessage(date, report);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Hisobot yaratishda xatolik:', error);
          await ctx.reply('❌ Hisobotni yaratishda xatolik yuz berdi.');
        }
      };

      const sendDailyPdf = async (ctx: any, date: Date) => {
        let tmpPath: string | null = null;
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          await ctx.reply('📄 PDF tayyorlanmoqda, biroz kuting…');

          const { generateDailyReportPdf } = await import('../../pdf-report');
          const os = await import('os');
          const path = await import('path');
          const fs = await import('fs/promises');

          // Filename should match the Tashkent calendar day of the report,
          // not the server-local one — owner files often archive by day key.
          const dayKey = localDayKey(date);
          const filename = `chayxana-moliyaviy-${dayKey}.pdf`;
          tmpPath = path.join(os.tmpdir(), `chayxana-bot-${Date.now()}-${filename}`);

          await generateDailyReportPdf({ date, outputPath: tmpPath });

          // Telegram doc upload requires a buffer or path; pass the file path.
          await ctx.replyWithDocument(
            { source: tmpPath, filename },
            {
              caption: `📊 ${formatDateLabel(date)} — kunlik moliyaviy PDF hisobot`,
              ...mainMenu,
            },
          );

          // Best-effort cleanup (don't await inside the success path's main await
          // chain — but we already sent the doc, so do it now).
          try { await fs.unlink(tmpPath); } catch {}
          tmpPath = null;
        } catch (error: any) {
          console.error('[TelegramBot] PDF yuborishda xatolik:', error);
          const msg = error?.message ?? String(error);
          await ctx.reply(`❌ PDF yaratishda xatolik: ${msg}`).catch(() => {});
          if (tmpPath) {
            try {
              const fs = await import('fs/promises');
              await fs.unlink(tmpPath);
            } catch {}
          }
        }
      };

      const sendMonthlyReport = async (ctx: any, year: number, month: number) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          // Tashkent-anchored month start regardless of server TZ.
          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
          const monthStart = localMonthRangeFor(monthKey).start;
          const report = await reportsService.monthly(monthStart);
          const message = this.formatMonthlyMessage(report);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Oylik hisobot yaratishda xatolik:', error);
          await ctx.reply('❌ Oylik hisobotni olishda xatolik yuz berdi.');
        }
      };

      const sendWeekSummary = async (ctx: any) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          await ctx.reply('📋 So\'nggi 7 kun yig\'ilmoqda, biroz kuting…');
          // Walk the last 7 Tashkent calendar days backwards. Pre-fix this used
          // server-local setHours+setDate which shifted by 5h on UTC hosts.
          const days: Array<{ date: Date; report: any }> = [];
          for (let offset = 6; offset >= 0; offset--) {
            const d = tashkentDaysAgoAnchor(offset);
            try {
              const report = await reportsService.daily(d);
              days.push({ date: d, report });
            } catch (e) {
              console.error('[TelegramBot] Kun hisoboti olishda xato:', d, e);
            }
          }
          const summary = this.formatWeekSummary(days);
          await ctx.replyWithHTML(summary, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Hafta yakuni yaratishda xatolik:', error);
          await ctx.reply('❌ Hafta yakunini olishda xatolik yuz berdi.');
        }
      };

      const sendDebtsSnapshot = async (ctx: any) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          const { items: debts } = await debtService.list({});
          const open = debts.filter((d: any) => d.status === 'OPEN' || d.status === 'PARTIAL');
          const message = this.formatDebtsMessage(open);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Qarzlar ro\'yxatida xatolik:', error);
          await ctx.reply('❌ Qarzlar ro\'yxatini olishda xatolik yuz berdi.');
        }
      };

      const sendExpensesToday = async (ctx: any) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          // Tashkent-anchored today; the underlying repo uses localDayRange.
          const today = tashkentTodayAnchor();
          const summary = await expenseService.listByDate(today);
          const message = this.formatExpensesMessage(today, summary);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Xarajatlar olishda xatolik:', error);
          await ctx.reply('❌ Xarajatlarni olishda xatolik yuz berdi.');
        }
      };

      const sendLowStock = async (ctx: any) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          const ingredients = await ingredientService.list({ isActive: true });
          const message = this.formatStockMessage(ingredients);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Omborxona ma\'lumotida xatolik:', error);
          await ctx.reply('❌ Omborxona ma\'lumotini olishda xatolik yuz berdi.');
        }
      };

      const sendDateHelp = async (ctx: any) => {
        try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
        await ctx.reply(
          '🗓 <b>Sana bo\'yicha hisobot olish</b>\n\n' +
          '<code>/sana 2026-05-12</code> — kunlik hisobot\n' +
          '<code>/oy 2026-05</code> — oylik hisobot\n' +
          '<code>/oldin 5</code> — 5 kun oldingi hisobot\n\n' +
          'Sana <b>YIL-OY-KUN</b>, oy esa <b>YIL-OY</b> formatida.',
          { parse_mode: 'HTML', ...mainMenu },
        );
      };

      const sendHelp = async (ctx: any) => {
        try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
        await ctx.reply(
          'Chayxana boshqaruv boti — restoran moliyaviy holatini kuzatish.\n\n' +
          '<b>Asosiy hisobotlar:</b>\n' +
          '/bugun — Bugungi to\'liq hisobot\n' +
          '/kecha — Kechagi hisobot\n' +
          '/hafta — So\'nggi 7 kun yakuni\n' +
          '/oylik — Joriy oy yakuni\n' +
          '/oy <i>YIL-OY</i> — Tanlangan oy (masalan <code>/oy 2026-05</code>)\n' +
          '/sana <i>YIL-OY-KUN</i> — Tanlangan kun (masalan <code>/sana 2026-05-12</code>)\n' +
          '/oldin <i>N</i> — N kun oldingi hisobot\n\n' +
          '<b>Tezkor ma\'lumotlar:</b>\n' +
          '/qarzlar — Hozirgi ochiq qarzlar ro\'yxati\n' +
          '/xarajatlar — Bugungi xarajatlar va turkumlari\n' +
          '/omborxona — Mahsulotlar qoldig\'i (eng kam yetadiganlari)\n\n' +
          '<b>PDF hisobot:</b>\n' +
          '/pdf — Bugungi kun PDF hisoboti\n' +
          '/pdf <i>YIL-OY-KUN</i> — Tanlangan kun PDF\'i (masalan <code>/pdf 2026-05-12</code>)\n\n' +
          '<b>Umumiy hisobot (sana oralig\'i):</b>\n' +
          '/umumiy — Joriy oy (1-kundan bugungacha)\n' +
          '/umumiy <i>2026-05-01 2026-05-23</i> — Sana oralig\'i\n' +
          '/excel — Xuddi shu hisobot Excel formatida\n' +
          '/excel <i>2026-05-01 2026-05-23</i> — Sana oralig\'i Excel\n\n' +
          '/yordam — Shu yordam matni',
          { parse_mode: 'HTML', ...mainMenu },
        );
      };

      const parseDateArg = (text: string): Date | null => {
        const m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const [, y, mo, d] = m;
        let date: Date;
        try {
          date = parseLocalDay(`${y}-${mo}-${d}`);
        } catch {
          return null;
        }
        // Reject "today + 1" in Tashkent frame.
        const tomorrow = tashkentDaysAgoAnchor(-1);
        if (date >= tomorrow) return null;
        return date;
      };

      // Parse two dates out of a command like "/umumiy 2026-05-01 2026-05-23".
      // Missing args → defaults to first-of-current-month → today (matches the
      // ReportsPage "Umumiy" tab default range). All anchored in Tashkent.
      const parseRangeArgs = (text: string): { from: Date; to: Date } => {
        const matches = [...text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)];
        const todayKey = localDayKey();
        const todayStart = parseLocalDay(todayKey);
        const monthStart = localMonthRangeFor(todayKey.slice(0, 7)).start;

        const parseAt = (idx: number) => {
          const m = matches[idx];
          if (!m) return null;
          try {
            return parseLocalDay(`${m[1]}-${m[2]}-${m[3]}`);
          } catch {
            return null;
          }
        };

        const from = parseAt(0) ?? monthStart;
        const to = parseAt(1) ?? todayStart;
        // Ensure ordering — if user typo's reversed dates, swap.
        return from <= to ? { from, to } : { from: to, to: from };
      };

      // Compact HTML summary of the Umumiy report.
      const sendSummaryText = async (ctx: any, from: Date, to: Date) => {
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          const report = await reportsService.summary({ from, to });
          const lines: string[] = [];
          lines.push(`📑 <b>Umumiy hisobot</b>  (${formatDateLabel(from)} → ${formatDateLabel(to)})`);
          lines.push('');

          lines.push('<b>Kirimlar — kategoriya bo\'yicha</b>');
          if (report.incomes.byMenuCategory.length === 0) {
            lines.push('  <i>Sotuv yo\'q</i>');
          } else {
            for (const r of report.incomes.byMenuCategory) {
              lines.push(`  • ${r.categoryName}: ${formatMoney(r.revenue)} so'm  <i>(${r.qty} ta)</i>`);
            }
            lines.push(`  <b>Jami sotuv:</b> ${formatMoney(report.incomes.totals.revenue)} so'm`);
            lines.push(`  <b>Jami tan narxi:</b> ${formatMoney(report.incomes.totals.cogs)} so'm`);
          }
          if (Number(report.incomes.other.debtRepaid) > 0 || Number(report.incomes.other.expenseReturns) > 0) {
            lines.push('  <i>Boshqa:</i>');
            if (Number(report.incomes.other.debtRepaid) > 0) {
              lines.push(`    qarz qaytimi: ${formatMoney(report.incomes.other.debtRepaid)} so'm`);
            }
            if (Number(report.incomes.other.expenseReturns) > 0) {
              lines.push(`    avans qaytimi: ${formatMoney(report.incomes.other.expenseReturns)} so'm`);
            }
          }
          lines.push('');

          lines.push('<b>Sof foyda</b>');
          if (report.pnl.expensesByCategory.length > 0) {
            for (const r of report.pnl.expensesByCategory) {
              lines.push(`  − ${r.categoryName}: ${formatMoney(r.amount)} so'm`);
            }
          }
          lines.push(`  Sotuv:       ${formatMoney(report.pnl.grossRevenue)} so'm`);
          if (Number(report.pnl.discount) > 0) {
            lines.push(`  Chegirma:    − ${formatMoney(report.pnl.discount)} so'm`);
          }
          lines.push(`  Tan narxi:   − ${formatMoney(report.pnl.cogs)} so'm`);
          lines.push(`  Chiqim:      − ${formatMoney(report.pnl.operatingExpense)} so'm`);
          lines.push(`  <b>Sof foyda:  ${formatMoney(report.pnl.profit)} so'm</b>`);
          lines.push('');

          lines.push('<b>Pul harakati</b>');
          if (report.cash.expensesByCategory.length > 0) {
            for (const r of report.cash.expensesByCategory) {
              lines.push(`  − ${r.categoryName}: ${formatMoney(r.amount)} so'm`);
            }
          }
          lines.push(`  Jami kelgan: ${formatMoney(report.cash.totalIn)} so'm`);
          lines.push(`  Jami ketgan: ${formatMoney(report.cash.totalOut)} so'm`);
          lines.push(`  <b>Farq: ${formatMoney(report.cash.farq)} so'm</b>`);

          await ctx.replyWithHTML(lines.join('\n'), mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Umumiy hisobot xatosi:', error);
          await ctx.reply('❌ Umumiy hisobotni olishda xatolik yuz berdi.');
        }
      };

      // Generate XLSX with 4 sheets (Kirimlar, P&L chiqim, Cash chiqim, Yakun)
      // and send as a Telegram document. Mirrors sendDailyPdf's tmp-file pattern.
      const sendSummaryExcel = async (ctx: any, from: Date, to: Date) => {
        let tmpPath: string | null = null;
        try {
          try { if (ctx.callbackQuery) await ctx.answerCbQuery(); } catch {}
          await ctx.reply('📊 Excel tayyorlanmoqda, biroz kuting…');

          const report = await reportsService.summary({ from, to });
          const ExcelJS = (await import('exceljs')).default;
          const os = await import('os');
          const path = await import('path');
          const fs = await import('fs/promises');

          const wb = new ExcelJS.Workbook();
          wb.creator = 'Chayxana POS';
          wb.created = new Date();

          // 1) Kirimlar (incomes by menu category)
          const incomesSheet = wb.addWorksheet('Kirimlar');
          incomesSheet.columns = [
            { header: 'Kategoriya', key: 'cat', width: 28 },
            { header: 'Soni', key: 'qty', width: 8 },
            { header: 'Sotuv (so\'m)', key: 'revenue', width: 16 },
            { header: 'Tan narxi (so\'m)', key: 'cogs', width: 16 },
            { header: 'Foyda (so\'m)', key: 'profit', width: 16 },
          ];
          incomesSheet.getRow(1).font = { bold: true };
          for (const r of report.incomes.byMenuCategory) {
            incomesSheet.addRow({
              cat: r.categoryName,
              qty: r.qty,
              revenue: Number(r.revenue),
              cogs: Number(r.cogs),
              profit: Number(r.profit),
            });
          }
          const incTotalRow = incomesSheet.addRow({
            cat: 'JAMI',
            qty: report.incomes.totals.qty,
            revenue: Number(report.incomes.totals.revenue),
            cogs: Number(report.incomes.totals.cogs),
            profit: Number(report.incomes.totals.revenue) - Number(report.incomes.totals.cogs),
          });
          incTotalRow.font = { bold: true };
          ['C', 'D', 'E'].forEach((col) => {
            incomesSheet.getColumn(col).numFmt = '#,##0';
          });

          // 2) Sof foyda chiqimlari
          const pnlSheet = wb.addWorksheet('Foyda chiqimi');
          pnlSheet.columns = [
            { header: 'Kategoriya', key: 'cat', width: 28 },
            { header: 'Summa (so\'m)', key: 'amount', width: 18 },
          ];
          pnlSheet.getRow(1).font = { bold: true };
          for (const r of report.pnl.expensesByCategory) {
            pnlSheet.addRow({ cat: r.categoryName, amount: Number(r.amount) });
          }
          pnlSheet.addRow({});
          pnlSheet.addRow({ cat: 'Sotuv', amount: Number(report.pnl.grossRevenue) }).font = { bold: true };
          if (Number(report.pnl.discount) > 0) {
            pnlSheet.addRow({ cat: 'Chegirma', amount: -Number(report.pnl.discount) });
          }
          pnlSheet.addRow({ cat: 'Tan narxi', amount: -Number(report.pnl.cogs) });
          pnlSheet.addRow({ cat: 'Chiqim', amount: -Number(report.pnl.operatingExpense) });
          const pnlRow = pnlSheet.addRow({ cat: 'SOF FOYDA', amount: Number(report.pnl.profit) });
          pnlRow.font = { bold: true };
          pnlSheet.getColumn('B').numFmt = '#,##0';

          // 3) Pul harakati chiqimlari
          const cashSheet = wb.addWorksheet('Pul harakati');
          cashSheet.columns = [
            { header: 'Kategoriya', key: 'cat', width: 28 },
            { header: 'Summa (so\'m)', key: 'amount', width: 18 },
          ];
          cashSheet.getRow(1).font = { bold: true };
          for (const r of report.cash.expensesByCategory) {
            cashSheet.addRow({ cat: r.categoryName, amount: Number(r.amount) });
          }
          cashSheet.addRow({});
          cashSheet.addRow({ cat: 'Jami kelgan', amount: Number(report.cash.totalIn) }).font = { bold: true };
          cashSheet.addRow({ cat: 'Jami ketgan', amount: -Number(report.cash.totalOut) });
          const cashRow = cashSheet.addRow({ cat: 'FARQ', amount: Number(report.cash.farq) });
          cashRow.font = { bold: true };
          cashSheet.getColumn('B').numFmt = '#,##0';

          // 4) Yakun — qisqacha
          const summarySheet = wb.addWorksheet('Yakun');
          summarySheet.columns = [
            { header: 'Ko\'rsatkich', key: 'k', width: 30 },
            { header: 'Sof foyda', key: 'pnl', width: 18 },
            { header: 'Pul harakati', key: 'cash', width: 18 },
          ];
          summarySheet.getRow(1).font = { bold: true };
          summarySheet.addRow({ k: 'Davr boshi', pnl: report.from, cash: report.from });
          summarySheet.addRow({ k: 'Davr oxiri', pnl: report.to, cash: report.to });
          summarySheet.addRow({});
          summarySheet.addRow({ k: 'Sotuv / Kelgan pul', pnl: Number(report.pnl.revenue), cash: Number(report.cash.totalIn) });
          summarySheet.addRow({ k: 'Tan narxi / —', pnl: Number(report.pnl.cogs), cash: '—' });
          summarySheet.addRow({ k: 'Chiqim / Ketgan pul', pnl: Number(report.pnl.operatingExpense), cash: Number(report.cash.totalOut) });
          const finalRow = summarySheet.addRow({ k: 'YAKUN', pnl: Number(report.pnl.profit), cash: Number(report.cash.farq) });
          finalRow.font = { bold: true };
          ['B', 'C'].forEach((col) => { summarySheet.getColumn(col).numFmt = '#,##0'; });

          const filename = `chayxana-umumiy-${report.from}-${report.to}.xlsx`;
          tmpPath = path.join(os.tmpdir(), `chayxana-bot-${Date.now()}-${filename}`);
          await wb.xlsx.writeFile(tmpPath);

          await ctx.replyWithDocument(
            { source: tmpPath, filename },
            {
              caption: `📊 Umumiy moliyaviy hisobot\n${formatDateLabel(from)} → ${formatDateLabel(to)}`,
              ...mainMenu,
            },
          );

          try { await fs.unlink(tmpPath); } catch {}
          tmpPath = null;
        } catch (error: any) {
          console.error('[TelegramBot] Excel yuborishda xatolik:', error);
          const msg = error?.message ?? String(error);
          await ctx.reply(`❌ Excel yaratishda xatolik: ${msg}`).catch(() => {});
          if (tmpPath) {
            try {
              const fs = await import('fs/promises');
              await fs.unlink(tmpPath);
            } catch {}
          }
        }
      };

      // ─── Commands ───
      bot.start((ctx) => ctx.reply('✅ Chayxana hisobot boti ishga tushdi.', mainMenu));
      bot.help(sendHelp);
      bot.command(['yordam', 'help'], sendHelp);

      bot.command(['bugun', 'today'], (ctx) => sendDailyReport(ctx, tashkentTodayAnchor()));
      bot.command(['kecha', 'yesterday'], (ctx) => {
        sendDailyReport(ctx, tashkentDaysAgoAnchor(1));
      });
      bot.command(['hafta', 'week'], sendWeekSummary);

      bot.command(['oylik', 'month'], (ctx) => {
        // Current Tashkent month.
        const [yyyy, mm] = localDayKey().split('-');
        sendMonthlyReport(ctx, parseInt(yyyy!, 10), parseInt(mm!, 10));
      });
      bot.command(['oy'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const parsed = parseMonthArg(text);
        if (!parsed) {
          await ctx.reply(
            '❗ Oyni to\'g\'ri formatda yozing: <code>/oy 2026-05</code>',
            { parse_mode: 'HTML' },
          );
          return;
        }
        await sendMonthlyReport(ctx, parsed.year, parsed.month);
      });

      bot.command(['sana', 'date'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const date = parseDateArg(text);
        if (!date) {
          await ctx.reply(
            '❗ Sanani to\'g\'ri formatda yozing: <code>/sana 2026-05-12</code>',
            { parse_mode: 'HTML' },
          );
          return;
        }
        await sendDailyReport(ctx, date);
      });

      bot.command(['oldin', 'ago'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const m = text.match(/(\d+)/);
        const n = m ? parseInt(m[1], 10) : NaN;
        if (!Number.isFinite(n) || n < 0 || n > 365) {
          await ctx.reply(
            '❗ Necha kun oldin? <code>/oldin 7</code> kabi yozing (0–365).',
            { parse_mode: 'HTML' },
          );
          return;
        }
        await sendDailyReport(ctx, tashkentDaysAgoAnchor(n));
      });

      bot.command(['qarzlar', 'debts'], sendDebtsSnapshot);
      bot.command(['xarajatlar', 'expenses'], sendExpensesToday);
      bot.command(['omborxona', 'stock'], sendLowStock);

      // /pdf — today's daily report as a PDF
      // /pdf 2026-05-12 — specific date
      bot.command(['pdf'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const date = parseDateArg(text) ?? tashkentTodayAnchor();
        await sendDailyPdf(ctx, date);
      });

      // /umumiy [from] [to] — cross-category P&L + Cash basis summary
      // /umumiy 2026-05-01 2026-05-23  (defaults: this month → today)
      bot.command(['umumiy', 'summary'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const { from, to } = parseRangeArgs(text);
        await sendSummaryText(ctx, from, to);
      });

      // /excel [from] [to] — same summary as XLSX workbook
      bot.command(['excel'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const { from, to } = parseRangeArgs(text);
        await sendSummaryExcel(ctx, from, to);
      });

      // ─── Action buttons ───
      bot.action('report_today', (ctx) => sendDailyReport(ctx, tashkentTodayAnchor()));
      bot.action('report_yesterday', (ctx) => sendDailyReport(ctx, tashkentDaysAgoAnchor(1)));
      bot.action('report_week', sendWeekSummary);
      bot.action('report_month', (ctx) => {
        const [yyyy, mm] = localDayKey().split('-');
        sendMonthlyReport(ctx, parseInt(yyyy!, 10), parseInt(mm!, 10));
      });
      bot.action('debts_now', sendDebtsSnapshot);
      bot.action('expenses_today', sendExpensesToday);
      bot.action('stock_low', sendLowStock);
      bot.action('pdf_today', (ctx) => sendDailyPdf(ctx, tashkentTodayAnchor()));
      bot.action('pdf_yesterday', (ctx) => sendDailyPdf(ctx, tashkentDaysAgoAnchor(1)));
      bot.action('date_help', sendDateHelp);
      bot.action('help_action', sendHelp);

      try {
        await bot.telegram.setMyCommands([
          { command: 'bugun', description: 'Bugungi moliyaviy hisobot' },
          { command: 'kecha', description: 'Kechagi moliyaviy hisobot' },
          { command: 'hafta', description: 'So\'nggi 7 kun yakuni' },
          { command: 'oylik', description: 'Joriy oy yakuni' },
          { command: 'oy', description: 'Tanlangan oy yakuni (YIL-OY)' },
          { command: 'sana', description: 'Tanlangan kun hisoboti (YIL-OY-KUN)' },
          { command: 'oldin', description: 'N kun oldingi hisobot' },
          { command: 'qarzlar', description: 'Ochiq qarzlar ro\'yxati' },
          { command: 'xarajatlar', description: 'Bugungi xarajatlar' },
          { command: 'omborxona', description: 'Eng kam yetadigan mahsulotlar' },
          { command: 'pdf', description: 'Kunlik PDF hisobot (yoki /pdf YIL-OY-KUN)' },
          { command: 'umumiy', description: 'Umumiy hisobot (yoki /umumiy FROM TO)' },
          { command: 'excel', description: 'Umumiy hisobot Excel formatida' },
          { command: 'yordam', description: 'Buyruqlar ro\'yxati' },
          { command: 'start', description: 'Botni qayta ishga tushirish' },
        ]);
      } catch (err) {
        console.error('[TelegramBot] Buyruqlar menyusini o\'rnatishda xatolik:', err);
      }

      void bot.launch();
      botInstance = bot;
      console.log('[TelegramBot] Bot muvaffaqiyatli ishga tushdi');

      process.once('SIGINT', () => bot.stop('SIGINT'));
      process.once('SIGTERM', () => bot.stop('SIGTERM'));

    } catch (error: any) {
      console.error('[TelegramBot] Ishga tushirishda xatolik:', error.message);
    }
  },

  async stop() {
    if (botInstance) {
      try {
        await botInstance.stop('RESTART');
      } catch (e) {}
      botInstance = null;
    }
  },

  restart() {
    if (restartTimeout) clearTimeout(restartTimeout);
    restartTimeout = setTimeout(async () => {
      console.log('[TelegramBot] Qayta ishga tushirilmoqda...');
      await this.stop();
      await this.start();
    }, 1500);
  },

  async sendMessage(text: string) {
    if (!botInstance) {
      console.warn('[TelegramBot] Xabar yuborib bo\'lmadi: Bot yoqilmagan');
      return;
    }
    const chatId = settingsService.get('owner_telegram_chat_id');
    if (!chatId) return;
    try {
      await botInstance.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('[TelegramBot] Xabar yuborishda xatolik:', error);
    }
  },

  /**
   * Daily P&L message.
   *
   * Reads from the canonical `report.ledger` DTO (PRD 13 / T7) where present —
   * that's the single source of truth across surfaces. Falls back to legacy
   * field reads so this still works if called with a pre-PRD-13 payload (e.g.
   * old scheduler in-flight at deploy time).
   *
   * The canonical P&L (`ledger.pnl.profit`) is `netSales − cogs − operatingExpense`
   * — the same number the owner sees in `daily.results.salesBasedProfit`.
   */
  formatReportMessage(date: Date, report: any): string {
    // Prefer the canonical ledger projection where available.
    const L = report.ledger ?? null;
    const sales = L ? {
      closedOrders: L.sales.closedCount,
      canceledOrders: L.sales.canceledCount,
      walkoutOrders: L.sales.walkoutCount,
      grossSales: L.sales.gross,
      discounts: L.sales.discount,
      netSales: L.sales.netSales,
      serviceCharge: L.sales.serviceCharge,
      debtSales: L.sales.debtSales,
    } : report.sales;
    const cashflow = L ? {
      orderCash: L.cashflow.orderCash,
      orderCard: L.cashflow.orderCard,
      debtRepaymentsCash: L.cashflow.debtRepaidCash,
      debtRepaymentsCard: L.cashflow.debtRepaidCard,
      realCashIn: L.cashflow.realCashIn,
    } : report.cashflow;
    const expenses = L ? {
      gross: L.outflow.expenseGross,
      reversal: L.outflow.expenseReversal,
      sameDayReversal: L.outflow.expenseSameDayReversal,
      operating: L.outflow.operatingExpense,
      pendingRepayable: L.outflow.pendingRepayable,
      // byCategory only lives on the legacy expense block (admin detail).
      byCategory: report.expenses?.byCategory ?? [],
    } : report.expenses;
    // Canonical P&L profit. The legacy `salesBasedProfit` field is exactly
    // this value after T8 — single canonical formula.
    const salesProfit = L ? L.pnl.profit : report.results.salesBasedProfit;
    // Cash drawer uses cashOut (gross − same-day reversals), not expenseNet, so a
    // prior-day purchase reversed today doesn't inflate "Kassa o'zgarishi".
    const cashflowNet = report.results?.cashflowBasedNet
      ?? (L ? String(Number(L.cashflow.realCashIn) - Number(L.cashflow.cashOut)) : '0');
    const outstanding = L ? L.debt.outstandingAsOfEod : report.debtSnapshot.outstandingTotal;

    const lines: string[] = [];
    lines.push(`📊 <b>${formatDateLabel(date)} — kunlik moliyaviy hisobot</b>`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🍽 <b>Sotuv</b>`);
    lines.push(`  Yopilgan buyurtmalar: <b>${sales.closedOrders}</b> ta`);
    lines.push(`  Yalpi sotuv: <b>${formatMoney(sales.grossSales)}</b> so'm`);
    if (Number(sales.discounts) > 0) {
      lines.push(`  Chegirmalar: <b>−${formatMoney(sales.discounts)}</b> so'm`);
    }
    lines.push(`  Sof sotuv: <b>${formatMoney(sales.netSales)}</b> so'm`);
    lines.push(`  ✨ Xizmat haqi (ofitsiantlarga): <b>${formatMoney(sales.serviceCharge)}</b> so'm`);
    if (sales.walkoutOrders > 0) {
      lines.push(`  ⚠ To'lamay ketgan: <b>${sales.walkoutOrders}</b> ta`);
    }
    if (sales.canceledOrders > 0) {
      lines.push(`  Bekor qilinganlar: <b>${sales.canceledOrders}</b> ta`);
    }
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💵 <b>Kassaga kelgan pul</b>`);
    lines.push(`  Naqd (sotuvdan): <b>${formatMoney(cashflow.orderCash)}</b> so'm`);
    lines.push(`  Karta (sotuvdan): <b>${formatMoney(cashflow.orderCard)}</b> so'm`);
    if (Number(sales.debtSales) > 0) {
      lines.push(`  Qarzga sotildi: <b>${formatMoney(sales.debtSales)}</b> so'm`);
    }
    const debtRepaidTotal =
      Number(cashflow.debtRepaymentsCash) + Number(cashflow.debtRepaymentsCard);
    if (debtRepaidTotal > 0) {
      lines.push(`  Qaytgan qarz: <b>${formatMoney(debtRepaidTotal)}</b> so'm`);
    }
    lines.push(`  📥 Jami kelgan: <b>${formatMoney(cashflow.realCashIn)}</b> so'm`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📤 <b>Chiqimlar</b>`);
    lines.push(`  Kiritilgan: <b>${formatMoney(expenses.gross)}</b> so'm`);
    if (Number(expenses.sameDayReversal ?? '0') > 0) {
      lines.push(`  Bekor qilingan: <b>−${formatMoney(expenses.sameDayReversal)}</b> so'm`);
    }
    lines.push(`  Foyda hisobida: <b>${formatMoney(expenses.operating)}</b> so'm`);
    if (Number(expenses.pendingRepayable) > 0) {
      lines.push(`  ⏳ Kutilayotgan qaytim: <b>${formatMoney(expenses.pendingRepayable)}</b> so'm`);
    }
    if (Array.isArray(expenses.byCategory) && expenses.byCategory.length > 0) {
      const top = [...expenses.byCategory]
        .filter((c: any) => Number(c.amount) > 0)
        .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
        .slice(0, 3);
      if (top.length > 0) {
        lines.push(`  Eng katta turkumlar:`);
        top.forEach((c: any) => {
          lines.push(`    • ${c.categoryName}: ${formatMoney(c.amount)} so'm`);
        });
      }
    }
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💰 <b>Foyda</b>`);
    const profitIcon = Number(salesProfit) >= 0 ? '🟢' : '🔴';
    lines.push(`  ${profitIcon} Sof foyda: <b>${formatMoney(salesProfit)}</b> so'm`);
    lines.push(`  Kassa o'zgarishi: <b>${formatMoney(cashflowNet)}</b> so'm`);
    lines.push(`  Qarz qoldig'i: <b>${formatMoney(outstanding)}</b> so'm`);

    return lines.join('\n');
  },

  /** Oylik hisobot xabari (owner). */
  formatMonthlyMessage(report: any): string {
    const lines: string[] = [];
    const totals = report.totals;
    lines.push(`📈 <b>${formatMonthLabel(report.month)} — oylik hisobot</b>`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🍽 <b>Sotuv</b>`);
    lines.push(`  Yopilgan buyurtmalar: <b>${totals.closedOrders}</b> ta`);
    if (totals.walkoutOrders > 0) {
      lines.push(`  ⚠ To'lamay ketgan: <b>${totals.walkoutOrders}</b> ta`);
    }
    if (totals.canceledOrders > 0) {
      lines.push(`  Bekor qilinganlar: <b>${totals.canceledOrders}</b> ta`);
    }
    lines.push(`  Yalpi sotuv: <b>${formatMoney(totals.grossSales)}</b> so'm`);
    if (Number(totals.discounts) > 0) {
      lines.push(`  Chegirmalar: <b>−${formatMoney(totals.discounts)}</b> so'm`);
    }
    lines.push(`  Sof sotuv: <b>${formatMoney(totals.netSales)}</b> so'm`);
    lines.push(`  ✨ Xizmat haqi (ofitsiantlarga): <b>${formatMoney(totals.serviceCharge)}</b> so'm`);
    if (Number(totals.debtSales) > 0) {
      lines.push(`  Qarzga sotildi: <b>${formatMoney(totals.debtSales)}</b> so'm`);
    }
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💵 <b>Pul harakati</b>`);
    lines.push(`  📥 Kassaga kelgan: <b>${formatMoney(totals.realCashIn)}</b> so'm`);
    lines.push(`  📤 Jami chiqim: <b>${formatMoney(totals.expensesNet)}</b> so'm`);
    lines.push('');

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💰 <b>Foyda</b>`);
    const salesProfit = Number(totals.salesBasedProfit);
    const cashflowNet = Number(totals.cashflowBasedNet);
    const sProf = salesProfit >= 0 ? '🟢' : '🔴';
    const cProf = cashflowNet >= 0 ? '🟢' : '🔴';
    lines.push(`  ${sProf} Sof foyda: <b>${formatMoney(totals.salesBasedProfit)}</b> so'm`);
    lines.push(`  ${cProf} Kassa o'zgarishi: <b>${formatMoney(totals.cashflowBasedNet)}</b> so'm`);
    lines.push(`  Oy oxiri qarz qoldig'i: <b>${formatMoney(totals.outstandingDebtEndOfMonth)}</b> so'm`);
    lines.push('');

    // Top 5 days by net sales
    const dailySorted = [...(report.daily ?? [])]
      .filter((d: any) => d.sales.closedOrders > 0)
      .sort((a: any, b: any) => Number(b.sales.netSales) - Number(a.sales.netSales))
      .slice(0, 5);
    if (dailySorted.length > 0) {
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📆 <b>Eng yaxshi kunlar (top ${dailySorted.length})</b>`);
      dailySorted.forEach((d: any) => {
        const dDate = d.date.split('-').slice(-1)[0]; // day part
        lines.push(`  ${dDate}-kuni: <b>${formatMoney(d.sales.netSales)}</b> so'm · ${d.sales.closedOrders} buyurtma`);
      });
    }

    return lines.join('\n');
  },

  formatDebtsMessage(debts: Array<any>): string {
    const lines: string[] = [];
    lines.push(`💳 <b>Ochiq qarzlar (${debts.length} ta)</b>`);
    lines.push('');
    if (debts.length === 0) {
      lines.push('Hech qanday ochiq qarz topilmadi. ✅');
      return lines.join('\n');
    }
    const totalOutstanding = debts.reduce(
      (sum: number, d: any) => sum + Number(d.remainingAmount ?? 0),
      0,
    );
    lines.push(`Jami qoldiq: <b>${formatMoney(totalOutstanding)}</b> so'm`);
    lines.push('');
    const top = [...debts]
      .sort((a: any, b: any) => Number(b.remainingAmount) - Number(a.remainingAmount))
      .slice(0, 10);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    top.forEach((d: any, idx: number) => {
      const phone = d.debtorPhone ? ` (${d.debtorPhone})` : '';
      const status = d.status === 'PARTIAL' ? ' · qisman to\'langan' : '';
      lines.push(`  ${idx + 1}. <b>${d.debtorName}</b>${phone}`);
      lines.push(`     ${formatMoney(d.remainingAmount)} so'm${status}`);
    });
    if (debts.length > top.length) {
      lines.push('');
      lines.push(`  … va yana ${debts.length - top.length} ta qarz`);
    }
    return lines.join('\n');
  },

  formatExpensesMessage(date: Date, summary: any): string {
    const lines: string[] = [];
    lines.push(`📤 <b>${formatDateLabel(date)} — chiqimlar</b>`);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`  Kiritilgan: <b>${formatMoney(summary.totals.gross)}</b> so'm`);
    if (Number(summary.totals.reversal) > 0) {
      lines.push(`  Bekor qilingan: <b>−${formatMoney(summary.totals.reversal)}</b> so'm`);
    }
    lines.push(`  Jami chiqim: <b>${formatMoney(summary.totals.net)}</b> so'm`);
    lines.push(`  Foyda hisobida: <b>${formatMoney(summary.totals.operating)}</b> so'm`);
    if (Number(summary.totals.pendingRepayable) > 0) {
      lines.push(`  ⏳ Kutilayotgan qaytim: <b>${formatMoney(summary.totals.pendingRepayable)}</b> so'm`);
    }
    lines.push('');

    if (Array.isArray(summary.byCategory) && summary.byCategory.length > 0) {
      const cats = [...summary.byCategory]
        .filter((c: any) => Number(c.amount) > 0)
        .sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
      if (cats.length > 0) {
        lines.push('━━━━━━━━━━━━━━━━━━━━');
        lines.push(`<b>Turkumlar bo'yicha</b>`);
        cats.forEach((c: any) => {
          lines.push(`  • ${c.categoryName}: <b>${formatMoney(c.amount)}</b> so'm`);
        });
        lines.push('');
      }
    }

    if (Array.isArray(summary.items) && summary.items.length > 0) {
      const recent = summary.items.slice(0, 8);
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`<b>So'nggi yozuvlar</b>`);
      recent.forEach((it: any) => {
        const flag = it.status === 'REVERSED' ? '🚫 ' : it.repayable ? '⏳ ' : '';
        lines.push(`  ${flag}${it.reason} — <b>${formatMoney(it.amount)}</b> so'm`);
      });
      if (summary.items.length > recent.length) {
        lines.push(`  … va yana ${summary.items.length - recent.length} ta yozuv`);
      }
    }

    return lines.join('\n');
  },

  /**
   * Inventory low-stock view. Sorted by absolute currentStock ascending; the
   * "alert" threshold compares currentStock against variance × some buffer —
   * here we just surface the bottom 12 by raw quantity, with the threshold
   * shown alongside so the owner can judge urgency.
   */
  formatStockMessage(ingredients: Array<any>): string {
    const lines: string[] = [];
    lines.push(`📦 <b>Omborxona — eng kam mahsulotlar</b>`);
    lines.push('');
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      lines.push('Mahsulotlar topilmadi.');
      return lines.join('\n');
    }
    const sorted = [...ingredients]
      .filter((i: any) => i.isActive !== false)
      .sort((a: any, b: any) => Number(a.currentStock) - Number(b.currentStock))
      .slice(0, 12);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    sorted.forEach((ing: any) => {
      const stock = Number(ing.currentStock ?? 0);
      const unit = ing.recipeUnit ?? '';
      const dish = ing.parentMenuItem?.name ?? ing.parentMenuItemName ?? '';
      const dishLabel = dish ? ` · ${dish}` : '';
      const warning = stock <= 0 ? '🔴 ' : stock <= Number(ing.varianceThreshold ?? 0) ? '🟡 ' : '';
      lines.push(`  ${warning}<b>${ing.name}</b>${dishLabel}`);
      lines.push(`     ${stock} ${unit}`);
    });
    lines.push('');
    lines.push(`Jami faol mahsulotlar: <b>${ingredients.length}</b> ta`);
    return lines.join('\n');
  },

  /**
   * Compact 7-day rollup. One row per day plus a totals line. Designed to fit
   * comfortably in a single Telegram message.
   */
  formatWeekSummary(days: Array<{ date: Date; report: any }>): string {
    if (days.length === 0) {
      return '📋 So\'nggi 7 kun uchun ma\'lumot yo\'q.';
    }
    const lines: string[] = [];
    const first = days[0]!.date;
    const last = days[days.length - 1]!.date;
    lines.push(`📋 <b>So'nggi 7 kun yakuni</b>  (${formatDateLabel(first)} → ${formatDateLabel(last)})`);
    lines.push('');

    let totalSales = 0;
    let totalCashIn = 0;
    let totalOperating = 0;
    let totalProfit = 0;
    let totalServiceCharge = 0;
    let totalOrders = 0;
    let totalWalkouts = 0;

    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('<b>Kun           Savdo · Foyda</b>');
    days.forEach(({ date, report }) => {
      // Prefer canonical ledger fields; fall back to legacy shape.
      const L = report?.ledger;
      const sales = L
        ? Number(L.sales.netSales) + Number(L.sales.serviceCharge)
        : Number(report?.sales?.netSales ?? 0) + Number(report?.sales?.serviceCharge ?? 0);
      const profit = L ? Number(L.pnl.profit) : Number(report?.results?.salesBasedProfit ?? 0);
      const orders = L ? L.sales.closedCount : (report?.sales?.closedOrders ?? 0);
      const walkouts = L ? L.sales.walkoutCount : (report?.sales?.walkoutOrders ?? 0);
      const cashIn = L ? Number(L.cashflow.realCashIn) : Number(report?.cashflow?.realCashIn ?? 0);
      const operating = L ? Number(L.outflow.operatingExpense) : Number(report?.expenses?.operating ?? 0);
      const serviceCharge = L ? Number(L.sales.serviceCharge) : Number(report?.sales?.serviceCharge ?? 0);

      totalSales += sales;
      totalCashIn += cashIn;
      totalOperating += operating;
      totalProfit += profit;
      totalServiceCharge += serviceCharge;
      totalOrders += orders;
      totalWalkouts += walkouts;

      const dayLabel = formatDateLabel(date).padEnd(11, ' ');
      const profitSign = profit < 0 ? '−' : '+';
      const profitAbs = Math.abs(profit);
      lines.push(
        `  ${dayLabel}  ${orders.toString().padStart(2, ' ')} buyurtma · ${formatMoney(sales).padStart(10, ' ')} · ${profitSign}${formatMoney(profitAbs)}`,
      );
    });

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('<b>📊 Jami</b>');
    lines.push(`  Buyurtmalar: <b>${totalOrders}</b> ta` + (totalWalkouts > 0 ? ` · to'lamay ketgan: ${totalWalkouts}` : ''));
    lines.push(`  Sotuv: <b>${formatMoney(totalSales)}</b> so'm`);
    lines.push(`  ✨ Xizmat haqi (jami): <b>${formatMoney(totalServiceCharge)}</b> so'm`);
    lines.push(`  Kassaga kelgan: <b>${formatMoney(totalCashIn)}</b> so'm`);
    lines.push(`  Chiqim: <b>${formatMoney(totalOperating)}</b> so'm`);
    lines.push(`  Sof foyda: <b>${formatMoney(totalProfit)}</b> so'm`);

    return lines.join('\n');
  },
};
