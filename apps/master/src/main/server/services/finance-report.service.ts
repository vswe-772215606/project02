import { UserRole } from '@prisma/client';
import { settingRepo } from '../repositories/setting.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { reportsService } from './reports.service';
import { settingsService } from './settings.service';
import { telegramBotService } from './telegram-bot.service';

function formatMoney(value: string) {
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

async function getOwnerUserId(): Promise<string | null> {
  const owners = await userRepo.findByRole(UserRole.OWNER);
  return owners.find((user) => user.isActive)?.id ?? null;
}

export const financeReportService = {
  shouldSendDailyTelegram(now = new Date()) {
    if (!settingsService.getBool('daily_report_telegram_enabled')) {
      return false;
    }

    const timeSetting = settingsService.get('daily_report_telegram_time') || '23:30';
    const [hh, mm] = timeSetting.split(':').map((part) => parseInt(part, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
      return false;
    }

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = hh * 60 + mm;

    return nowMinutes >= targetMinutes;
  },

  async sendDailyTelegramSummary(date = new Date()) {
    const ownerUserId = await getOwnerUserId();
    if (!ownerUserId) {
      return;
    }

    const chatId = settingsService.get('owner_telegram_chat_id') || '';
    const botToken = settingsService.get('telegram_bot_token') || '';
    if (!chatId || !botToken) {
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Setting',
        metadata: {
          date: date.toISOString().slice(0, 10),
          reason: 'missing_telegram_config',
        },
      });
      return;
    }

    const report = await reportsService.daily(date);
    const message = telegramBotService.formatReportMessage(date, report);

    try {
      await telegramBotService.sendMessage(message);
    } catch (error) {
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Report',
        metadata: {
          date: date.toISOString().slice(0, 10),
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }

    await settingRepo.upsert('daily_report_last_sent_date', date.toISOString().slice(0, 10));

    await auditService.log({
      userId: ownerUserId,
      action: 'REPORT_SENT',
      entityType: 'Report',
      metadata: {
        date: date.toISOString().slice(0, 10),
        channel: 'telegram',
      },
    });
  },

  async runScheduledDailyTelegram(now = new Date()) {
    if (!this.shouldSendDailyTelegram(now)) {
      return;
    }

    const reportDate = now.toISOString().slice(0, 10);
    const lastSent = settingsService.get('daily_report_last_sent_date');
    if (lastSent === reportDate) {
      return;
    }

    await this.sendDailyTelegramSummary(now);
    await settingsService.loadAll();
  },
};
