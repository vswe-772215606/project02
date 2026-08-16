import type { Discount, Order, OrderLine, Table } from '@prisma/client';
import { formatDateTimeUZ, formatUZS } from '../lib/format';

type OrderForReceipt = Order & {
  lines: OrderLine[];
  table: Table | null;
  appliedDiscount: Discount | null;
};

// Map non-ASCII characters commonly introduced by copy-paste (smart quotes,
// curly apostrophes used in Uzbek transliteration like o' / g', em/en dashes,
// NBSP, ellipsis) to plain ASCII equivalents. Anything still non-ASCII after
// this is dropped — thermal printers in CJK code-page mode would otherwise
// render multi-byte UTF-8 sequences as Chinese glyphs.
const ASCII_FALLBACKS: Record<string, string> = {
  '‘': "'", '’': "'", 'ʼ': "'", 'ʻ': "'", 'ʹ': "'",
  '´': "'", '`': "'", '‛': "'",
  '“': '"', '”': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '−': '-',
  '…': '...',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
};

function toAscii(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      out += ch;
      continue;
    }
    const replacement = ASCII_FALLBACKS[ch];
    out += replacement ?? '?';
  }
  return out;
}

const safe = (value: string) => toAscii(value).replace(/[|;\r\n]/g, ' ').trim();

export function buildBillArgs(
  order: OrderForReceipt,
  opts: { storeHeading: string; storePhone?: string; storeAddress?: string },
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

  const headingParts = [opts.storeHeading];
  if (opts.storeAddress) headingParts.push(opts.storeAddress);
  if (opts.storePhone) headingParts.push(`Tel: ${opts.storePhone}`);

  return [
    headingParts.map(safe).join('\n'),
    orderInfoLines.map(safe).join('\n'),
    items,
    formatUZS(subtotal),
    formatUZS(discount),
    formatUZS(total),
  ];
}
