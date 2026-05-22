import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Send,
  StickyNote,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { Order, OrderLine, ordersApi } from '@/api/orders';
import { menuApi } from '@/api/menu';
import { StatusBadge } from '@/components/StatusBadge';
import { ConfirmModal } from '@/components/ConfirmModal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
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

function orderTypeLabel(order: Order): string {
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Zalda';
}

function locationLabel(order: Order): string {
  return order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan');
}

function lineTotal(line: OrderLine): number {
  return (line.price || 0) * line.quantity;
}

function paymentMethodLabel(method: string): string {
  return method === 'CASH' ? 'Naqd' : method === 'CARD' ? 'Karta' : 'Qarz';
}

export function OrderDetailPage() {
  usePageTitle('Buyurtma');
  const navigate = useNavigate();
  const { id = '' } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [actionError, setActionError] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addComboOpen, setAddComboOpen] = useState(false);
  const [noteLine, setNoteLine] = useState<OrderLine | null>(null);
  const [cancelLineTarget, setCancelLineTarget] = useState<OrderLine | null>(null);
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reprintMsg, setReprintMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const {
    data: order,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => ordersApi.getById(id),
    enabled: id !== '',
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  const onMutationError = (err: unknown) => {
    setActionError(err instanceof Error ? err.message : 'Amal bajarilmadi');
  };

  const qtyMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(id, lineId, quantity),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const sendMutation = useMutation({
    mutationFn: () => ordersApi.send(id),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: onMutationError,
  });

  const reprintMutation = useMutation({
    mutationFn: () => ordersApi.reprintBill(id, 'Admin tomonidan qayta chop etildi'),
    onSuccess: () => setReprintMsg({ kind: 'ok', text: 'Chek qayta chop etishga yuborildi' }),
    onError: (err) =>
      setReprintMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Chek chop etilmadi',
      }),
  });

  if (isLoading) {
    return (
      <PageContent>
        <PageHeader title="Buyurtma" />
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </PageContent>
    );
  }

  if (isError || !order) {
    return (
      <PageContent>
        <PageHeader
          title="Buyurtma"
          actions={
            <Button variant="outline" onClick={() => navigate('/orders')}>
              <ArrowLeft className="h-4 w-4" />
              Orqaga
            </Button>
          }
        />
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="Buyurtma topilmadi"
            hint="Buyurtma o'chirilgan bo'lishi yoki manzil noto'g'ri bo'lishi mumkin."
            action={<Button onClick={() => navigate('/orders')}>Buyurtmalar ro'yxati</Button>}
          />
        </Card>
      </PageContent>
    );
  }

  const lines = order.lines ?? [];
  const activeLines = lines.filter((l) => !l.isCanceled);
  const canEdit = order.status === 'DRAFT' || order.status === 'SENT';
  const canEditNotes = order.status === 'DRAFT';
  const showFinancials = order.status === 'CLOSED' || order.status === 'WALKOUT';

  const foodSubtotal = activeLines
    .filter((l) => l.menuItemKind !== 'SERVICE')
    .reduce((sum, l) => sum + lineTotal(l), 0);
  const serviceLive = activeLines
    .filter((l) => l.menuItemKind === 'SERVICE')
    .reduce((sum, l) => sum + lineTotal(l), 0);

  // CLOSED orders have snapshotted totals; WALKOUT and active orders do not,
  // so fall back to the live line-derived figures.
  const hasSnapshot = order.totalSnapshot != null;
  const subtotal = hasSnapshot ? order.subtotalSnapshot ?? foodSubtotal : foodSubtotal;
  const discount = order.discountAmountSnapshot ?? 0;
  const service = hasSnapshot ? order.serviceChargeSnapshot ?? serviceLive : serviceLive;
  const total = hasSnapshot ? order.totalSnapshot ?? order.totalAmount : order.totalAmount;

  const qtyBusy = qtyMutation.isPending || isFetching;

  return (
    <PageContent>
      <PageHeader
        title={`Buyurtma #${order.orderNumber}`}
        description={`${locationLabel(order)} · ${order.waiter?.fullName ?? '—'}`}
        actions={
          <Button variant="outline" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4" />
            Orqaga
          </Button>
        }
      />

      {actionError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Lines */}
        <div className="lg:col-span-3 space-y-3">
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Buyurtma tarkibi
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {activeLines.length} pozitsiya
                </span>
              </div>

              {lines.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  Hali pozitsiya qo'shilmagan
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className={cn(
                        'py-2.5 flex items-start gap-3',
                        line.isCanceled && 'opacity-60',
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'font-medium truncate',
                            line.isCanceled && 'line-through text-muted-foreground',
                          )}
                        >
                          {line.nameSnapshot}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {line.comboNameSnapshot && (
                            <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                              {line.comboNameSnapshot}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(line.price)} × {line.quantity}
                          </span>
                          {line.notes && (
                            <span className="inline-flex items-center gap-1 text-xs text-info">
                              <StickyNote className="h-3 w-3" />
                              {line.notes}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right tabular-nums font-medium shrink-0 w-24">
                        {formatMoney(lineTotal(line))}
                      </div>

                      {canEdit && !line.isCanceled && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            disabled={line.quantity <= 1 || qtyBusy}
                            onClick={() =>
                              qtyMutation.mutate({
                                lineId: line.id,
                                quantity: line.quantity - 1,
                              })
                            }
                            title="Kamaytirish"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            disabled={qtyBusy}
                            onClick={() =>
                              qtyMutation.mutate({
                                lineId: line.id,
                                quantity: line.quantity + 1,
                              })
                            }
                            title="Ko'paytirish"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          {canEditNotes && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setNoteLine(line)}
                              title="Izoh"
                            >
                              <StickyNote className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setCancelLineTarget(line)}
                            title="Pozitsiyani bekor qilish"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canEdit && (
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setAddItemOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Taom qo'shish
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAddComboOpen(true)}>
                    <UtensilsCrossed className="h-4 w-4" />
                    Kombo qo'shish
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Financial panel — CLOSED and WALKOUT */}
          {showFinancials && (
            <Card>
              <CardContent className="pt-4 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border pb-2">
                  To'lov
                </div>
                {(order.payments ?? []).length === 0 && !order.debt ? (
                  <div className="text-sm text-muted-foreground py-1">
                    To'lov amalga oshirilmagan.
                  </div>
                ) : (
                  <>
                    {(order.payments ?? []).map((p) => (
                      <div key={p.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {paymentMethodLabel(p.method)}
                        </span>
                        <span className="tabular-nums">{formatMoney(p.amount)}</span>
                      </div>
                    ))}
                    {order.debt && (
                      <div className="flex justify-between text-sm pt-1 border-t border-border/60">
                        <span className="text-muted-foreground">
                          Qarz · {order.debt.debtorName}
                        </span>
                        <span className="tabular-nums text-destructive">
                          {formatMoney(order.debt.remainingAmount)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Summary + actions */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-2.5">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <ReceiptText className="h-4 w-4 text-muted-foreground" />
                <StatusBadge status={order.status} />
              </div>
              <InfoRow label="Tur" value={orderTypeLabel(order)} />
              <InfoRow label="Stol" value={locationLabel(order)} />
              <InfoRow label="Ofitsiant" value={order.waiter?.fullName ?? '—'} />
              <InfoRow label="Yaratilgan" value={formatDateTime(order.createdAt)} />
              {order.closedAt && (
                <InfoRow label="Yopilgan" value={formatDateTime(order.closedAt)} />
              )}
              {order.canceledAt && (
                <InfoRow label="Bekor qilingan" value={formatDateTime(order.canceledAt)} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border pb-2 mb-1">
                Moliyaviy jami
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taomlar</span>
                <span className="tabular-nums">{formatMoney(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Chegirma</span>
                  <span className="tabular-nums text-destructive">-{formatMoney(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Xizmat haqi</span>
                <span className="tabular-nums">{formatMoney(service)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-border">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  Yakuniy summa
                </span>
                <span className="text-lg font-semibold tabular-nums">{formatMoney(total)}</span>
              </div>
            </CardContent>
          </Card>

          {order.status === 'CANCELED' && order.cancelReason && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              <span className="font-semibold">Bekor qilish sababi: </span>
              {order.cancelReason}
            </div>
          )}

          {/* Edit actions — DRAFT / SENT */}
          {canEdit && (
            <div className="space-y-2">
              {order.status === 'DRAFT' && (
                <Button
                  className="w-full"
                  disabled={activeLines.length === 0 || sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                >
                  <Send className="h-4 w-4" />
                  {sendMutation.isPending ? 'Yuborilmoqda...' : 'Yuborish'}
                </Button>
              )}
              {order.status === 'SENT' && (
                <Button className="w-full" onClick={() => setConfirmOpen(true)}>
                  <CheckCircle2 className="h-4 w-4" />
                  Tasdiqlash + To'lov
                </Button>
              )}
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setCancelOrderOpen(true)}
              >
                <Ban className="h-4 w-4" />
                Buyurtmani bekor qilish
              </Button>
            </div>
          )}

          {/* Reprint — CLOSED / WALKOUT */}
          {showFinancials && (
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={reprintMutation.isPending}
                onClick={() => {
                  setReprintMsg(null);
                  reprintMutation.mutate();
                }}
              >
                <Printer className="h-4 w-4" />
                {reprintMutation.isPending ? 'Yuborilmoqda...' : 'Chekni qayta chop etish'}
              </Button>
              {reprintMsg && (
                <p
                  className={cn(
                    'text-xs',
                    reprintMsg.kind === 'ok' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {reprintMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AddItemDialog
        orderId={id}
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        onChanged={invalidate}
      />
      <AddComboDialog
        orderId={id}
        open={addComboOpen}
        onClose={() => setAddComboOpen(false)}
        onChanged={invalidate}
      />
      <NoteDialog
        key={noteLine?.id ?? 'none'}
        orderId={id}
        line={noteLine}
        onClose={() => setNoteLine(null)}
        onChanged={invalidate}
      />
      <CancelLineDialog
        key={cancelLineTarget?.id ?? 'none-line'}
        orderId={id}
        line={cancelLineTarget}
        onClose={() => setCancelLineTarget(null)}
        onChanged={invalidate}
      />
      <CancelOrderDialog
        orderId={id}
        open={cancelOrderOpen}
        onClose={() => setCancelOrderOpen(false)}
        onCanceled={() => {
          invalidate();
          navigate('/orders');
        }}
      />

      {confirmOpen && (
        <ConfirmModal order={order} open onClose={() => setConfirmOpen(false)} />
      )}
    </PageContent>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function AddItemDialog({
  orderId,
  open,
  onClose,
  onChanged,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ['menu', 'items'],
    queryFn: () => menuApi.listItems(),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (menuItemId: string) => ordersApi.addItem(orderId, { menuItemId, quantity: 1 }),
    onSuccess: (line) => {
      setFeedback({ kind: 'ok', text: `${line.nameSnapshot} qo'shildi` });
      onChanged();
    },
    onError: (err) =>
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : "Qo'shilmadi" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const active = items.filter((i) => i.isActive);
    if (!q) return active;
    return active.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSearch('');
          setFeedback(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Taom qo'shish</DialogTitle>
          <DialogDescription>Buyurtmaga qo'shish uchun taomni tanlang.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Taom nomi..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {feedback && (
          <div
            className={cn(
              'text-sm rounded-md px-3 py-2',
              feedback.kind === 'ok'
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20',
            )}
          >
            {feedback.text}
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Taom topilmadi</div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={addMutation.isPending}
                onClick={() => addMutation.mutate(item.id)}
                className="w-full flex items-center justify-between py-2 px-1 text-left hover:bg-muted/50 rounded disabled:opacity-50"
              >
                <span className="font-medium truncate">{item.name}</span>
                <span className="text-sm text-muted-foreground tabular-nums shrink-0 ml-3">
                  {formatMoney(item.price)}
                </span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddComboDialog({
  orderId,
  open,
  onClose,
  onChanged,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos'],
    queryFn: () => menuApi.listCombos(),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onSuccess: () => {
      setFeedback({ kind: 'ok', text: "Kombo qo'shildi" });
      onChanged();
    },
    onError: (err) =>
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : "Qo'shilmadi" }),
  });

  const activeCombos = combos.filter((c) => c.isActive);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFeedback(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kombo qo'shish</DialogTitle>
          <DialogDescription>Kombo tarkibidagi barcha taomlar qo'shiladi.</DialogDescription>
        </DialogHeader>

        {feedback && (
          <div
            className={cn(
              'text-sm rounded-md px-3 py-2',
              feedback.kind === 'ok'
                ? 'bg-success/10 text-success border border-success/20'
                : 'bg-destructive/10 text-destructive border border-destructive/20',
            )}
          >
            {feedback.text}
          </div>
        )}

        <div className="max-h-[320px] overflow-y-auto divide-y divide-border/60">
          {activeCombos.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">Kombo yo'q</div>
          ) : (
            activeCombos.map((combo) => (
              <button
                key={combo.id}
                type="button"
                disabled={addMutation.isPending}
                onClick={() => addMutation.mutate(combo.id)}
                className="w-full flex items-center justify-between py-2 px-1 text-left hover:bg-muted/50 rounded disabled:opacity-50"
              >
                <span className="font-medium truncate">{combo.name}</span>
                <span className="text-sm text-muted-foreground shrink-0 ml-3">
                  {combo.components.length} pozitsiya
                </span>
              </button>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({
  orderId,
  line,
  onClose,
  onChanged,
}: {
  orderId: string;
  line: OrderLine | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => ordersApi.updateLineNotes(orderId, line!.id, notes),
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Saqlanmadi'),
  });

  return (
    <Dialog
      open={line !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pozitsiya izohi</DialogTitle>
          <DialogDescription>{line?.nameSnapshot}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="line-note">Izoh</Label>
          <Textarea
            id="line-note"
            className="min-h-[100px] resize-none"
            placeholder="Masalan: achchiq emas, alohida tarelkada..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saveMutation.isPending}>
            Bekor qilish
          </Button>
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {saveMutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelLineDialog({
  orderId,
  line,
  onClose,
  onChanged,
}: {
  orderId: string;
  line: OrderLine | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancelLine(orderId, line!.id, reason),
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bekor qilinmadi'),
  });

  return (
    <Dialog
      open={line !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Pozitsiyani bekor qilish
          </DialogTitle>
          <DialogDescription>
            "{line?.nameSnapshot}" — sababni aniq yozing, u audit jurnaliga tushadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-line-reason">Bekor qilish sababi</Label>
          <Textarea
            id="cancel-line-reason"
            className="min-h-[90px] resize-none"
            placeholder="Masalan: mijoz bu taomdan voz kechdi..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={cancelMutation.isPending}>
            Yopish
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            {cancelMutation.isPending ? 'Bekor qilinmoqda...' : 'Tasdiqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelOrderDialog({
  orderId,
  open,
  onClose,
  onCanceled,
}: {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onCanceled: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancelOrder(orderId, reason),
    onSuccess: () => {
      setReason('');
      onCanceled();
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Bekor qilinmadi'),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Buyurtmani bekor qilish
          </DialogTitle>
          <DialogDescription>
            Bu amalni qaytarib bo'lmaydi. Sababni aniq yozing — audit jurnaliga tushadi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-order-reason">Bekor qilish sababi</Label>
          <Textarea
            id="cancel-order-reason"
            className="min-h-[90px] resize-none"
            placeholder="Masalan: mijoz fikridan qaytdi..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={cancelMutation.isPending}>
            Yopish
          </Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            {cancelMutation.isPending ? 'Bekor qilinmoqda...' : 'Tasdiqlash'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
