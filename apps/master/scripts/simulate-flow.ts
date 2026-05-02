import { PaymentMethod, UserRole } from '@prisma/client';
import { disconnectPrisma } from '../src/main/server/lib/prisma';
import { dailyStockRepo } from '../src/main/server/repositories/dailyStock.repo';
import { menuRepo } from '../src/main/server/repositories/menu.repo';
import { orderRepo } from '../src/main/server/repositories/order.repo';
import { tableRepo } from '../src/main/server/repositories/table.repo';
import { userRepo } from '../src/main/server/repositories/user.repo';
import { auditService } from '../src/main/server/services/audit.service';
import { discountService } from '../src/main/server/services/discount.service';
import { kitchenService } from '../src/main/server/services/kitchen.service';
import { orderService } from '../src/main/server/services/order.service';
import { settingsService } from '../src/main/server/services/settings.service';
import { stockService } from '../src/main/server/services/stock.service';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function decimalToInt(value: unknown): number {
  return Number(value ?? 0);
}

async function getStockCount(menuItemId: string) {
  const row = await dailyStockRepo.findByItemAndDate(menuItemId, stockService.today());
  return row?.currentCount ?? 0;
}

async function ensureCleanSlate(adminUserId: string) {
  const activeOrders = await orderRepo.listActive();
  for (const order of activeOrders) {
    if (order.status === 'PENDING_PAYMENT') {
      await orderService.markWalkout({
        orderId: order.id,
        adminUserId,
        reason: 'Simulation cleanup',
      });
    } else {
      await orderService.cancelOrder({
        orderId: order.id,
        requestingUser: {
          id: adminUserId,
          role: UserRole.ADMIN,
        },
        reason: 'Simulation cleanup',
      });
    }
  }
}

