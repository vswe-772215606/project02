import type { KitchenTicket, Order, OrderLine, Table } from '@prisma/client';
import { formatDateTimeUZ } from '../lib/format';

type TicketForPrint = KitchenTicket & {
  lines: OrderLine[];
  order: Order & {
    table: Table | null;
  };
};

const safe = (value: string) => value.replace(/[|;\r\n]/g, ' ').trim();

export function buildKitchenTicketArgs(
  ticket: TicketForPrint,
  opts: { heading: string },
): string[] {
  const orderInfoLines: string[] = [`Buyurtma #${ticket.order.id.slice(-6)}`];
  if (ticket.order.orderType === 'DINE_IN' && ticket.order.table) {
    orderInfoLines.push(`Stol: ${ticket.order.table.name}`);
  }
  orderInfoLines.push(`Tur: ${ticket.order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}`);
  orderInfoLines.push(`Sana: ${formatDateTimeUZ(ticket.createdAt)}`);

  const items = ticket.lines
    .filter((line) => !line.isCanceled)
    .map((line) => [
      safe(line.nameSnapshot),
      line.quantity.toString(),
      safe(line.notes ?? ''),
      '',
    ].join('|'))
    .join(';');

  return [
    opts.heading,
    orderInfoLines.map(safe).join('\n'),
    items,
    '',
    '',
    '',
  ];
}
