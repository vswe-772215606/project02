import type { Discount, Order, OrderLine, Table } from '@prisma/client';
import { formatDateTimeUZ, formatUZS } from '../lib/format';

type OrderForReceipt = Order & {
  lines: OrderLine[];
  table: Table | null;
  appliedDiscount: Discount | null;
};

const safe = (value: string) => value.replace(/[|;\r\n]/g, ' ').trim();

export function buildBillArgs(
  order: OrderForReceipt,
  opts: { storeHeading: string },
): string[] {
  const subtotal = order.subtotalSnapshot?.toString() ?? '0';
  const discount = order.discountAmountSnapshot?.toString() ?? '0';
  const total = order.totalSnapshot?.toString() ?? '0';

  const orderInfoLines: string[] = [`Buyurtma #${order.id.slice(-6)}`];
  if (order.orderType === 'DINE_IN' && order.table) {
    orderInfoLines.push(`Stol: ${order.table.name}`);
  }
  orderInfoLines.push(`Tur: ${order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}`);
  orderInfoLines.push(`Sana: ${formatDateTimeUZ(order.approvedAt ?? new Date())}`);

  const items = order.lines
    .filter((line) => !line.isCanceled)
    .map((line) => [
      safe(line.nameSnapshot),
      line.quantity.toString(),
      line.unitPriceSnapshot.toString(),
      (Number(line.unitPriceSnapshot) * line.quantity).toString(),
    ].join('|'))
    .join(';');

  return [
    opts.storeHeading,
    orderInfoLines.map(safe).join('\n'),
    items,
    formatUZS(subtotal),
    formatUZS(discount),
    formatUZS(total),
  ];
}
