import { settingsService } from './settings.service';
import { reportsService } from './reports.service';

function formatMoney(value: string | number) {
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDateLabel(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
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

      // Verify token
      const botInfo = await bot.telegram.getMe();
      console.log(`[TelegramBot] Bot @${botInfo.username} sifatida ulandi`);

      // Security Middleware: Only respond to the configured owner
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
          Markup.button.callback('📆 3 kun oldin', 'report_d3'),
          Markup.button.callback('📆 7 kun oldin', 'report_d7'),
        ],
        [
          Markup.button.callback('📋 Hafta yakuni', 'report_week'),
          Markup.button.callback('🗓 Sana tanlash', 'date_help'),
        ],
        [
          Markup.button.callback('❓ Yordam', 'help_action'),
        ],
      ]);

      const getReport = async (ctx: any, date: Date) => {
        console.log(`[TelegramBot] Hisobot tayyorlanmoqda: ${date.toISOString().slice(0, 10)}`);
        try {
          await ctx.answerCbQuery().catch(() => {});
          const report = await reportsService.daily(date);
          const message = this.formatReportMessage(date, report);
          await ctx.replyWithHTML(message, mainMenu);
        } catch (error) {
          console.error('[TelegramBot] Hisobot yaratishda xatolik:', error);
          await ctx.reply('❌ Hisobotni yaratishda xatolik yuz berdi.');
        }
      };

      const sendWeekSummary = async (ctx: any) => {
        try {
          await ctx.answerCbQuery().catch(() => {});
          await ctx.reply('📋 So\'nggi 7 kun yig\'ilmoqda, biroz kuting…');

          const days: Array<{ date: Date; report: any }> = [];
          for (let offset = 6; offset >= 0; offset--) {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - offset);
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

      const sendDateHelp = async (ctx: any) => {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.reply(
          '🗓 <b>Sana bo\'yicha hisobot olish</b>\n\n' +
          'Quyidagi buyruqdan foydalaning:\n' +
          '<code>/sana 2026-05-12</code>\n\n' +
          'Yoki "N kun oldin" qilib so\'rang:\n' +
          '<code>/oldin 5</code>  — 5 kun oldingi hisobot\n\n' +
          'Sana <b>YIL-OY-KUN</b> formatida yozilishi kerak.',
          { parse_mode: 'HTML', ...mainMenu },
        );
      };

      const sendHelp = async (ctx: any) => {
        await ctx.answerCbQuery().catch(() => {});
        await ctx.reply(
          'Ushbu bot orqali restoran moliyaviy holatini kuzatib borishingiz mumkin.\n\n' +
          '<b>Buyruqlar:</b>\n' +
          '/bugun — Bugungi hisobot\n' +
          '/kecha — Kechagi hisobot\n' +
          '/sana <i>YIL-OY-KUN</i> — Ko\'rsatilgan sana hisoboti (masalan: <code>/sana 2026-05-12</code>)\n' +
          '/oldin <i>N</i> — N kun oldingi hisobot (masalan: <code>/oldin 7</code>)\n' +
          '/hafta — So\'nggi 7 kun yig\'ilgan ko\'rinish\n' +
          '/yordam — Shu yordam matni',
          { parse_mode: 'HTML', ...mainMenu },
        );
      };

      const parseDateArg = (text: string): Date | null => {
        // Accept "YYYY-MM-DD" anywhere after the command.
        const m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const [, y, mo, d] = m;
        const date = new Date(`${y}-${mo}-${d}T00:00:00`);
        if (Number.isNaN(date.getTime())) return null;
        // Don't accept future dates.
        const tomorrow = new Date();
        tomorrow.setHours(0, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (date >= tomorrow) return null;
        return date;
      };

      // Register Commands
      bot.start((ctx) => ctx.reply('✅ Chayxana hisobot boti ishga tushdi.', mainMenu));
      bot.help(sendHelp);
      bot.command(['yordam', 'help'], sendHelp);
      bot.command(['bugun', 'today'], (ctx) => getReport(ctx, new Date()));
      bot.command(['kecha', 'yesterday'], (ctx) => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        getReport(ctx, d);
      });
      bot.command(['hafta', 'week'], sendWeekSummary);
      bot.command(['sana', 'date'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const date = parseDateArg(text);
        if (!date) {
          await ctx.reply(
            '❗ Sanani to\'g\'ri formatda yozing: <code>/sana 2026-05-12</code>\n' +
            'Sana kelajakda bo\'lmasligi kerak.',
            { parse_mode: 'HTML' },
          );
          return;
        }
        await getReport(ctx, date);
      });
      bot.command(['oldin', 'ago'], async (ctx) => {
        const text = (ctx.message as any)?.text ?? '';
        const m = text.match(/(\d+)/);
        const n = m ? parseInt(m[1], 10) : NaN;
        if (!Number.isFinite(n) || n < 0 || n > 365) {
          await ctx.reply(
            '❗ Necha kun oldin? <code>/oldin 7</code> kabi yozing (0 dan 365 gacha).',
            { parse_mode: 'HTML' },
          );
          return;
        }
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - n);
        await getReport(ctx, d);
      });

      // Actions (inline keyboard buttons)
      bot.action('report_today', (ctx) => getReport(ctx, new Date()));
      bot.action('report_yesterday', (ctx) => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        getReport(ctx, d);
      });
      bot.action('report_d3', (ctx) => {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 3);
        getReport(ctx, d);
      });
      bot.action('report_d7', (ctx) => {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 7);
        getReport(ctx, d);
      });
      bot.action('report_week', sendWeekSummary);
      bot.action('date_help', sendDateHelp);
      bot.action('help_action', sendHelp);

      // Set Bot Commands Menu
      try {
        await bot.telegram.setMyCommands([
          { command: 'bugun', description: 'Bugungi moliyaviy hisobot' },
          { command: 'kecha', description: 'Kechagi moliyaviy hisobot' },
          { command: 'sana', description: 'Ko\'rsatilgan sana hisoboti (YIL-OY-KUN)' },
          { command: 'oldin', description: 'N kun oldingi hisobot' },
          { command: 'hafta', description: 'So\'nggi 7 kun yakuni' },
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

  formatReportMessage(date: Date, report: any): string {
    const lines: string[] = [];

    lines.push(`📊 <b>${formatDateLabel(date)} — kunlik moliyaviy hisobot</b>`);
    lines.push('');

    // ──────── SAVDO ────────
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🍽 <b>Savdo</b>`);
    lines.push(`  Yopilgan buyurtmalar: <b>${report.sales.closedOrders}</b> ta`);
    lines.push(`  Brutto savdo: <b>${formatMoney(report.sales.grossSales)}</b> so'm`);
    if (Number(report.sales.discounts) > 0) {
      lines.push(`  Chegirmalar: <b>−${formatMoney(report.sales.discounts)}</b> so'm`);
    }
    lines.push(`  Sof ovqat savdosi: <b>${formatMoney(report.sales.netSales)}</b> so'm`);
    lines.push(`  Xizmat haqi (ofitsiantlarga): <b>${formatMoney(report.sales.serviceCharge)}</b> so'm`);

    if (report.sales.walkoutOrders > 0) {
      lines.push(`  ⚠ Walkout: <b>${report.sales.walkoutOrders}</b> ta`);
    }
    if (report.sales.canceledOrders > 0) {
      lines.push(`  Bekor qilinganlar: <b>${report.sales.canceledOrders}</b> ta`);
    }
    lines.push('');

    // ──────── PUL OQIMI ────────
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💵 <b>Pul oqimi (kassa)</b>`);
    lines.push(`  Naqd savdolardan: <b>${formatMoney(report.cashflow.orderCash)}</b> so'm`);
    lines.push(`  Karta savdolardan: <b>${formatMoney(report.cashflow.orderCard)}</b> so'm`);
    if (Number(report.sales.debtSales) > 0) {
      lines.push(`  Qarzga sotildi: <b>${formatMoney(report.sales.debtSales)}</b> so'm`);
    }
    const debtRepaidTotal =
      Number(report.cashflow.debtRepaymentsCash) + Number(report.cashflow.debtRepaymentsCard);
    if (debtRepaidTotal > 0) {
      lines.push(`  Qaytgan qarz: <b>${formatMoney(debtRepaidTotal)}</b> so'm`);
    }
    lines.push(`  📥 Jami pul tushdi: <b>${formatMoney(report.cashflow.realCashIn)}</b> so'm`);
    lines.push('');

    // ──────── XARAJATLAR ────────
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📤 <b>Xarajatlar</b>`);
    lines.push(`  Brutto: <b>${formatMoney(report.expenses.gross)}</b> so'm`);
    if (Number(report.expenses.reversal) > 0) {
      lines.push(`  Bekor qilingan: <b>−${formatMoney(report.expenses.reversal)}</b> so'm`);
    }
    lines.push(`  Operatsion (foyda hisobida): <b>${formatMoney(report.expenses.operating)}</b> so'm`);
    if (Number(report.expenses.pendingRepayable) > 0) {
      lines.push(`  ⏳ Kutilayotgan qaytim: <b>${formatMoney(report.expenses.pendingRepayable)}</b> so'm`);
    }

    // Top expense categories (top 3 by absolute amount)
    if (Array.isArray(report.expenses.byCategory) && report.expenses.byCategory.length > 0) {
      const top = [...report.expenses.byCategory]
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

    // ──────── FOYDA ────────
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`💰 <b>Foyda hisobi</b>`);
    lines.push(`  Savdo asosida: <b>${formatMoney(report.results.salesBasedProfit)}</b> so'm`);
    lines.push(`  Pul oqimi natijasi: <b>${formatMoney(report.results.cashflowBasedNet)}</b> so'm`);
    lines.push(`  Ochiq qarz qoldig'i: <b>${formatMoney(report.debtSnapshot.outstandingTotal)}</b> so'm`);
    lines.push('');

    // ──────── OFITSIANTLAR ────────
    if (Array.isArray(report.perWaiter) && report.perWaiter.length > 0) {
      const top = [...report.perWaiter]
        .sort((a: any, b: any) => Number(b.revenue) - Number(a.revenue))
        .slice(0, 5);
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`👤 <b>Ofitsiantlar (top ${top.length})</b>`);
      top.forEach((w: any, idx: number) => {
        lines.push(
          `  ${idx + 1}. ${w.waiterName} — <b>${w.orders}</b> buyurtma · ${formatMoney(w.revenue)} so'm · xizmat haqi <b>${formatMoney(w.serviceEarned)}</b>`,
        );
      });
      lines.push('');
    }

    // ──────── TOP MAHSULOTLAR ────────
    if (Array.isArray(report.mealSales) && report.mealSales.length > 0) {
      const top = report.mealSales.slice(0, 5);
      lines.push('━━━━━━━━━━━━━━━━━━━━');
      lines.push(`🍱 <b>Eng ko'p sotilgan mahsulotlar (top ${top.length})</b>`);
      top.forEach((item: any) => {
        lines.push(`  • ${item.mealName}: <b>${item.qtyOrdered}</b> ta — ${formatMoney(item.grossSales)} so'm`);
      });
    }

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
    const first = days[0].date;
    const last = days[days.length - 1].date;
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
      const sales = Number(report?.sales?.netSales ?? 0) + Number(report?.sales?.serviceCharge ?? 0);
      const profit = Number(report?.results?.salesBasedProfit ?? 0);
      const orders = report?.sales?.closedOrders ?? 0;
      const walkouts = report?.sales?.walkoutOrders ?? 0;
      totalSales += sales;
      totalCashIn += Number(report?.cashflow?.realCashIn ?? 0);
      totalOperating += Number(report?.expenses?.operating ?? 0);
      totalProfit += profit;
      totalServiceCharge += Number(report?.sales?.serviceCharge ?? 0);
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
    lines.push(`  Buyurtmalar: <b>${totalOrders}</b> ta` + (totalWalkouts > 0 ? ` · walkout: ${totalWalkouts}` : ''));
    lines.push(`  Savdo: <b>${formatMoney(totalSales)}</b> so'm`);
    lines.push(`  Xizmat haqi (jami): <b>${formatMoney(totalServiceCharge)}</b> so'm`);
    lines.push(`  Real kassa kirimi: <b>${formatMoney(totalCashIn)}</b> so'm`);
    lines.push(`  Operatsion xarajat: <b>${formatMoney(totalOperating)}</b> so'm`);
    lines.push(`  Savdo foydasi (jami): <b>${formatMoney(totalProfit)}</b> so'm`);

    return lines.join('\n');
  },
};
