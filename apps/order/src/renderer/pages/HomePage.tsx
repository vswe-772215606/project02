import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Loader2, ReceiptText } from 'lucide-react';
import { ordersApi, ACTIVE_STATUSES, STATUS_LABELS, type Order } from '@/api/orders';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  CLOSED: 'outline',
  WALKOUT: 'destructive',
  CANCELED: 'outline',
};

export function HomePage() {
  const nav = useNavigate();
  const {
    data: orders = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => ordersApi.list({ mine: true }),
    refetchInterval: 15_000,
  });

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

  return (
    <div className="flex flex-col gap-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mening buyurtmalarim</h2>
          <p className="text-sm text-muted-foreground">
            {activeOrders.length} ta faol buyurtma
          </p>
        </div>
        <Button onClick={() => nav('/orders/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Yangi buyurtma
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : isError ? (
        <div className="text-center py-16 text-destructive">
          Buyurtmalarni yuklab bo&apos;lmadi
        </div>
      ) : activeOrders.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ReceiptText className="h-10 w-10 text-muted-foreground" />
          <div className="text-base font-medium">Faol buyurtmalar yo&apos;q</div>
          <p className="text-sm text-muted-foreground max-w-sm">
            Yangi buyurtma yarating va menyudan mahsulot tanlang.
          </p>
          <Button onClick={() => nav('/orders/new')} className="gap-2">
            <Plus className="h-4 w-4" />
            Yangi buyurtma
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {activeOrders.map((order) => (
            <OrderCard key={order.id} order={order} onPress={() => nav(`/orders/${order.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY'
    ? 'Olib ketish'
    : order.table?.name ?? order.tableName ?? 'Stol';
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const total = activeLines.reduce((s, l) => s + l.price * l.quantity, 0);

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-colors hover:border-primary flex flex-col gap-2',
      )}
      onClick={onPress}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold">{tableLabel}</div>
        <Badge variant={STATUS_VARIANTS[order.status] ?? 'secondary'}>
          {STATUS_LABELS[order.status]}
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground">#{order.orderNumber}</div>
      <div className="flex items-center justify-between text-sm mt-1">
        <span className="text-muted-foreground">
          {activeLines.length} ta qator
        </span>
        <span className="font-semibold tabular-nums">{formatMoney(total)} so&apos;m</span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {formatDateTime(order.createdAt)}
      </div>
    </Card>
  );
}
