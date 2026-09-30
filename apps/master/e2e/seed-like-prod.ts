import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

/**
 * Exactly what src/main/sqlite-bootstrap.ts seedIfEmpty() writes on the first
 * launch of a packaged Windows install. Copied, not imported: that module
 * imports electron's `app` at load time.
 */
export async function seedLikeProd(prisma: PrismaClient): Promise<void> {
  if ((await prisma.user.count()) > 0) return;
  const hash = (plain: string) => bcrypt.hash(plain, 10);
  await prisma.user.createMany({
    data: [
      { id: 'seed-owner', username: 'owner', passwordHash: await hash('owner123'), fullName: 'Owner', role: 'OWNER', isActive: true, failedLogins: 0 },
      { id: 'seed-admin', username: 'admin', passwordHash: await hash('admin123'), fullName: 'Admin', role: 'ADMIN', isActive: true, failedLogins: 0 },
    ],
  });
  await prisma.setting.createMany({
    data: [
      { key: 'max_discount_amount', value: '100000' },
      { key: 'admin_printer_name', value: 'POS-80' },
      { key: 'store_heading', value: 'Chayxana' },
      { key: 'variance_alert_threshold', value: '50000' },
      { key: 'monthly_kitchen_overhead_uzs', value: '0' },
      { key: 'system_costing_active_since', value: '' },
      { key: 'alerts_telegram_enabled', value: 'true' },
      { key: 'alert_discount_threshold', value: '50000' },
      { key: 'alert_expense_threshold', value: '500000' },
      { key: 'alert_low_stock_enabled', value: 'true' },
    ],
  });
  await prisma.expenseCategory.createMany({
    data: [
      { id: 'seed-cat-ingredients', name: 'Mahsulot xaridi', displayOrder: 1, isActive: true },
      { id: 'seed-cat-operational', name: 'Operatsion', displayOrder: 2, isActive: true },
    ],
  });
}