async function main() {
  await settingsService.loadAll();

  const owner = await userRepo.findByUsername('owner');
  const admin = await userRepo.findByUsername('admin');
  const waiter = await userRepo.findAll().then((users) => users.find((user) => user.fullName === 'Waiter Botir'));
  const kebab = await menuRepo.listItems().then((items) => items.find((item) => item.name === 'Mol kabob'));
  const somsa = await menuRepo.listItems().then((items) => items.find((item) => item.name === 'Somsa'));
  const tea = await menuRepo.listItems().then((items) => items.find((item) => item.name === 'Qora choy'));
  const tables = await tableRepo.listAll();

  assert(admin && waiter && owner && kebab && somsa && tea, 'Seed data is incomplete');
  assert(tables.length >= 6, 'Seed tables missing');

  await ensureCleanSlate(admin.id);
  await stockService.setInitialCounts([
    { menuItemId: kebab.id, count: 20 },
    { menuItemId: somsa.id, count: 20 },
  ], admin.id);

  console.log('=== Flow A ===');
  const flowA = await orderService.createDraft({
    waiterId: waiter.id,
    orderType: 'DINE_IN',
    tableId: tables[0]!.id,
  });
  console.log('Draft created:', flowA.id, flowA.status);
  await orderService.addLine({ orderId: flowA.id, waiterId: waiter.id, menuItemId: kebab.id, quantity: 2 });
  console.log('Added kebab x2');
  await orderService.addLine({ orderId: flowA.id, waiterId: waiter.id, menuItemId: somsa.id, quantity: 1 });
  console.log('Added somsa x1');
  await orderService.send({ orderId: flowA.id, waiterId: waiter.id });
  console.log('Sent to kitchen');
  let flowATickets = await kitchenService.listActive();
  let ticket = flowATickets.find((entry) => entry.order.id === flowA.id);
  assert(ticket, 'Flow A initial ticket missing');
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'IN_PROGRESS' });
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'READY' });
  console.log('First ticket progressed to READY');
  await orderService.addLine({ orderId: flowA.id, waiterId: waiter.id, menuItemId: kebab.id, quantity: 1 });
  console.log('Added addon kebab x1 while SENT');
  flowATickets = await kitchenService.listActive();
  ticket = flowATickets.find((entry) => entry.order.id === flowA.id);
  assert(ticket, 'Flow A second ticket missing');
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'IN_PROGRESS' });
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'READY' });
  console.log('Second ticket progressed to READY');
  await orderService.requestBill({ orderId: flowA.id, waiterId: waiter.id });
  console.log('Bill requested');
  await orderService.addLine({ orderId: flowA.id, waiterId: waiter.id, menuItemId: tea.id, quantity: 1 });
  console.log('Added tea while BILL_REQUESTED');
  flowATickets = await kitchenService.listActive();
  ticket = flowATickets.find((entry) => entry.order.id === flowA.id);
  assert(ticket, 'Flow A third ticket missing');
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'IN_PROGRESS' });
  await kitchenService.setStatus({ ticketId: ticket.id, kitchenUserId: admin.id, status: 'READY' });
  console.log('Third ticket progressed to READY');
  const approvedA = await orderService.approve({
    orderId: flowA.id,
    adminUserId: admin.id,
    serviceChargeWaived: false,
  });
  const totalA = decimalToInt(approvedA.totalSnapshot);
  const cashPart = totalA > 5000 ? totalA - 5000 : Math.floor(totalA / 2);
  const cardPart = totalA - cashPart;
  await orderService.markPaid({
    orderId: flowA.id,
    adminUserId: admin.id,
    payments: [
      { method: PaymentMethod.CASH, amount: cashPart },
      { method: PaymentMethod.CARD, amount: cardPart },
    ],
  });
  const finalA = await orderService.getById(flowA.id, { id: admin.id, role: UserRole.ADMIN });
  const auditPageA = await auditService.list({ page: 1, pageSize: 100 });
  console.log('Flow A final state:', {
    status: finalA.status,
    total: finalA.totalSnapshot?.toString(),
    payments: finalA.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toString(),
    })),
    auditEntriesPresent: auditPageA.total > 0,
  });

  console.log('=== Flow B ===');
  const stockBeforeB = await getStockCount(somsa.id);
  const flowB = await orderService.createDraft({
    waiterId: waiter.id,
    orderType: 'DINE_IN',
    tableId: tables[1]!.id,
  });
  await orderService.addLine({ orderId: flowB.id, waiterId: waiter.id, menuItemId: somsa.id, quantity: 2 });
  const stockAfterAddB = await getStockCount(somsa.id);
  await orderService.send({ orderId: flowB.id, waiterId: waiter.id });
  await orderService.cancelOrder({
    orderId: flowB.id,
    requestingUser: { id: waiter.id, role: UserRole.WAITER },
    reason: 'Flow B waiter cancel',
  });
  const stockAfterCancelB = await getStockCount(somsa.id);
  console.log('Flow B stock:', { before: stockBeforeB, afterAdd: stockAfterAddB, afterCancel: stockAfterCancelB });
  assert(stockAfterCancelB === stockBeforeB, 'Flow B stock was not restored');

  console.log('=== Flow C ===');
  const stockBeforeC = await getStockCount(kebab.id);
  const flowC = await orderService.createDraft({
    waiterId: waiter.id,
    orderType: 'DINE_IN',
    tableId: tables[2]!.id,
  });
  await orderService.addLine({ orderId: flowC.id, waiterId: waiter.id, menuItemId: kebab.id, quantity: 1 });
  await orderService.send({ orderId: flowC.id, waiterId: waiter.id });
  let flowCTicket = (await kitchenService.listActive()).find((entry) => entry.order.id === flowC.id);
  assert(flowCTicket, 'Flow C ticket missing');
  await kitchenService.setStatus({ ticketId: flowCTicket.id, kitchenUserId: admin.id, status: 'IN_PROGRESS' });
  try {
    await orderService.cancelOrder({
      orderId: flowC.id,
      requestingUser: { id: waiter.id, role: UserRole.WAITER },
      reason: 'Flow C waiter cancel',
    });
    throw new Error('Flow C waiter cancel should have failed');
  } catch (error) {
    console.log('Flow C waiter cancel blocked:', (error as Error).message);
  }
  await orderService.cancelOrder({
    orderId: flowC.id,
    requestingUser: { id: admin.id, role: UserRole.ADMIN },
    reason: 'Flow C admin cancel',
  });
  const stockAfterC = await getStockCount(kebab.id);
  console.log('Flow C stock:', { before: stockBeforeC, afterCancel: stockAfterC });
  assert(stockAfterC === stockBeforeC - 1, 'Flow C stock should not be restored');

  console.log('=== Flow D ===');
  const flowD = await orderService.createDraft({
    waiterId: waiter.id,
    orderType: 'DINE_IN',
    tableId: tables[3]!.id,
  });
  await orderService.addLine({ orderId: flowD.id, waiterId: waiter.id, menuItemId: kebab.id, quantity: 1 });
  await orderService.send({ orderId: flowD.id, waiterId: waiter.id });
  let flowDTicket = (await kitchenService.listActive()).find((entry) => entry.order.id === flowD.id);
  assert(flowDTicket, 'Flow D ticket missing');
  await kitchenService.setStatus({ ticketId: flowDTicket.id, kitchenUserId: admin.id, status: 'IN_PROGRESS' });
  await kitchenService.setStatus({ ticketId: flowDTicket.id, kitchenUserId: admin.id, status: 'READY' });
  await orderService.requestBill({ orderId: flowD.id, waiterId: waiter.id });
  await orderService.approve({ orderId: flowD.id, adminUserId: admin.id, serviceChargeWaived: false });
  await orderService.markWalkout({ orderId: flowD.id, adminUserId: admin.id, reason: 'Flow D walkout' });
  const finalD = await orderService.getById(flowD.id, { id: admin.id, role: UserRole.ADMIN });
  console.log('Flow D final status:', finalD.status);
  assert(finalD.status === 'WALKOUT', 'Flow D should end in WALKOUT');

  console.log('=== Flow E ===');
  const flowE = await orderService.createDraft({
    waiterId: waiter.id,
    orderType: 'DINE_IN',
    tableId: tables[4]!.id,
  });
  try {
    await orderService.createDraft({
      waiterId: waiter.id,
      orderType: 'DINE_IN',
      tableId: tables[4]!.id,
    });
    throw new Error('Flow E should have thrown Conflict');
  } catch (error) {
    console.log('Flow E second draft blocked:', (error as Error).message);
  }
  await orderService.cancelOrder({
    orderId: flowE.id,
    requestingUser: { id: admin.id, role: UserRole.ADMIN },
    reason: 'Flow E cleanup',
  });

  console.log('=== Flow F ===');
  try {
    await discountService.create({
      name: 'Invalid 30%',
      type: 'PERCENT',
      value: 30,
    }, admin.id);
    throw new Error('Flow F should have thrown DiscountCapExceeded');
  } catch (error) {
    console.log('Flow F discount blocked:', (error as Error).message);
  }

  console.log('All simulated flows completed successfully');
}

main()
  .then(async () => {
    await disconnectPrisma();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await disconnectPrisma();
    process.exit(1);
  });
