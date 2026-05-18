import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  History,
  Printer,
  ReceiptText,
  Search,
  X,
} from 'lucide-react';
import { Order, ordersApi } from '@/api/orders';
import { OrderStatus, StatusBadge } from '@/components/StatusBadge';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { MoneyCell } from '@/components/data/MoneyCell';
import { DateTimeCell } from '@/components/data/DateCell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatMoney, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const FILTER_TABS: { status: OrderStatus }[] = [
  { status: 'SENT' },
  { status: 'CLOSED' },
  { status: 'WALKOUT' },
  { status: 'CANCELED' },
];

const TAB_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lamay ketdi",
  CANCELED: 'Bekor qilingan',
};

function localDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function locationLabel(order: Order): string {
  return (
    order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')
  );
}

function shortOrderNumber(orderNumber: string | null | undefined): string {
  if (!orderNumber) return '—';
  return orderNumber.slice(-6).toUpperCase();
}

export function OrdersPage() {
  usePageTitle('Buyurtmalar');

  const [activeTab, setActiveTab] = useState<OrderStatus>('SENT');
  const [search, setSearch] = useState('');
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', activeTab],
    queryFn: () =>
      ordersApi.list({
        status: activeTab,
        date: activeTab === 'CLOSED' ? localDateString() : undefined,
      }),
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['orders', 'active_counts'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const counts = useMemo(() => {
    return activeOrders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [activeOrders]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        (o.orderNumber?.toLowerCase().includes(q) ?? false) ||
        (o.tableName?.toLowerCase().includes(q) ?? false),
    );
  }, [orders, search]);

  const detailOrder = useMemo(
    () => orders.find((o) => o.id === detailOrderId) ?? null,
    [orders, detailOrderId],
  );

  const columns: DataTableColumn<Order>[] = [
    {
      key: 'orderNumber',
      header: '№',
      width: '110px',
      cell: (row) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {shortOrderNumber(row.orderNumber)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      width: '140px',
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'location',
      header: 'Stol / Tur',
      cell: (row) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium truncate">{locationLabel(row)}</span>
          <span className="text-xs text-muted-foreground truncate">
            {row.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Zalda'}
          </span>
        </div>
      ),
    },
    {
      key: 'waiter',
      header: 'Ofitsiant',
      cell: (row) => (
        <span className="text-sm text-muted-foreground truncate">
          {row.waiter?.fullName ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Summa',
      align: 'right',
      cell: (row) => <MoneyCell value={row.totalSnapshot ?? row.totalAmount} />,
    },
    {
      key: 'when',
      header: 'Vaqti',
      width: '170px',
      cell: (row) => (
        <DateTimeCell
          value={row.status === 'CLOSED' && row.closedAt ? row.closedAt : row.createdAt}
          className="text-muted-foreground"
        />
      ),
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Buyurtmalar"
        description="Yuborilgan, yopilgan va bekor qilingan buyurtmalar tarixi"
        actions={
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Input
              type="text"
              placeholder="Buyurtma yoki stol..."
              className="pl-8 h-9 w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />

      {/* Filter tabs */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {FILTER_TABS.map((tab) => {
              const count = counts[tab.status] ?? 0;
              const isActive = activeTab === tab.status;
              return (
                <Button
                  key={tab.status}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  className="rounded-full"
                  onClick={() => setActiveTab(tab.status)}
                >
                  <span>{TAB_LABELS[tab.status]}</span>
                  {(count > 0 || isActive) && (
                    <span
                      className={cn(
                        'ml-1 px-1.5 rounded-full text-[10px] font-semibold tabular-nums',
                        isActive
                          ? 'bg-primary-foreground/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={filteredOrders}
        isLoading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => setDetailOrderId(row.id)}
        emptyState={
          <EmptyState
            icon={search ? Search : History}
            title={search ? 'Mos buyurtma topilmadi' : 'Hech qanday buyurtma topilmadi'}
            hint={
              search
                ? "Qidiruv shartlarini o'zgartiring yoki tozalang."
                : "Tanlangan holat bo'yicha buyurtmalar yo'q."
            }
          />
        }
      />

      <OrderDetailDialog
        order={detailOrder}
        open={detailOrder !== null}
        onClose={() => setDetailOrderId(null)}
        onCancel={(order) => {
          setDetailOrderId(null);
          setCancelOrder(order);
        }}
      />

      <CancelOrderDialog
        order={cancelOrder}
        open={cancelOrder !== null}
        onClose={() => setCancelOrder(null)}
      />
    </PageContent>
  );
}

function OrderDetailDialog({
  order,
  open,
  onClose,
  onCancel,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onCancel: (order: Order) => void;
}) {
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const reprintMutation = useMutation({
    mutationFn: (reason: string) => {
      if (!order) throw new Error('No order');
      return ordersApi.reprintBill(order.id, reason);
    },
    onSuccess: () => {
      setReprintSuccess(true);
      setTimeout(() => setReprintSuccess(false), 3000);
    },
  });

  if (!order) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const subtotal = order.subtotalSnapshot ?? order.totalAmount ?? 0;
  const discount = order.discountAmountSnapshot ?? 0;
  const service = order.serviceChargeSnapshot ?? 0;
  const total = order.totalSnapshot ?? order.totalAmount ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReprintSuccess(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <span className="font-mono">#{shortOrderNumber(order.orderNumber)}</span>
            <StatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>
            {locationLabel(order)} · {order.waiter?.fullName ?? '—'} ·{' '}
            {formatDateTime(order.createdAt)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Lines */}
          <div className="md:col-span-3 space-y-2">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Buyurtma tarkibi
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {order.itemCount} pozitsiya
              </span>
            </div>
            <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
              {(order.lines ?? []).map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    'grid grid-cols-12 gap-2 py-1.5 px-2 rounded-md text-sm',
                    line.isCanceled ? 'bg-destructive/5' : 'hover:bg-muted/40',
                  )}
                >
                  <div className="col-span-1 tabular-nums text-muted-foreground font-medium">
                    {line.quantity}×
                  </div>
                  <div className="col-span-8 min-w-0">
                    <div
                      className={cn(
                        'font-medium truncate',
                        line.isCanceled && 'text-muted-foreground line-through',
                      )}
                    >
                      {line.nameSnapshot}
                    </div>
                    {line.notes && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <AlertCircle className="h-3 w-3 text-info" strokeWidth={1.75} />
                        <span className="text-xs text-info">{line.notes}</span>
                      </div>
                    )}
                  </div>
                  <div
                    className={cn(
                      'col-span-3 text-right tabular-nums font-medium',
                      line.isCanceled && 'text-muted-foreground line-through',
                    )}
                  >
                    {formatMoney((line.price || 0) * line.quantity)}
                  </div>
                </div>
              ))}
              {(order.lines ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Pozitsiyalar yo'q
                </div>
              )}
            </div>
          </div>

          {/* Totals + actions */}
          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardContent className="pt-4 space-y-1.5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border pb-1.5 mb-1">
                  Moliyaviy jami
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Jami</span>
                  <span className="tabular-nums">{formatMoney(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Chegirma</span>
                    <span className="tabular-nums text-destructive">
                      -{formatMoney(discount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Xizmat haqi</span>
                  <span className="tabular-nums">{formatMoney(service)}</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 mt-2 border-t border-border">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Yakuniy summa
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(total)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              {order.status === 'SENT' && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => onCancel(order)}
                >
                  <Ban className="h-4 w-4" />
                  Buyurtmani bekor qilish
                </Button>
              )}

              {(order.status === 'CLOSED' || order.status === 'WALKOUT') &&
                (reprintSuccess ? (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    <Printer className="h-4 w-4" />
                    Yuborildi
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={reprintMutation.isPending}
                    onClick={() => reprintMutation.mutate('Admin re-print')}
                  >
                    <Printer className="h-4 w-4" />
                    {reprintMutation.isPending
                      ? 'Yuborilmoqda...'
                      : "Chekni qayta chop etish"}
                  </Button>
                ))}
            </div>

            {order.status === 'CLOSED' && order.closedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Yopildi: {formatDateTime(order.closedAt)}</span>
              </div>
            )}
            {order.status === 'CANCELED' && order.cancelReason && (
              <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <span className="font-semibold">Sabab: </span>
                {order.cancelReason}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderDialog({
  order,
  open,
  onClose,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!order) throw new Error('No order');
      return ordersApi.cancelOrder(order.id, reason);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setReason('');
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" strokeWidth={1.75} />
            Buyurtmani bekor qilish
          </DialogTitle>
          <DialogDescription>
            {order ? (
              <>
                #{shortOrderNumber(order.orderNumber)} buyurtma butunlay bekor qilinadi.
                Bu amalni qaytarib bo'lmaydi.
              </>
            ) : (
              <>Buyurtma tanlanmagan.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2.5">
          <AlertCircle
            className="h-4 w-4 text-destructive shrink-0 mt-0.5"
            strokeWidth={1.75}
          />
          <p className="text-xs text-destructive font-medium leading-relaxed">
            Diqqat! Qaytarib bo'lmaydigan amal. Sababni aniq yozing — bu audit jurnaliga
            tushadi.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="cancel-reason"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Bekor qilish sababi
          </Label>
          <Textarea
            id="cancel-reason"
            placeholder="Masalan: Mijoz fikridan qaytdi, adashib ochilgan..."
            className="min-h-[100px] resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Yopish
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || mutation.isPending || !order}
            onClick={() => mutation.mutate()}
          >
            <Ban className="h-4 w-4" />
            {mutation.isPending ? 'Bekor qilinmoqda...' : 'Bekor qilishni tasdiqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
