import { Input } from '@/components/ui/input';
import { Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Order } from '@/api/orders';

const COLUMNS = '1fr 132px';

function placeOf(order: Order): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan';
}

function shortOrderNumber(orderNumber: string | null | undefined): string {
  if (!orderNumber) return '—';
  return orderNumber.slice(-6).toUpperCase();
}

function timeOf(order: Order): string {
  const iso = order.status === 'CLOSED' && order.closedAt ? order.closedAt : order.createdAt;
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Order history: search up top, then every order in the active status tab
 * as a Row. The tab already scopes the status, so a row doesn't repeat it.
 */
export function OrderList({
  orders,
  search,
  onSearchChange,
  selectedId,
  onSelect,
}: {
  orders: Order[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (order: Order) => void;
}) {
  return (
    <Seam className="content-start">
      <Input
        type="text"
        placeholder="Buyurtma yoki stol qidirish..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      {orders.length === 0 ? (
        <div className="bg-field px-pad py-8 text-center text-[14px] text-muted-foreground">
          {search ? 'Mos buyurtma topilmadi' : "Bu holatda buyurtma yo'q"}
        </div>
      ) : (
        orders.map((order) => (
          <Row
            key={order.id}
            columns={COLUMNS}
            selected={order.id === selectedId}
            onClick={() => onSelect(order)}
          >
            <span className="min-w-0 truncate">
              {placeOf(order)}
              <RowSub>
                #{shortOrderNumber(order.orderNumber)} · {order.waiter?.fullName ?? '—'} ·{' '}
                {timeOf(order)}
              </RowSub>
            </span>
            <RowMoney>{formatMoney(order.totalSnapshot ?? order.totalAmount)}</RowMoney>
          </Row>
        ))
      )}
    </Seam>
  );
}
