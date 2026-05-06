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

      const sendHelp = async (ctx: any) => {
        await ctx.reply(
          'Ushbu bot orqali restoran moliyaviy holatini kuzatib borishingiz mumkin.\n\nBuyruqlar:\n/bugun - Bugungi hisobot\n/kecha - Kechagi hisobot',
          mainMenu
        );
      };

      // Register Commands
      bot.start((ctx) => ctx.reply('✅ Chayxana hisobot boti ishga tushdi.', mainMenu));
      bot.help(sendHelp);
      bot.command(['bugun', 'today'], (ctx) => getReport(ctx, new Date()));
      bot.command(['kecha', 'yesterday'], (ctx) => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        getReport(ctx, d);
      });
      
      // Actions
      bot.action('report_today', (ctx) => getReport(ctx, new Date()));
      bot.action('report_yesterday', (ctx) => {
        const d = new Date(); d.setDate(d.getDate() - 1);
        getReport(ctx, d);
      });
      bot.action('help_action', sendHelp);

      // Set Bot Commands Menu
      try {
        await bot.telegram.setMyCommands([
          { command: 'bugun', description: 'Bugungi moliyaviy hisobot' },
          { command: 'kecha', description: 'Kechagi moliyaviy hisobot' },
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
    const lines = [
      `📊 <b>${formatDateLabel(date)} kunlik hisobot</b>`,
      '',
      `💰 <b>Brutto savdo:</b> ${formatMoney(report.sales.grossSales)} so'm`,
      `📉 <b>Chegirmalar:</b> ${formatMoney(report.sales.discounts)} so'm`,
      `💵 <b>Sof savdo:</b> ${formatMoney(report.sales.netSales)} so'm`,
      `💳 <b>Qarzga savdo:</b> ${formatMoney(report.sales.debtSales)} so'm`,
      `💸 <b>Real tushgan pul:</b> ${formatMoney(report.cashflow.realCashIn)} so'm`,
      `🔄 <b>Qaytgan qarz:</b> ${formatMoney(report.debtSnapshot.repaidTodayAmount)} so'm`,
      `🧾 <b>Kunlik chiqimlar:</b> ${formatMoney(report.expenses.net)} so'm`,
      '',
      `📈 <b>Savdo foydasi:</b> ${formatMoney(report.results.salesBasedProfit)} so'm`,
      `💹 <b>Pul oqimi natijasi:</b> ${formatMoney(report.results.cashflowBasedNet)} so'm`,
      `🛠 <b>Xizmat haqi:</b> ${formatMoney(report.sales.serviceCharge)} so'm`,
      '',
      `🚫 <b>Bekor qilinganlar:</b> ${report.sales.canceledOrders}`,
      `🏃 <b>To'lovsiz ketganlar:</b> ${report.sales.walkoutOrders}`,
      `🏛 <b>Ochiq qarz qoldig'i:</b> ${formatMoney(report.debtSnapshot.outstandingTotal)} so'm`,
      '',
      '🍱 <b>Sotilgan mahsulotlar:</b>',
    ];

    if (report.mealSales && report.mealSales.length > 0) {
      report.mealSales.forEach((item: any) => {
        lines.push(`• ${item.mealName}: <b>${item.qtyOrdered}</b> ta — ${formatMoney(item.grossSales)} so'm`);
      });
    } else {
      lines.push('<i>Ma\'lumot yo\'q</i>');
    }

    lines.push('', '💸 <b>Xarajatlar tafsiloti:</b>');
    if (report.expenses.items && report.expenses.items.length > 0) {
      report.expenses.items.forEach((item: any) => {
        lines.push(`• ${item.reason} (${item.categoryName}): <b>${formatMoney(item.amount)}</b> so'm`);
      });
      lines.push('', `Jami: <b>${report.expenses.items.length}</b> ta chiqim — <b>${formatMoney(report.expenses.net)}</b> so'm`);
    } else {
      lines.push('<i>Chiqimlar yo\'q</i>');
    }

    return lines.join('\n');
  },
};
