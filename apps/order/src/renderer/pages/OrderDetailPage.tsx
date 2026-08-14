import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Minus, Plus, StickyNote, Trash2, ArrowLeft, Send, XCircle } from 'lucide-react';
import { ordersApi, STATUS_LABELS, type Order, type OrderLine } from '@/api/orders';
import { useToastStore } from '@/stores/toast.store';
import { useConnectionStore } from '@/stores/connection.store';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MenuPanel } from '@/components/MenuPanel';

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  CLOSED: 'outline',
  CANCELED: 'outline',
};

export function OrderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const nav = useNavigate();
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);
  const offline = useConnectionStore((s) => s.status) !== 'online';

  const [noteModal, setNoteModal] = useState<{ lineId: string; current: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [cancelOrderModal, setCancelOrderModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const {
    data: order,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['orders', id],
    queryFn: () => ordersApi.getById(id),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  // Optimistic cache patcher: edits the cached order in-place so the UI
  // re-renders instantly. The server's `order:updated` socket event will
  // trigger a canonical refetch via useSocket. On error, rollback to the
  // snapshot captured in onMutate. Do not invalidate in onSuccess — that
  // would cause a redundant double-fetch.
  const patchOrder = async (mutator: (prev: Order) => Order) => {
    await qc.cancelQueries({ queryKey: ['orders', id] });
    const prev = qc.getQueryData<Order>(['orders', id]);
    if (prev) qc.setQueryData<Order>(['orders', id], mutator(prev));
    return { prev };
  };
  const rollback = (ctx: { prev?: Order }) => {
    if (ctx?.prev) qc.setQueryData(['orders', id], ctx.prev);
  };

  const sendMutation = useMutation({
    mutationFn: () => ordersApi.send(id),
    onMutate: () => patchOrder((prev) => ({ ...prev, status: 'SENT' })),
    onSuccess: () => showToast('Buyurtma yuborildi', 'success'),
    onError: (err: Error, _vars, ctx) => {
      rollback(ctx ?? {});
      showToast(err.message || "Yuborib bo'lmadi", 'error');
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.cancel(id, reason),
    onMutate: () => patchOrder((prev) => ({ ...prev, status: 'CANCELED' })),
    onSuccess: () => {
      setCancelOrderModal(false);
      setCancelReason('');
      showToast('Buyurtma bekor qilindi', 'success');
      nav('/', { replace: true });
    },
    onError: (err: Error, _vars, ctx) => {
      rollback(ctx ?? {});
      showToast(err.message || "Bekor qilib bo'lmadi", 'error');
    },
  });

  const cancelLineMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(id, lineId),
    onMutate: (lineId) =>
      patchOrder((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, isCanceled: true } : l)),
      })),
    onError: (err: Error, _vars, ctx) => {
      rollback(ctx ?? {});
      showToast(err.message || "Bekor qilib bo'lmadi", 'error');
    },
  });

  const editNoteMutation = useMutation({
    mutationFn: ({ lineId, notes }: { lineId: string; notes: string }) =>
      ordersApi.editLineNote(id, lineId, notes),
    onMutate: ({ lineId, notes }) =>
      patchOrder((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, notes } : l)),
      })),
    onSuccess: () => {
      setNoteModal(null);
      setNoteText('');
    },
    onError: (err: Error, _vars, ctx) => {
      rollback(ctx ?? {});
      showToast(err.message || "Saqlab bo'lmadi", 'error');
    },
  });

  const updateQtyMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(id, lineId, quantity),
    onMutate: ({ lineId, quantity }) =>
      patchOrder((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, quantity } : l)),
      })),
    onError: (err: Error & { code?: string }, _vars, ctx) => {
      rollback(ctx ?? {});
      if (err.code === 'OUT_OF_STOCK') {
        showToast('Bu mahsulot tugagan', 'error');
      } else {
        showToast(err.message || "O'zgartirib bo'lmadi", 'error');
      }
    },
  });

  const activeLines = useMemo(
    () => (order?.lines ?? []).filter((l) => !l.isCanceled),
    [order],
  );
  const subtotal = useMemo(
    () => activeLines.reduce((s, l) => s + l.price * l.quantity, 0),
    [activeLines],
  );
  const totalQty = useMemo(
    () => activeLines.reduce((s, l) => s + l.quantity, 0),
    [activeLines],
  );

  // Back behavior: if we're leaving a DRAFT with no active lines, auto-cancel
  // it server-side so the table is freed and we don't accumulate empty
  // qoralama rows. Fire-and-forget — navigation happens immediately.
  const goHome = () => {
    if (order && order.status === 'DRAFT' && activeLines.length === 0) {
      void ordersApi
        .cancel(id, "Bo'sh qoralama avtomatik bekor qilindi")
        .catch(() => {
          // Silent — the floor map will reconcile via socket / polling.
        });
    }
    nav('/', { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="text-center py-16 text-destructive">Buyurtmani yuklab bo&apos;lmadi</div>
    );
  }

  const tableLabel = order.orderType === 'TAKEAWAY'
    ? 'Olib ketish'
    : order.table?.name ?? order.tableName ?? 'Stol';
  const isEditable = order.status === 'DRAFT' || order.status === 'SENT';
  const canSend = order.status === 'DRAFT';
  const canWaiterCancel = order.status === 'DRAFT' || order.status === 'SENT';
  const canEditLines = isEditable && !offline;

  // Rush-moment policy: DRAFT cancel needs no confirmation modal (mistaken
  // taps are recoverable — a new draft is one tap away). SENT requires a
  // reason since the kitchen/cashier may have already started acting on it.
  const handleCancelTap = () => {
    if (offline) return;
    if (order.status === 'DRAFT') {
      cancelOrderMutation.mutate("Qoralama bekor qilindi");
    } else {
      setCancelOrderModal(true);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="h-12 w-12" onClick={goHome}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold truncate">{tableLabel}</span>
              <Badge
                variant={STATUS_VARIANTS[order.status] ?? 'secondary'}
                className="text-sm px-2.5 py-0.5"
              >
                {STATUS_LABELS[order.status]}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">#{order.orderNumber}</div>
          </div>
        </div>

        {canWaiterCancel && (
          <Button
            variant="outline"
            className="h-12 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive text-base font-semibold"
            onClick={handleCancelTap}
            disabled={offline || cancelOrderMutation.isPending}
          >
            <XCircle className="h-5 w-5 mr-1" />
            Bekor qilish
          </Button>
        )}
      </div>

      {/* Two-pane content: lines on the left (40%), menu on the right (60%).
          Menu wins more space because in a rush it's used more often than
          the cart pane. Below xl the panes stack so smaller monitors still work. */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 min-h-0">
        {/* Lines pane */}
        <Card className="flex flex-col min-h-0">
          <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
            <div className="text-base font-bold">Buyurtma qatorlari</div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {activeLines.length} ta
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2.5 flex flex-col gap-2">
            {order.lines.length === 0 ? (
              <div className="text-base text-muted-foreground text-center py-12">
                Menyudan mahsulot tanlang
              </div>
            ) : (
              order.lines.map((line) => (
                <LineRow
                  key={line.id}
                  line={line}
                  canEdit={canEditLines}
                  onEditNote={() => {
                    setNoteText(line.notes ?? '');
                    setNoteModal({ lineId: line.id, current: line.notes ?? '' });
                  }}
                  onCancel={() => cancelLineMutation.mutate(line.id)}
                  onIncrement={() =>
                    updateQtyMutation.mutate({ lineId: line.id, quantity: line.quantity + 1 })
                  }
                  onDecrement={() => {
                    if (line.quantity <= 1) {
                      cancelLineMutation.mutate(line.id);
                    } else {
                      updateQtyMutation.mutate({ lineId: line.id, quantity: line.quantity - 1 });
                    }
                  }}
                />
              ))
            )}
          </div>
        </Card>

        {/* Menu panel */}
        <Card className="flex flex-col min-h-0 overflow-hidden">
          {isEditable ? (
            <MenuPanel orderId={id} disabled={offline} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-6 text-center">
              Bu holatda mahsulot qo&apos;shib bo&apos;lmaydi
            </div>
          )}
        </Card>
      </div>

      {/* Persistent action bar — running totals + primary action always
          in the same spot so the waiter's thumb knows where to land. */}
      <div className="mt-3 px-4 py-3 rounded-lg border bg-card shadow-sm flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-baseline gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Qatorlar
            </div>
            <div className="text-lg font-bold tabular-nums">{totalQty}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Jami
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {formatMoney(subtotal)}{' '}
              <span className="text-sm text-muted-foreground font-normal">so&apos;m</span>
            </div>
          </div>
        </div>

        {canSend ? (
          <Button
            className="h-14 px-8 text-lg font-bold"
            onClick={() => sendMutation.mutate()}
            disabled={activeLines.length === 0 || offline || sendMutation.isPending}
          >
            <Send className="h-5 w-5 mr-2" />
            Yuborish
          </Button>
        ) : order.status === 'SENT' ? (
          <div className="text-sm text-muted-foreground text-right max-w-[220px]">
            Kassir tasdig&apos;ini kutmoqda
          </div>
        ) : null}
      </div>

      {/* Note dialog */}
      <Dialog
        open={!!noteModal}
        onOpenChange={(open) => {
          if (!open) {
            setNoteModal(null);
            setNoteText('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eslatma</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Masalan: tuz kam bo'lsin, achchiq emas..."
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNoteModal(null);
                setNoteText('');
              }}
            >
              Bekor
            </Button>
            <Button
              onClick={() =>
                noteModal && editNoteMutation.mutate({ lineId: noteModal.lineId, notes: noteText })
              }
              disabled={editNoteMutation.isPending}
            >
              {editNoteMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel SENT dialog — DRAFTs are one-tap cancel (no reason needed). */}
      <Dialog
        open={cancelOrderModal}
        onOpenChange={(open) => {
          if (!open) {
            setCancelOrderModal(false);
            setCancelReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yuborilgan buyurtmani bekor qilish</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Sababni kiriting — kassir ko&apos;radi.
          </p>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Sababni kiriting..."
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelOrderModal(false);
                setCancelReason('');
              }}
            >
              Orqaga
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                cancelOrderMutation.mutate(cancelReason || "Sabab ko'rsatilmadi")
              }
              disabled={cancelOrderMutation.isPending}
            >
              {cancelOrderMutation.isPending ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LineRow({
  line,
  canEdit,
  onEditNote,
  onCancel,
  onIncrement,
  onDecrement,
}: {
  line: OrderLine;
  canEdit: boolean;
  onEditNote: () => void;
  onCancel: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  if (line.isCanceled) {
    return (
      <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground line-through">
        {line.nameSnapshot} × {line.quantity} — Bekor qilindi
      </div>
    );
  }

  return (
    <div className={cn('rounded-md border bg-card p-3 flex flex-col gap-2.5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-foreground truncate">{line.nameSnapshot}</div>
          {line.comboNameSnapshot && (
            <div className="text-xs text-muted-foreground">Set: {line.comboNameSnapshot}</div>
          )}
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatMoney(line.price)} × {line.quantity}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold tabular-nums">
            {formatMoney(line.price * line.quantity)}
          </div>
        </div>
      </div>

      {line.notes && (
        <div className="text-sm italic text-primary bg-primary/5 rounded px-2.5 py-1.5">
          {line.notes}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 active:scale-95 transition-transform"
            onClick={onDecrement}
            title="Kamaytirish"
          >
            <Minus className="h-5 w-5" />
          </Button>
          <span className="w-10 text-center text-lg font-bold tabular-nums">{line.quantity}</span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 active:scale-95 transition-transform"
            onClick={onIncrement}
            title="Ko'paytirish"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={onEditNote}
            title="Eslatma"
          >
            <StickyNote className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onCancel}
            title="Olib tashlash"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
