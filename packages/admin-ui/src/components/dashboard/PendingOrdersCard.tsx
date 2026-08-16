import { Chip, Field, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Order } from '@/api/orders';

function placeOf(order: Order): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan';
}

/**
 * The reason Bugun exists: orders sitting in SENT, waiting on the admin to
 * confirm and take payment. Each one is a chip rather than a row — this is
 * a glance count, not the worklist itself (that's Tasdiqlash). The amount
 * sits beside the chip, not inside it, because a chip is a 12px label and
 * money never renders below 17px.
 */
export function PendingOrdersCard({ orders }: { orders: Order[] }) {
  if (orders.length === 0) {
    return (
      <Field className="text-[14.5px] text-muted-foreground">
        Tasdiqlanmagan buyurtma yo&apos;q
      </Field>
    );
  }

  return (
    <Seam className="content-start">
      <Field tone="live">
        <div className="text-[17px] font-semibold">
          {orders.length} ta buyurtma tasdiqlanmagan
        </div>
      </Field>
      <Field className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {orders.map((order) => (
          <div key={order.id} className="flex items-center gap-2.5">
            <Chip tone="live">{placeOf(order)}</Chip>
            <span className="text-[17px] font-semibold tabular-nums">
              {formatMoney(order.totalAmount)}
            </span>
          </div>
        ))}
      </Field>
    </Seam>
  );
}
