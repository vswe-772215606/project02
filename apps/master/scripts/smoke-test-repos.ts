import { AuditAction, OrderStatus, UserRole } from '@prisma/client';
import { disconnectPrisma } from '../src/main/server/lib/prisma';
import { auditRepo } from '../src/main/server/repositories/audit.repo';
import { dailyStockRepo } from '../src/main/server/repositories/dailyStock.repo';
import { discountRepo } from '../src/main/server/repositories/discount.repo';
import { kitchenRepo } from '../src/main/server/repositories/kitchen.repo';
import { menuRepo } from '../src/main/server/repositories/menu.repo';
import { orderLineRepo } from '../src/main/server/repositories/orderLine.repo';
import { orderRepo } from '../src/main/server/repositories/order.repo';
import { paymentRepo } from '../src/main/server/repositories/payment.repo';
import { printJobRepo } from '../src/main/server/repositories/printJob.repo';
import { sessionRepo } from '../src/main/server/repositories/session.repo';
import { settingRepo } from '../src/main/server/repositories/setting.repo';
import { tableRepo } from '../src/main/server/repositories/table.repo';
import { userRepo } from '../src/main/server/repositories/user.repo';

async function main() {
  console.log('--- users ---');
  const allUsers = await userRepo.findAll();
  console.log('Total users:', allUsers.length);
  console.log('Owners:', (await userRepo.findByRole(UserRole.OWNER)).length);
  console.log('Waiter pin candidates:', (await userRepo.findActiveByPin('ignored')).length);

  console.log('--- sessions ---');
  console.log('Active session for missing token:', await sessionRepo.findActiveByToken('missing-token'));

  console.log('--- categories ---');
  const categories = await menuRepo.listCategories();
  console.log('Total categories:', categories.length);

  console.log('--- menu items ---');
  const menuItems = await menuRepo.listItems();
  console.log('Total menu items:', menuItems.length);
  console.log('Tracked items:', (await menuRepo.listTrackedItems()).length);

  console.log('--- combos ---');
  console.log('Total combos:', (await menuRepo.listCombos()).length);

  console.log('--- tables ---');
  const tables = await tableRepo.listAll();
  console.log('Total tables:', tables.length);
  console.log('Active order on first table:', await tableRepo.findActiveOrderId(tables[0]!.id));

  console.log('--- orders ---');
  console.log('Active orders:', (await orderRepo.listActive()).length);
  console.log('Draft orders:', (await orderRepo.listByStatus(OrderStatus.DRAFT)).length);

  console.log('--- order lines ---');
  console.log('Unsent lines for missing order:', (await orderLineRepo.findUnsentByOrderId('missing-order')).length);

  console.log('--- kitchen ---');
  console.log('Active tickets:', (await kitchenRepo.listActive()).length);

  console.log('--- discounts ---');
  console.log('Active discounts:', (await discountRepo.listActive()).length);

  console.log('--- payments ---');
  console.log('Payments for missing order:', (await paymentRepo.findByOrderId('missing-order')).length);
  console.log('Today payments:', await paymentRepo.aggregateByMethodForDate(new Date()));

  console.log('--- audit ---');
  const auditPage = await auditRepo.list({
    action: AuditAction.USER_CREATED,
    page: 1,
    pageSize: 10,
  });
  console.log('Audit items:', auditPage.items.length, 'total:', auditPage.total);

  console.log('--- settings ---');
  console.log('Total settings:', (await settingRepo.findAll()).length);
  console.log('Store heading exists:', Boolean(await settingRepo.findByKey('store_heading')));

  console.log('--- print jobs ---');
  console.log('Failed print jobs since today:', (await printJobRepo.listFailedSinceDate(new Date(0))).length);

  console.log('--- daily stock ---');
  console.log('Daily stock rows today:', (await dailyStockRepo.listForDate(new Date())).length);
  console.log('Daily stock history for missing item:', (await dailyStockRepo.historyForItem('missing-item', new Date(0), new Date())).length);

  console.log('--- partial unique index ---');
  console.log('Creating two active orders on the same table should raise Prisma P2002 once services begin writing orders.');

  await disconnectPrisma();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await disconnectPrisma();
  process.exit(1);
});
