import { settingRepo } from '../repositories/setting.repo';
import { auditService } from './audit.service';

const cache = new Map<string, string>();

export const settingsService = {
  async loadAll(): Promise<void> {
    const all = await settingRepo.findAll();
    cache.clear();
    for (const setting of all) {
      cache.set(setting.key, setting.value);
    }
  },

  get(key: string): string | undefined {
    return cache.get(key);
  },

  getAll(role?: 'OWNER' | 'ADMIN'): Record<string, string> {
    const entries = Array.from(cache.entries()).filter(([key]) => {
      if (role === 'OWNER' || !role) {
        return true;
      }

      return ![
        'daily_report_telegram_enabled',
        'daily_report_telegram_time',
        'telegram_bot_token',
        'owner_telegram_chat_id',
      ].includes(key);
    });

    return Object.fromEntries(entries);
  },

  canEdit(key: string, role: 'OWNER' | 'ADMIN'): boolean {
    if ([
      'max_discount_percent',
      'max_discount_amount',
      'daily_report_telegram_enabled',
      'daily_report_telegram_time',
      'telegram_bot_token',
      'owner_telegram_chat_id',
    ].includes(key)) {
      return role === 'OWNER';
    }

    return [
      'admin_printer_name',
      'store_heading',
      'store_phone',
      'store_address',
    ].includes(key);
  },

  getInt(key: string, fallback = 0): number {
    const value = cache.get(key);
    if (!value) {
      return fallback;
    }
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  },

  getBool(key: string): boolean {
    return cache.get(key) === 'true';
  },

  async set(key: string, value: string, actorUserId: string): Promise<void> {
    await settingRepo.upsert(key, value);
    cache.set(key, value);
    await auditService.log({
      userId: actorUserId,
      action: 'SETTINGS_CHANGED',
      entityType: 'Setting',
      entityId: key,
      metadata: { key, value },
    });
  },
};
