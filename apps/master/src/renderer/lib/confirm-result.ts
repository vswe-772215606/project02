import type { ConfirmResult, Order } from '@/api/orders';

export type PrintFailureNotice = {
  title: string;
  description: string;
};

type BillIdentity = Pick<Order, 'tableName' | 'orderType' | 'orderNumber'>;

/**
 * The bill as the admin can tell it apart: its table, as the queue shows it,
 * or — with no table — its number, which the slip prints too.
 */
export function billName(order: BillIdentity): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY'
    ? `Olib ketish #${order.orderNumber}`
    : `Buyurtma #${order.orderNumber}`;
}

/**
 * What the till says when a confirmed bill did not print, or null when it did.
 * The sale is closed either way (PRD 14 G6), so the notice names the fix, not
 * the error. It names the bill first: with the printer out of paper several
 * notices stack, and each one's "Qayta chop etish" reprints its own bill.
 */
export function printFailureNotice(
  result: Pick<ConfirmResult, 'billPrinted' | 'printError'> & BillIdentity,
): PrintFailureNotice | null {
  if (result.billPrinted) return null;
  const bill = billName(result);
  if (result.printError?.includes('not configured')) {
    return {
      title: 'Chek chiqmadi',
      description: `${bill}: Hisob yopildi, pul yozildi. Chek printeri tanlanmagan: Sozlamalarda tanlang, keyin qayta chop eting.`,
    };
  }
  return {
    title: 'Chek chiqmadi',
    description: `${bill}: Hisob yopildi, pul yozildi. Printerni tekshiring, keyin chekni qayta chop eting.`,
  };
}
