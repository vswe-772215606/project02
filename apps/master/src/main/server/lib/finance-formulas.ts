import { PaymentMethod, Prisma } from '@prisma/client';

// `Order` + uning `Payment[]` larini qabul qiladigan minimal shakl.
// Aniq Prisma type ishlatib bog'lamaymiz — bu util har xil
// `include` shakllaridan chaqiriladi.
type PaymentRow = { method: PaymentMethod; amount: Prisma.Decimal | string | number };
type OrderRow = { payments: PaymentRow[] };
type DebtRepaymentRow = { method: PaymentMethod; amount: Prisma.Decimal | string | number };

function dec(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/**
 * Real kunlik kassa kirimi.
 *
 * Spec §6.2.5 ga ko'ra `realCashIn` quyidagilarning yig'indisi:
 *
 *   orderCash + orderCard + debtRepaymentsCash + debtRepaymentsCard
 *   + expenseReturnsTotal
 *
 * `expenseReturnsTotal` (avans/zalog qaytimi) — bu **kassaga qaytgan pul**,
 * shuning uchun cashflow kirimida hisoblanadi. Ilgari ADMIN ekranida shu
 * yig'indi qo'shilgan, OWNER reportida unutilgan edi; endi yagona util
 * ikkala joyda ham chaqiriladi.
 *
 * `DEBT` payment (qarzga sotuv) bu yerga KIRMAYDI — u kelajakdagi qarz, real
 * pul emas.
 */
export function computeRealCashIn(input: {
  closedOrders: OrderRow[];
  debtRepayments: DebtRepaymentRow[];
  expenseReturnsTotal: Prisma.Decimal | string | number;
}): {
  orderCash: Prisma.Decimal;
  orderCard: Prisma.Decimal;
  debtOpened: Prisma.Decimal;
  debtRepaymentsCash: Prisma.Decimal;
  debtRepaymentsCard: Prisma.Decimal;
  expenseReturns: Prisma.Decimal;
  realCashIn: Prisma.Decimal;
} {
  let orderCash = new Prisma.Decimal(0);
  let orderCard = new Prisma.Decimal(0);
  let debtOpened = new Prisma.Decimal(0);

  for (const order of input.closedOrders) {
    for (const p of order.payments) {
      if (p.method === PaymentMethod.CASH) orderCash = orderCash.plus(dec(p.amount));
      else if (p.method === PaymentMethod.CARD) orderCard = orderCard.plus(dec(p.amount));
      else if (p.method === PaymentMethod.DEBT) debtOpened = debtOpened.plus(dec(p.amount));
    }
  }

  let debtRepaymentsCash = new Prisma.Decimal(0);
  let debtRepaymentsCard = new Prisma.Decimal(0);
  for (const r of input.debtRepayments) {
    if (r.method === PaymentMethod.CASH) debtRepaymentsCash = debtRepaymentsCash.plus(dec(r.amount));
    else if (r.method === PaymentMethod.CARD) debtRepaymentsCard = debtRepaymentsCard.plus(dec(r.amount));
  }

  const expenseReturns = dec(input.expenseReturnsTotal);

  const realCashIn = orderCash
    .plus(orderCard)
    .plus(debtRepaymentsCash)
    .plus(debtRepaymentsCard)
    .plus(expenseReturns);

  return {
    orderCash,
    orderCard,
    debtOpened,
    debtRepaymentsCash,
    debtRepaymentsCard,
    expenseReturns,
    realCashIn,
  };
}
