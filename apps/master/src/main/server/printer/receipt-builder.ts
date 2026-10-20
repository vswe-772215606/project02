import { formatDateTimeUZ, formatUZS } from '../lib/format';

/**
 * receipt.exe takes six arguments, in this order:
 *
 *   [heading, orderInfo, items, jami, chegirma, umumiy]
 *
 * `items` is `name|qty|unit|amount` rows joined by `;`; the other five are
 * plain text. The binary and that protocol are fixed (cpp/receipt.cpp is not
 * rebuilt here); what goes into the six strings is decided in this file.
 */

/** A money value as Prisma hands it over — a Decimal — or already a number or a digit string. */
export type MoneyLike = number | string | { toString(): string };

export type ReceiptLine = {
  nameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: MoneyLike;
  isCanceled: boolean;
};

export type ReceiptPayment = {
  method: 'CASH' | 'CARD' | 'DEBT';
  amount: MoneyLike;
};

/**
 * What the slip needs from a closed order. Structural on purpose: the confirm
 * hands over the order it re-read inside its transaction
 * (orderRepo.findByIdWithDetails, which includes payments and the debt) and
 * the reprint hands over the same shape.
 */
export type ReceiptOrder = {
  id: string;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  approvedAt: Date | null;
  subtotalSnapshot: MoneyLike | null;
  discountAmountSnapshot: MoneyLike | null;
  serviceChargeSnapshot: MoneyLike | null;
  totalSnapshot: MoneyLike | null;
  lines: ReceiptLine[];
  table: { name: string } | null;
  payments: ReceiptPayment[];
  debt: { debtorName: string } | null;
};

export type ReceiptStore = {
  storeHeading: string;
  storePhone?: string;
  storeAddress?: string;
};

function toNumber(value: MoneyLike | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const parsed = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  // NBSP, figure space, narrow NBSP, thin space — written as escapes so an
  // editor cannot silently flatten them into plain spaces (which would turn
  // the map entries into no-ops and print these characters as `?`).
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

const PAYMENT_LABEL: Record<Exclude<ReceiptPayment['method'], 'DEBT'>, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
};

/**
 * How the bill was settled: one line per leg that carries money, in the order
 * the legs were taken. A leg of 0 — the ticket sends empty legs — prints
 * nothing. The debtor's name goes on the Nasiya line, so the slip itself says
 * the bill was not paid (issue 1).
 */
export function paymentLines(order: Pick<ReceiptOrder, 'payments' | 'debt'>): string[] {
  return order.payments
    .filter((payment) => toNumber(payment.amount) > 0)
    .map((payment) => {
      const amount = formatUZS(toNumber(payment.amount));
      if (payment.method === 'DEBT') {
        const debtor = order.debt?.debtorName.trim();
        return debtor ? `Nasiya: ${debtor} ${amount}` : `Nasiya: ${amount}`;
      }
      return `To'lov: ${PAYMENT_LABEL[payment.method]} ${amount}`;
    });
}

export function buildBillArgs(order: ReceiptOrder, opts: ReceiptStore): string[] {
  // The item rows include the Xizmat haqi lines, so Jami — what those rows add
  // up to — is food plus service; Chegirma comes off the food only; Umumiy is
  // what was charged. billing.service freezes total = subtotal − discount +
  // service, so Jami − Chegirma = Umumiy holds on every slip (issue 1).
  const jami = toNumber(order.subtotalSnapshot) + toNumber(order.serviceChargeSnapshot);
  const chegirma = toNumber(order.discountAmountSnapshot);
  const umumiy = toNumber(order.totalSnapshot);

  const orderInfoLines: string[] = [`Buyurtma #${order.id.slice(-6)}`];
  if (order.orderType === 'DINE_IN' && order.table) {
    orderInfoLines.push(`Stol: ${order.table.name}`);
  }
  orderInfoLines.push(`Tur: ${order.orderType === 'DINE_IN' ? 'Zalda' : 'Olib ketish'}`);
  orderInfoLines.push(`Sana: ${formatDateTimeUZ(order.approvedAt ?? new Date())}`);
  orderInfoLines.push(...paymentLines(order));

  const items = order.lines
    .filter((line) => !line.isCanceled)
    .map((line) => {
      const unit = toNumber(line.unitPriceSnapshot);
      return [safe(line.nameSnapshot), String(line.quantity), String(unit), String(unit * line.quantity)].join('|');
    })
    .join(';');

  const headingParts = [opts.storeHeading];
  if (opts.storeAddress) headingParts.push(opts.storeAddress);
  if (opts.storePhone) headingParts.push(`Tel: ${opts.storePhone}`);

  return [
    headingParts.map(safe).join('\n'),
    orderInfoLines.map(safe).join('\n'),
    items,
    formatUZS(jami),
    formatUZS(chegirma),
    formatUZS(umumiy),
  ];
}
