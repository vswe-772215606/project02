import { Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Order } from '@/api/orders';

const COLUMNS = '1fr 132px';

function placeOf(order: Order): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan';
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/**
 * The confirm queue.
 *
 * Every entry names its place, its waiter, its time and its amount, because
 * several takeaway orders otherwise render an identical label and the operator
 * has nothing to tell them apart by.
 */
export function QueueList({
  orders,
  selectedId,
  onSelect,
}: {
  orders: Order[];
  selectedId: string | null;
  onSelect: (order: Order) => void;
}) {
  return (
    <Seam className="content-start">
      {orders.map((order) => (
        <Row
          key={order.id}
          columns={COLUMNS}
          selected={order.id === selectedId}
          onClick={() => onSelect(order)}
        >
          <span className="min-w-0 truncate">
            {placeOf(order)}
            <RowSub>
              {order.waiter?.fullName ?? '—'} · {timeOf(order.createdAt)} · {order.itemCount} pozitsiya
            </RowSub>
          </span>
          <RowMoney>{formatMoney(order.totalAmount)}</RowMoney>
        </Row>
      ))}
    </Seam>
  );
}
