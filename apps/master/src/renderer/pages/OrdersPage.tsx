import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  Ban,
  History,
  Loader2,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Order, ordersApi } from '@/api/orders';
import { menuApi } from '@/api/menu';
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
  const queryClient = useQueryClient();
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const [lineActionId, setLineActionId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<'items' | 'combos'>('items');
  const [pickerSearch, setPickerSearch] = useState('');

  const orderId = order?.id ?? null;
  // Server allows line edits only while DRAFT or SENT. In this list only SENT
  // is reachable (DRAFT isn't a tab), but we key off both defensively.
  const isEditable = order?.status === 'SENT' || order?.status === 'DRAFT';

  // Live order — reflects line edits immediately (mirrors ConfirmModal).
  const { data: liveOrder } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.getById(orderId as string),
    initialData: order ?? undefined,
    enabled: open && orderId !== null,
  });
  const o = liveOrder ?? order;

  // Menu + combos for the "add item" picker — only fetched while editing.
  const { data: menu } = useQuery({
    queryKey: ['menu'],
    queryFn: () => menuApi.getMenu(),
    enabled: open && isEditable,
  });
  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos'],
    queryFn: () => menuApi.listCombos(),
    enabled: open && isEditable,
  });

  const invalidateOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

  const reprintMutation = useMutation({
    mutationFn: (reason: string) => {
      if (!orderId) throw new Error('No order');
      return ordersApi.reprintBill(orderId, reason);
    },
    onSuccess: () => {
      setReprintSuccess(true);
      setTimeout(() => setReprintSuccess(false), 3000);
    },
  });

  const quantityMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(orderId as string, lineId, quantity),
    onMutate: ({ lineId }) => setLineActionId(lineId),
    onSettled: () => setLineActionId(null),
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(orderId as string, lineId),
    onMutate: (lineId) => setLineActionId(lineId),
    onSettled: () => {
      setLineActionId(null);
      setConfirmRemoveId(null);
    },
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const addItemMutation = useMutation({
    mutationFn: (menuItemId: string) =>
      ordersApi.addItem(orderId as string, { menuItemId, quantity: 1 }),
    onMutate: (menuItemId) => setLineActionId(`add:${menuItemId}`),
    onSettled: () => setLineActionId(null),
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId as string, { comboId }),
    onMutate: (comboId) => setLineActionId(`combo:${comboId}`),
    onSettled: () => setLineActionId(null),
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const busy =
    quantityMutation.isPending ||
    removeMutation.isPending ||
    addItemMutation.isPending ||
    addComboMutation.isPending;

  const pickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (menu?.categories ?? [])
      .map((category) => ({
        id: category.id,
        name: category.name,
        items: (category.items ?? []).filter(
          (item) => item.kind !== 'SERVICE' && (!q || item.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [menu, pickerSearch]);

  const pickerCombos = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return combos.filter((combo) => combo.isActive && (!q || combo.name.toLowerCase().includes(q)));
  }, [combos, pickerSearch]);

  const closeAndReset = () => {
    setReprintSuccess(false);
    setPickerOpen(false);
    setPickerSearch('');
    setConfirmRemoveId(null);
    setLineActionId(null);
    onClose();
  };

  if (!o) {
    return (
      <Dialog open={open} onOpenChange={(x) => !x && onClose()}>
        <DialogContent />
      </Dialog>
    );
  }

  const activeLines = (o.lines ?? []).filter((line) => !line.isCanceled);
  const liveSubtotal = activeLines
    .filter((line) => line.menuItemKind !== 'SERVICE')
    .reduce((sum, line) => sum + (line.price || 0) * line.quantity, 0);
  const liveService = activeLines
    .filter((line) => line.menuItemKind === 'SERVICE')
    .reduce((sum, line) => sum + (line.price || 0) * line.quantity, 0);

  // Editable orders aren't snapshotted yet — show the live running numbers.
  const subtotal = isEditable ? liveSubtotal : o.subtotalSnapshot ?? o.totalAmount ?? 0;
  const discount = isEditable ? 0 : o.discountAmountSnapshot ?? 0;
  const service = isEditable ? liveService : o.serviceChargeSnapshot ?? 0;
  const total = isEditable ? liveSubtotal + liveService : o.totalSnapshot ?? o.totalAmount ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(x) => {
        if (!x) closeAndReset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            <span className="font-mono">#{shortOrderNumber(o.orderNumber)}</span>
            <StatusBadge status={o.status} />
          </DialogTitle>
          <DialogDescription>
            {locationLabel(o)} · {o.waiter?.fullName ?? '—'} · {formatDateTime(o.createdAt)}
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
                {o.itemCount} pozitsiya
              </span>
            </div>
            <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
              {(o.lines ?? []).map((line) => {
                const isService = line.menuItemKind === 'SERVICE';
                const rowBusy = lineActionId === line.id;
                const confirming = confirmRemoveId === line.id;
                const showControls = isEditable && !line.isCanceled && !isService;
                return (
                  <div
                    key={line.id}
                    className={cn(
                      'flex items-center gap-2 py-1.5 px-2 rounded-md text-sm',
                      line.isCanceled ? 'bg-destructive/5' : 'hover:bg-muted/40',
                    )}
                  >
                    <div className="w-8 shrink-0 tabular-nums text-muted-foreground font-medium">
                      {line.quantity}×
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'font-medium truncate',
                          line.isCanceled && 'text-muted-foreground line-through',
                        )}
                      >
                        {line.nameSnapshot}
                        {isService && (
                          <span className="ml-1.5 inline-block rounded bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-600 align-middle">
                            Xizmat
                          </span>
                        )}
                      </div>
                      {line.notes && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <AlertCircle className="h-3 w-3 text-info" strokeWidth={1.75} />
                          <span className="text-xs text-info">{line.notes}</span>
                        </div>
                      )}
                      {showControls && (
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {formatMoney((line.price || 0) * line.quantity)}
                        </div>
                      )}
                    </div>
                    {showControls ? (
                      confirming ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-semibold uppercase tracking-tight text-destructive">
                            O'chirilsinmi?
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            disabled={busy}
                            onClick={() => removeMutation.mutate(line.id)}
                          >
                            {rowBusy && removeMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Ha'
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            disabled={busy}
                            onClick={() => setConfirmRemoveId(null)}
                          >
                            Yo'q
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Sonini kamaytirish"
                            disabled={busy || line.quantity <= 1}
                            onClick={() =>
                              quantityMutation.mutate({
                                lineId: line.id,
                                quantity: line.quantity - 1,
                              })
                            }
                          >
                            {rowBusy && quantityMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Minus className="h-3.5 w-3.5" strokeWidth={2.25} />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Sonini oshirish"
                            disabled={busy}
                            onClick={() =>
                              quantityMutation.mutate({
                                lineId: line.id,
                                quantity: line.quantity + 1,
                              })
                            }
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                            title="Pozitsiyani o'chirish"
                            disabled={busy}
                            onClick={() => setConfirmRemoveId(line.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )
                    ) : (
                      <div
                        className={cn(
                          'w-24 shrink-0 text-right tabular-nums font-medium',
                          line.isCanceled && 'text-muted-foreground line-through',
                        )}
                      >
                        {formatMoney((line.price || 0) * line.quantity)}
                      </div>
                    )}
                  </div>
                );
              })}
              {(o.lines ?? []).length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">
                  Pozitsiyalar yo'q
                </div>
              )}
            </div>

            {isEditable && (
              <div className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setPickerOpen((v) => !v)}
                >
                  <Plus className="h-4 w-4" />
                  {pickerOpen ? 'Qo‘shishni yopish' : "Mahsulot qo'shish"}
                </Button>

                {pickerOpen && (
                  <div className="mt-2 rounded-md border border-border">
                    <div className="flex items-center gap-2 p-2 border-b border-border">
                      <div className="flex gap-1">
                        <Button
                          variant={pickerTab === 'items' ? 'default' : 'ghost'}
                          size="sm"
                          className="h-8"
                          onClick={() => setPickerTab('items')}
                        >
                          Mahsulotlar
                        </Button>
                        <Button
                          variant={pickerTab === 'combos' ? 'default' : 'ghost'}
                          size="sm"
                          className="h-8"
                          onClick={() => setPickerTab('combos')}
                        >
                          Kombolar
                        </Button>
                      </div>
                      <div className="relative flex-1">
                        <Search
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                          strokeWidth={1.75}
                        />
                        <Input
                          type="text"
                          placeholder="Qidirish..."
                          className="pl-8 h-8"
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="max-h-[240px] overflow-y-auto p-2 space-y-3">
                      {pickerTab === 'items' ? (
                        pickerItems.length === 0 ? (
                          <div className="text-xs text-muted-foreground text-center py-4">
                            Mahsulot topilmadi
                          </div>
                        ) : (
                          pickerItems.map((category) => (
                            <div key={category.id}>
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1 mb-1">
                                {category.name}
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                {category.items.map((item) => {
                                  const unavailable =
                                    item.effectivelyAvailable === false || !item.isAvailable;
                                  const adding = lineActionId === `add:${item.id}`;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      disabled={busy || unavailable}
                                      onClick={() => addItemMutation.mutate(item.id)}
                                      title={unavailable ? 'Mavjud emas' : undefined}
                                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      <span className="truncate font-medium">{item.name}</span>
                                      <span className="shrink-0 tabular-nums text-muted-foreground">
                                        {adding ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          formatMoney(item.price)
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))
                        )
                      ) : pickerCombos.length === 0 ? (
                        <div className="text-xs text-muted-foreground text-center py-4">
                          Kombo topilmadi
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {pickerCombos.map((combo) => {
                            const adding = lineActionId === `combo:${combo.id}`;
                            const summary =
                              combo.components
                                .map((component) => component.menuItem?.name)
                                .filter(Boolean)
                                .join(', ') || `${combo.components.length} ta mahsulot`;
                            return (
                              <button
                                key={combo.id}
                                type="button"
                                disabled={busy}
                                onClick={() => addComboMutation.mutate(combo.id)}
                                className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">{combo.name}</div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {summary}
                                  </div>
                                </div>
                                <span className="shrink-0 text-muted-foreground">
                                  {adding ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="h-4 w-4" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                    {isEditable ? 'Joriy jami' : 'Yakuniy summa'}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMoney(total)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {isEditable && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                O'zgarishlar darhol saqlanadi. Chegirma va yakuniy hisob to'lov
                (Tasdiqlash) vaqtida shakllanadi.
              </p>
            )}

            <div className="space-y-2">
              {o.status === 'SENT' && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => onCancel(o)}
                >
                  <Ban className="h-4 w-4" />
                  Buyurtmani bekor qilish
                </Button>
              )}

              {(o.status === 'CLOSED' || o.status === 'WALKOUT') &&
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

            {o.status === 'CLOSED' && o.closedAt && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Yopildi: {formatDateTime(o.closedAt)}</span>
              </div>
            )}
            {o.status === 'CANCELED' && o.cancelReason && (
              <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
                <span className="font-semibold">Sabab: </span>
                {o.cancelReason}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractEditError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === 'string' ? maybe.code : undefined;
    const message = typeof maybe.message === 'string' ? maybe.message : undefined;
    if (code === 'OUT_OF_STOCK') return message || 'Mahsulot yetarli emas';
    if (code === 'ITEM_UNAVAILABLE') return message || 'Mahsulot mavjud emas';
    if (code === 'ILLEGAL_STATE') return "Buyurtma holati o'zgargan — sahifani yangilang";
    if (message) return message;
  }
  return "Amalni bajarib bo'lmadi";
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
