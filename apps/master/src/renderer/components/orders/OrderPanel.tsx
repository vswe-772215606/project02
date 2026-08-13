import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Minus, Plus, Trash2 } from 'lucide-react';

import { ordersApi, type Order, type OrderLine } from '@/api/orders';
import { Panel } from '@/components/layout/Screen';
import { Chip, Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { formatMoney, formatDateTime } from '@/lib/format';
import { ItemPicker } from './ItemPicker';

const LINE_COLUMNS = '1fr 110px';

function placeOf(order: Order): string {
  if (order.tableName) return order.tableName;
  return order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan';
}

function extractEditError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === 'string' ? maybe.code : undefined;
    const message = typeof maybe.message === 'string' ? maybe.message : undefined;
    if (code === 'OUT_OF_STOCK') return message || 'Mahsulot yetarli emas';
    if (code === 'ITEM_UNAVAILABLE') return message || 'Mahsulot mavjud emas';
    if (code === 'ILLEGAL_STATE') return "Buyurtma holati o'zgargan — ro'yxatni yangilang";
    if (message) return message;
  }
  return "Amalni bajarib bo'lmadi";
}

/**
 * The order in hand — history and, while it's still SENT, editing.
 *
 * Structure mirrors OrderTicket: a scrollable middle that either shows the
 * lines or (while adding) swaps to ItemPicker, a shrink-0 strip below it
 * that always stays visible, and a foot that pins the total plus whichever
 * single action this order's status allows.
 */
