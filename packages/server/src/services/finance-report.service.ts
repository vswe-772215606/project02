import { UserRole } from '@prisma/client';
import { settingRepo } from '../repositories/setting.repo';
import { userRepo } from '../repositories/user.repo';
import { auditService } from './audit.service';
import { reportsService } from './reports.service';
import { settingsService } from './settings.service';
import { telegramBotService } from './telegram-bot.service';
import {
  localClockMinutes,
  localDayKey,
  localMonthRangeFor,
  parseLocalDay,
} from '../lib/time';

function previousMonthKey(now: Date): string {
  // Walk back from the start of THIS Tashkent month by one day → previous
  // Tashkent month's last day → take its YYYY-MM slice.
  const thisMonthKey = localDayKey(now).slice(0, 7);
  const thisMonthStart = localMonthRangeFor(thisMonthKey).start;
  const oneDayBefore = new Date(thisMonthStart.getTime() - 86_400_000);
  return localDayKey(oneDayBefore).slice(0, 7);
}

function previousMonthBounds(now: Date): { start: Date; key: string } {
  const key = previousMonthKey(now);
  const { start } = localMonthRangeFor(key);
  return { start, key };
}

function formatMoney(value: string) {
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatDateLabel(date: Date) {
  // Render in Tashkent so the label matches the data the report buckets by.
  const key = localDayKey(date); // YYYY-MM-DD
  const [yyyy, mm, dd] = key.split('-');
  return `${dd}.${mm}.${yyyy}`;
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
    const parts = timeSetting.split(':').map((part) => parseInt(part, 10));
    const hh = parts[0];
    const mm = parts[1];
    if (hh === undefined || mm === undefined || !Number.isFinite(hh) || !Number.isFinite(mm)) {
      return false;
    }

    // Compare against Tashkent wall clock — owner configures "23:30" meaning
    // Tashkent local 23:30, regardless of the server's clock TZ.
    const nowMinutes = localClockMinutes(now);
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
    // Anchor the report to the Tashkent day that contains `date` so the
    // idempotency key and audit metadata never drift across UTC midnight.
    const reportDayKey = localDayKey(date);
    const reportDayAnchor = parseLocalDay(reportDayKey);
    if (!chatId || !botToken) {
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Setting',
        metadata: {
          date: reportDayKey,
          reason: 'missing_telegram_config',
        },
      });
      return;
    }

    const report = await reportsService.daily(reportDayAnchor);
    const message = telegramBotService.formatReportMessage(reportDayAnchor, report);

    try {
      await telegramBotService.sendMessage(message);
    } catch (error) {
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Report',
        metadata: {
          date: reportDayKey,
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }

    await settingRepo.upsert('daily_report_last_sent_date', reportDayKey);

    await auditService.log({
      userId: ownerUserId,
      action: 'REPORT_SENT',
      entityType: 'Report',
      metadata: {
        date: reportDayKey,
        channel: 'telegram',
      },
    });
  },

  async runScheduledDailyTelegram(now = new Date()) {
    if (!this.shouldSendDailyTelegram(now)) {
      return;
    }

    const reportDate = localDayKey(now);
    const lastSent = settingsService.get('daily_report_last_sent_date');
    if (lastSent === reportDate) {
      return;
    }

    await this.sendDailyTelegramSummary(now);
    await settingsService.loadAll();
  },

  // ─────────── Monthly ───────────

  /**
   * On day 1 of the month, once the configured time has passed, send the
   * previous month's owner P&L. Idempotent via monthly_report_last_sent_month.
   */
  shouldSendMonthlyTelegram(now = new Date()) {
    if (!settingsService.getBool('monthly_report_telegram_enabled')) {
      return false;
    }
    // Only on Tashkent day 1 of the month.
    if (!localDayKey(now).endsWith('-01')) {
      return false;
    }
    const timeSetting = settingsService.get('monthly_report_telegram_time') || '09:00';
    const parts = timeSetting.split(':').map((part) => parseInt(part, 10));
    const hh = parts[0];
    const mm = parts[1];
    if (hh === undefined || mm === undefined || !Number.isFinite(hh) || !Number.isFinite(mm)) {
      return false;
    }
    const nowMinutes = localClockMinutes(now);
    const targetMinutes = hh * 60 + mm;
    return nowMinutes >= targetMinutes;
  },

  async sendMonthlyTelegramSummary(now = new Date()) {
    const ownerUserId = await getOwnerUserId();
    if (!ownerUserId) return;

    const chatId = settingsService.get('owner_telegram_chat_id') || '';
    const botToken = settingsService.get('telegram_bot_token') || '';
    if (!chatId || !botToken) {
      const { key } = previousMonthBounds(now);
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Setting',
        metadata: { period: key, kind: 'monthly', reason: 'missing_telegram_config' },
      });
      return;
    }

    const { start, key } = previousMonthBounds(now);
    const report = await reportsService.monthly(start);
    const message = telegramBotService.formatMonthlyMessage(report);

    try {
      await telegramBotService.sendMessage(message);
    } catch (error) {
      await auditService.log({
        userId: ownerUserId,
        action: 'REPORT_SEND_FAILED',
        entityType: 'Report',
        metadata: {
          period: key,
          kind: 'monthly',
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }

    await settingRepo.upsert('monthly_report_last_sent_month', key);

    await auditService.log({
      userId: ownerUserId,
      action: 'REPORT_SENT',
      entityType: 'Report',
      metadata: { period: key, kind: 'monthly', channel: 'telegram' },
    });
  },

  async runScheduledMonthlyTelegram(now = new Date()) {
    if (!this.shouldSendMonthlyTelegram(now)) {
      return;
    }
    const { key } = previousMonthBounds(now);
    const lastSent = settingsService.get('monthly_report_last_sent_month');
    if (lastSent === key) {
      return;
    }
    await this.sendMonthlyTelegramSummary(now);
    await settingsService.loadAll();
  },
};
