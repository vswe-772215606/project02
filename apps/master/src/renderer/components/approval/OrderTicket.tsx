import { useMemo, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Keypad, Row, RowMoney, RowSub, Seam, type KeypadKey } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type { ConfirmBody, Order, PaymentMethod } from '@/api/orders';

/** Which numeric field the keypad is currently driving. `null` = keypad hidden. */
type Editing = { kind: 'discount' } | { kind: 'payment'; index: number } | null;

type Leg = { method: PaymentMethod; amount: number };

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Naqd',
  CARD: 'Karta',
  DEBT: 'Nasiya',
};

function applyKey(current: number, key: KeypadKey): number {
  if (key === 'backspace') return Math.floor(current / 10);
  if (key === 'decimal') return current;
  if (key === '000') return current * 1000;
  const digit = Number(key);
  if (!Number.isFinite(digit)) return current;
  return current * 10 + digit;
}

/**
 * The order in hand.
 *
 * Everything that must stay reachable — the total and TASDIQLASH — lives in
 * the panel's foot, outside the scroll. The keypad, when a number is being
 * entered, replaces the line list in the middle rather than growing the panel,
 * so no payment method can push the confirm button off a 768px screen.
 */
export function OrderTicket({
  order,
  submitting,
  error,
  onConfirm,
}: {
  order: Order;
  submitting: boolean;
  error?: string | null;
  onConfirm: (body: ConfirmBody) => void;
}) {
  const food = order.subtotalSnapshot ?? order.totalAmount;
  const [discount, setDiscount] = useState(0);
  const [legs, setLegs] = useState<Leg[]>([{ method: 'CASH', amount: order.totalAmount }]);
  const [editing, setEditing] = useState<Editing>(null);
  const [debtorName, setDebtorName] = useState('');

  const due = useMemo(() => Math.max(food - discount, 0) + (order.serviceChargeSnapshot ?? 0), [food, discount, order.serviceChargeSnapshot]);
  const paid = useMemo(() => legs.reduce((sum, leg) => sum + leg.amount, 0), [legs]);
  const balanced = paid === due;
  const needsDebtor = legs.some((leg) => leg.method === 'DEBT') && debtorName.trim().length === 0;

  const editingValue =
    editing?.kind === 'discount'
      ? discount
      : editing?.kind === 'payment'
        ? (legs[editing.index]?.amount ?? 0)
        : 0;

  const editingLabel =
    editing?.kind === 'discount'
      ? 'Chegirma'
      : editing?.kind === 'payment'
        ? METHOD_LABEL[legs[editing.index]?.method ?? 'CASH']
        : '';

  const onKey = (key: KeypadKey) => {
    if (!editing) return;
    if (editing.kind === 'discount') {
      setDiscount((value) => Math.min(applyKey(value, key), food));
      return;
    }
    setLegs((current) =>
      current.map((leg, index) =>
        index === editing.index ? { ...leg, amount: applyKey(leg.amount, key) } : leg,
      ),
    );
  };

  const addLeg = (method: PaymentMethod) => {
    const remaining = Math.max(due - paid, 0);
    setLegs((current) => [...current, { method, amount: remaining }]);
  };

  const submit = () => {
    onConfirm({
      discountAmount: discount > 0 ? discount : null,
      payments: legs.map((leg) => ({ method: leg.method, amount: leg.amount })),
      ...(needsDebtor ? {} : legs.some((l) => l.method === 'DEBT') ? { debt: { debtorName: debtorName.trim() } } : {}),
    });
  };

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">
            {order.tableName ?? (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol yo\'q')}
          </div>
          <div className="text-[13px] text-muted-foreground">
            {order.waiter?.fullName ?? '—'} · {order.itemCount} pozitsiya
          </div>
        </>
      }
      foot={
        <Seam>
          {error ? (
            <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div>
          ) : null}
          {!balanced ? (
            <div className="bg-field-raised px-pad py-2 text-[13px] text-muted-foreground">
              Farq: {formatMoney(due - paid)} so'm
            </div>
          ) : null}
          <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">To'lanadi</span>
            <span className="text-[22px] font-semibold tabular-nums">{formatMoney(due)}</span>
          </div>
          <Button size="action" className="w-full" disabled={!balanced || needsDebtor || submitting} onClick={submit}>
            {submitting ? 'Saqlanmoqda…' : 'TASDIQLASH'}
          </Button>
        </Seam>
      }
    >
      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-seam bg-field-raised p-seam">
          <div className="flex items-baseline justify-between bg-field px-pad py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
              {editingLabel}
            </span>
            <span className="text-[22px] font-semibold tabular-nums">{formatMoney(editingValue)}</span>
          </div>
          <Keypad onKey={onKey} className="w-full [&>*]:w-full" />
          <Button variant="secondary" className="w-full" onClick={() => setEditing(null)}>
            Tayyor
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <Seam className="content-start">
            {order.lines
              ?.filter((line) => !line.isCanceled)
              .map((line) => (
                <Row key={line.id} columns="1fr 110px">
                  <span className="min-w-0 truncate">
                    {line.quantity}× {line.nameSnapshot || line.name}
                    {line.notes ? <RowSub>{line.notes}</RowSub> : null}
                  </span>
                  <RowMoney>{formatMoney(line.price * line.quantity)}</RowMoney>
                </Row>
              ))}
          </Seam>
        </div>
      )}

      <Seam className="shrink-0 content-start">
        <Row columns="1fr 130px" onClick={() => setEditing({ kind: 'discount' })}>
          <span>Chegirma</span>
          <RowMoney>{formatMoney(discount)}</RowMoney>
        </Row>

        {legs.map((leg, index) => (
          <Row
            key={`${leg.method}-${index}`}
            columns="1fr 130px"
            onClick={() => setEditing({ kind: 'payment', index })}
          >
            <span>{METHOD_LABEL[leg.method]}</span>
            <RowMoney>{formatMoney(leg.amount)}</RowMoney>
          </Row>
        ))}

        {needsDebtor ? (
          <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">
            Qarzdor ismini kiriting
          </div>
        ) : null}

        <div className="flex gap-seam bg-field px-pad py-2">
          {(['CARD', 'DEBT'] as const)
            .filter((method) => !legs.some((leg) => leg.method === method))
            .map((method) => (
              <Button key={method} variant="secondary" size="sm" onClick={() => addLeg(method)}>
                + {METHOD_LABEL[method]}
              </Button>
            ))}
        </div>
      </Seam>
    </Panel>
  );
}