export function OrderPanel({
  order,
  onCancel,
}: {
  order: Order;
  onCancel: (order: Order) => void;
}) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lineActionId, setLineActionId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [reprintSuccess, setReprintSuccess] = useState(false);

  const isEditable = order.status === 'SENT' || order.status === 'DRAFT';
  const invalidateOrders = () => queryClient.invalidateQueries({ queryKey: ['orders'] });

  const reprintMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.reprintBill(order.id, reason),
    onSuccess: () => {
      setReprintSuccess(true);
      setTimeout(() => setReprintSuccess(false), 3000);
    },
  });

  const quantityMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(order.id, lineId, quantity),
    onMutate: ({ lineId }) => setLineActionId(lineId),
    onSettled: () => setLineActionId(null),
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const removeMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(order.id, lineId),
    onMutate: (lineId) => setLineActionId(lineId),
    onSettled: () => {
      setLineActionId(null);
      setConfirmRemoveId(null);
    },
    onSuccess: invalidateOrders,
    onError: (error) => toast.error(extractEditError(error)),
  });

  const busy = quantityMutation.isPending || removeMutation.isPending;

  const activeLines = (order.lines ?? []).filter((line) => !line.isCanceled);
  const liveSubtotal = activeLines
    .filter((line) => line.menuItemKind !== 'SERVICE')
    .reduce((sum, line) => sum + (line.price || 0) * line.quantity, 0);
  const liveService = activeLines
    .filter((line) => line.menuItemKind === 'SERVICE')
    .reduce((sum, line) => sum + (line.price || 0) * line.quantity, 0);

  const subtotal = isEditable ? liveSubtotal : order.subtotalSnapshot ?? order.totalAmount ?? 0;
  const discount = isEditable ? 0 : order.discountAmountSnapshot ?? 0;
  const service = isEditable ? liveService : order.serviceChargeSnapshot ?? 0;
  const total = isEditable ? liveSubtotal + liveService : order.totalSnapshot ?? order.totalAmount ?? 0;

  function renderLine(line: OrderLine) {
    if (line.isCanceled) {
      return (
        <Row key={line.id} columns={LINE_COLUMNS} inert>
          <span className="min-w-0 truncate line-through">
            {line.quantity}× {line.nameSnapshot}
          </span>
          <RowMoney className="line-through">
            {formatMoney(line.price * line.quantity)}
          </RowMoney>
        </Row>
      );
    }

    if (line.menuItemKind === 'SERVICE') {
      return (
        <Row key={line.id} columns={LINE_COLUMNS}>
          <span className="flex min-w-0 items-center gap-2 truncate">
            {line.nameSnapshot}
            <Chip tone="inert">Xizmat</Chip>
          </span>
          <RowMoney>{formatMoney(line.price * line.quantity)}</RowMoney>
        </Row>
      );
    }

    if (!isEditable) {
      return (
        <Row key={line.id} columns={LINE_COLUMNS}>
          <span className="min-w-0 truncate">
            {line.quantity}× {line.nameSnapshot}
            {line.notes ? <RowSub>{line.notes}</RowSub> : null}
          </span>
          <RowMoney>{formatMoney(line.price * line.quantity)}</RowMoney>
        </Row>
      );
    }

    const rowBusy = lineActionId === line.id;
    const confirming = confirmRemoveId === line.id;

    return (
      <div key={line.id} className="bg-field px-pad py-2">
        <div className="flex items-center justify-between gap-2.5">
          <span className="min-w-0 truncate text-[14.5px]">
            {line.nameSnapshot}
            {line.notes ? <RowSub>{line.notes}</RowSub> : null}
          </span>
          <span className="shrink-0 text-[17px] font-semibold tabular-nums">
            {formatMoney(line.price * line.quantity)}
          </span>
        </div>

        {confirming ? (
          <div className="mt-2 flex items-center gap-seam">
            <span className="flex-1 text-[13px] font-semibold text-owed">
              O&apos;chirilsinmi?
            </span>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => removeMutation.mutate(line.id)}
            >
              {rowBusy && removeMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                "Ha, o'chirish"
              )}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmRemoveId(null)}>
              Yo&apos;q
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-seam">
            <Button
              size="icon"
              variant="secondary"
              disabled={busy || line.quantity <= 1}
              aria-label="Sonini kamaytirish"
              onClick={() =>
                quantityMutation.mutate({ lineId: line.id, quantity: line.quantity - 1 })
              }
            >
              {rowBusy && quantityMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Minus />
              )}
            </Button>
            <span className="w-10 text-center text-[17px] font-semibold tabular-nums">
              {line.quantity}
            </span>
            <Button
              size="icon"
              variant="secondary"
              disabled={busy}
              aria-label="Sonini oshirish"
              onClick={() =>
                quantityMutation.mutate({ lineId: line.id, quantity: line.quantity + 1 })
              }
            >
              {rowBusy && quantityMutation.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="ml-moat text-owed"
              disabled={busy}
              aria-label="Pozitsiyani o'chirish"
              onClick={() => setConfirmRemoveId(line.id)}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{placeOf(order)}</div>
          <div className="text-[13px] text-muted-foreground">
            {order.waiter?.fullName ?? '—'} · {formatDateTime(order.createdAt)}
          </div>
        </>
      }
      foot={
        <Seam>
          <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">
              {isEditable ? 'Joriy jami' : 'Yakuniy summa'}
            </span>
            <span className="text-[22px] font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>

          {order.status === 'SENT' ? (
            <Button variant="destructive" className="w-full" onClick={() => onCancel(order)}>
              Bekor qilish
            </Button>
          ) : null}

          {order.status === 'CLOSED' || order.status === 'WALKOUT' ? (
            <Button
              variant="secondary"
              className="w-full"
              disabled={reprintMutation.isPending}
              onClick={() => reprintMutation.mutate('Admin qayta chop etish')}
            >
              {reprintMutation.isPending
                ? 'Yuborilmoqda…'
                : reprintSuccess
                  ? 'Yuborildi'
                  : "Chekni qayta chop etish"}
            </Button>
          ) : null}

          {order.status === 'CANCELED' && order.cancelReason ? (
            <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">
              Sabab: {order.cancelReason}
            </div>
          ) : null}
        </Seam>
      }
    >
      {pickerOpen ? (
        <ItemPicker orderId={order.id} onAdded={invalidateOrders} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Seam className="content-start">
            {(order.lines ?? []).length === 0 ? (
              <div className="bg-field px-pad py-6 text-center text-[14px] text-muted-foreground">
                Pozitsiyalar yo&apos;q
              </div>
            ) : (
              (order.lines ?? []).map((line) => renderLine(line))
            )}
          </Seam>
        </div>
      )}

      <Seam className="shrink-0 content-start">
        {isEditable ? (
          <Button variant="secondary" className="w-full" onClick={() => setPickerOpen((v) => !v)}>
            {pickerOpen ? "Ro'yxatga qaytish" : "+ Mahsulot qo'shish"}
          </Button>
        ) : null}
        <Row columns="1fr 130px">
          <span>Jami</span>
          <RowMoney>{formatMoney(subtotal)}</RowMoney>
        </Row>
        {discount > 0 ? (
          <Row columns="1fr 130px">
            <span>Chegirma</span>
            <RowMoney className="text-owed">−{formatMoney(discount)}</RowMoney>
          </Row>
        ) : null}
        <Row columns="1fr 130px">
          <span>Xizmat haqi</span>
          <RowMoney>{formatMoney(service)}</RowMoney>
        </Row>
      </Seam>
    </Panel>
  );
}
