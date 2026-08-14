import { Chip, type ChipTone, Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Order } from '@/api/orders';

const STATUS_LABEL: Record<Order['status'], string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  CANCELED: 'Bekor qilingan',
};

const STATUS_TONE: Record<Order['status'], ChipTone> = {
  DRAFT: 'inert',
  SENT: 'live',
  CLOSED: 'settled',
  CANCELED: 'inert',
};

const COLUMNS = '1fr 96px 132px';

function placeOf(order: Order): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan';
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/**
 * What just happened, regardless of status — the one place on this screen
 * that shows more than the two work queues above it. Read-only: the detail
 * and the actions on an order live on Buyurtmalar, not here.
 */
export function RecentOrdersList({ orders }: { orders: Order[] }) {
  return (
    <Seam className="content-start">
      <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        So&apos;nggi buyurtmalar
      </div>

      {orders.length === 0 ? (
        <div className="bg-field px-pad py-6 text-center text-[14px] text-muted-foreground">
          Hozircha buyurtma yo&apos;q
        </div>
      ) : (
        orders.map((order) => (
          <Row key={order.id} columns={COLUMNS}>
            <span className="min-w-0 truncate">
              {placeOf(order)}
              <RowSub>
                {order.waiter?.fullName ?? '—'} · {timeOf(order.createdAt)}
              </RowSub>
            </span>
            <span>
              <Chip tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Chip>
            </span>
            <RowMoney>{formatMoney(order.totalSnapshot ?? order.totalAmount)}</RowMoney>
          </Row>
        ))
      )}
    </Seam>
  );
}
