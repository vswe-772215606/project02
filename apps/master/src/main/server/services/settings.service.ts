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

  getAll(): Record<string, string> {
    return Object.fromEntries(cache.entries());
  },

  canEdit(key: string, role: 'OWNER' | 'ADMIN'): boolean {
    if ([
      'service_charge_amount',
      'max_discount_percent',
      'max_discount_amount',
    ].includes(key)) {
      return role === 'OWNER';
    }

    return [
      'kitchen_printer_enabled',
      'admin_printer_name',
      'kitchen_printer_name',
      'store_heading',
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
