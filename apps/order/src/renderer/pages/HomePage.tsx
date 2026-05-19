import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Plus, ShoppingBag } from 'lucide-react';
import { tablesApi, type Table } from '@/api/tables';
import { ordersApi, type Order, type OrderStatus } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { useConnectionStore } from '@/stores/connection.store';
import { formatMoney } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Floor map = home. Optimised for rush moments:
//   - empty table → one tap creates a DRAFT and opens it
//   - occupied table owned by me → one tap reopens with running total visible
//   - occupied by another waiter → disabled with "Band"
//   - persistent "Olib ketish" tile at the top for takeaway
//
// Tables refresh every 10s and we listen for socket order:* events via the
// global useSocket hook which invalidates ['tables']/['orders'] caches.

const STATUS_VARIANTS: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  CLOSED: 'outline',
  WALKOUT: 'destructive',
  CANCELED: 'outline',
};

const STATUS_LABEL_SHORT: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lamay",
  CANCELED: 'Bekor',
};

export function HomePage() {
  const nav = useNavigate();
  const showToast = useToastStore((s) => s.show);
  const offline = useConnectionStore((s) => s.status) !== 'online';

  const {
    data: tables = [],
    isLoading: loadingTables,
    isError: tablesError,
  } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.list,
    refetchInterval: 10_000,
  });

  // My-orders gives us total / status / line count per occupied table.
  const { data: myOrders = [] } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => ordersApi.list({ mine: true }),
    refetchInterval: 10_000,
  });

  const myOrderByTable = new Map<string, Order>();
  for (const o of myOrders) {
    if (o.tableId && (o.status === 'DRAFT' || o.status === 'SENT')) {
      myOrderByTable.set(o.tableId, o);
    }
  }

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      nav(`/orders/${order.id}`);
    },
    onError: (err: Error) => {
      showToast(err.message || "Buyurtma yaratib bo'lmadi", 'error');
    },
  });

  const handleTablePress = (table: Table) => {
    if (offline) return;
    const occupiedByMe = myOrderByTable.get(table.id);
    if (occupiedByMe) {
      nav(`/orders/${occupiedByMe.id}`);
      return;
    }
    if (table.activeOrderId) {
      // Occupied by another waiter — block.
      showToast('Stol band (boshqa ofitsiant)', 'error');
      return;
    }
    if (createMutation.isPending) return;
    createMutation.mutate({ orderType: 'DINE_IN', tableId: table.id });
  };

  const handleTakeaway = () => {
    if (offline || createMutation.isPending) return;
    createMutation.mutate({ orderType: 'TAKEAWAY' });
  };

  const activeTables = tables.filter((t) => t.isActive);
  const occupiedByMeCount = activeTables.filter((t) => myOrderByTable.has(t.id)).length;
  const occupiedByOthersCount = activeTables.filter(
    (t) => !!t.activeOrderId && !myOrderByTable.has(t.id),
  ).length;
  const freeCount = activeTables.length - occupiedByMeCount - occupiedByOthersCount;

  // Standalone takeaways waiting (no tableId) — surface as a strip too.
  const takeawayOrders = myOrders.filter(
    (o) => !o.tableId && (o.status === 'DRAFT' || o.status === 'SENT'),
  );

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Stollar</h2>
          <p className="text-sm text-muted-foreground">
            {activeTables.length} ta — {occupiedByMeCount} meniki ·
            {' '}
            {occupiedByOthersCount} band · {freeCount} bo&apos;sh
          </p>
        </div>
      </div>

      {/* Takeaway lane: existing takeaway orders + a "new takeaway" tile */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={handleTakeaway}
          disabled={offline || createMutation.isPending}
          className={cn(
            'shrink-0 w-44 h-28 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1.5',
            'transition-all active:scale-[0.98]',
            offline || createMutation.isPending
              ? 'opacity-50 cursor-not-allowed'
              : 'border-primary/50 hover:border-primary hover:bg-primary/5 cursor-pointer',
          )}
        >
          <ShoppingBag className="h-6 w-6 text-primary" />
          <span className="text-base font-bold text-foreground">Olib ketish</span>
          <span className="text-xs text-muted-foreground">+ Yangi</span>
        </button>

        {takeawayOrders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => nav(`/orders/${o.id}`)}
            className={cn(
              'shrink-0 w-44 h-28 rounded-lg border bg-card p-3 text-left flex flex-col justify-between',
              'transition-all active:scale-[0.98] hover:border-primary',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold truncate">#{o.orderNumber}</span>
              <Badge variant={STATUS_VARIANTS[o.status]} className="text-[10px] px-1.5 py-0">
                {STATUS_LABEL_SHORT[o.status]}
              </Badge>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-xs text-muted-foreground">
                {o.lines.filter((l) => !l.isCanceled).length} qator
              </span>
              <span className="text-sm font-bold tabular-nums">
                {formatMoney(lineTotal(o))}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Floor grid */}
      <div className="flex-1 min-h-0">
        {loadingTables ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : tablesError ? (
          <div className="text-center py-16 text-destructive">
            Stollarni yuklab bo&apos;lmadi
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-3">
            {activeTables.map((t) => {
              const mine = myOrderByTable.get(t.id);
              const otherWaiter = !!t.activeOrderId && !mine;
              return (
                <TableTile
                  key={t.id}
                  table={t}
                  mine={mine}
                  otherWaiter={otherWaiter}
                  disabled={offline || createMutation.isPending}
                  onPress={() => handleTablePress(t)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function lineTotal(o: Order): number {
  return o.lines
    .filter((l) => !l.isCanceled)
    .reduce((s, l) => s + l.price * l.quantity, 0);
}

function TableTile({
  table,
  mine,
  otherWaiter,
  disabled,
  onPress,
}: {
  table: Table;
  mine: Order | undefined;
  otherWaiter: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const isFree = !mine && !otherWaiter;
  const clickable = !disabled && !otherWaiter;
  const total = mine ? lineTotal(mine) : 0;
  const lineCount = mine ? mine.lines.filter((l) => !l.isCanceled).length : 0;

  return (
    <Card
      onClick={clickable ? onPress : undefined}
      className={cn(
        'aspect-[4/3] p-3 flex flex-col justify-between gap-1 select-none transition-all',
        clickable && 'cursor-pointer active:scale-[0.98]',
        !clickable && 'opacity-60 cursor-not-allowed',
        isFree && clickable && 'border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5',
        mine && mine.status === 'DRAFT' && 'border-warning bg-warning/5 hover:border-warning',
        mine && mine.status === 'SENT' && 'border-primary bg-primary/5 hover:border-primary',
        otherWaiter && 'border-muted bg-muted/40',
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-base font-bold truncate">{table.name}</span>
        {mine && (
          <Badge variant={STATUS_VARIANTS[mine.status]} className="text-[10px] px-1.5 py-0 shrink-0">
            {STATUS_LABEL_SHORT[mine.status]}
          </Badge>
        )}
      </div>

      {isFree && (
        <div className="flex-1 flex items-center justify-center text-primary/80">
          <Plus className="h-7 w-7" strokeWidth={2.5} />
        </div>
      )}

      {mine && (
        <div className="flex items-end justify-between">
          <span className="text-xs text-muted-foreground">{lineCount} qator</span>
          <span className="text-sm font-bold tabular-nums">{formatMoney(total)}</span>
        </div>
      )}

      {otherWaiter && (
        <div className="flex-1 flex items-center justify-center text-xs font-medium text-muted-foreground">
          Band
        </div>
      )}

      <div className="text-[10px] text-muted-foreground/80">
        {table.type === 'ROOM' ? 'Xona' : 'Stol'}
      </div>
    </Card>
  );
}
