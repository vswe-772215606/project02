import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Panel } from '@/components/layout/Screen';
import {
  Keypad,
  Row,
  RowHeader,
  RowMoney,
  RowSub,
  Seam,
  type KeypadKey,
} from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { debtsApi } from '@/api/debts';
import type { ConfirmBody, Order, PaymentMethod } from '@/api/orders';
import { addLeg as addLegTo, removeLeg as removeLegFrom, setLegAmount, toPayments, type Leg } from '@/lib/payment-legs';

/** Which field the middle of the panel is currently driving. `null` = the line list. */
type Editing = { kind: 'discount' } | { kind: 'payment'; index: number } | { kind: 'debtor' } | null;

/** One person, folded together from however many debts they already carry. */
type Debtor = { name: string; phone: string | null; outstanding: number; lastAt: string };

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
 * Collapse the debt ledger into one row per person, most recently seen first.
 *
 * Debtor names are free text on `Debt`, so the same customer can already own
 * several rows; the picker exists partly to stop that growing. Folding by the
 * trimmed name means picking an existing entry reuses their exact spelling
 * rather than minting a near-duplicate.
 */
function foldDebtors(items: Array<{
  debtorName: string;
  debtorPhone: string | null;
  remainingAmount: string;
  openedAt: string;
}>): Debtor[] {
  const byName = new Map<string, Debtor>();

  for (const item of items) {
    const name = item.debtorName.trim();
    if (!name) continue;

    const parsed = Number(item.remainingAmount);
    const remaining = Number.isFinite(parsed) ? parsed : 0;
    const existing = byName.get(name);

    if (!existing) {
      byName.set(name, {
        name,
        phone: item.debtorPhone,
        outstanding: remaining,
        lastAt: item.openedAt,
      });
      continue;
    }

    existing.outstanding += remaining;
    // Keep the phone number from their most recent debt — the older one is
    // more likely to be the stale number.
    if (item.openedAt > existing.lastAt) {
      existing.lastAt = item.openedAt;
      existing.phone = item.debtorPhone ?? existing.phone;
    }
  }

  return [...byName.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/**
 * The order in hand.
 *
 * Everything that must stay reachable — the total and TASDIQLASH — lives in
 * the panel's foot, outside the scroll. The keypad, the debtor picker and the
 * line list all share the middle rather than growing the panel, so no payment
 * method can push the confirm button off a 768px screen.
 *
 * A nasiya leg needs a debtor before it can close. Nasiya is a regulars
 * business, so the picker leads with the people already in the debt ledger —
 * one tap, no typing — and only falls back to a text field for someone new.
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
  // The seeded CASH leg is the balancing leg — it absorbs whatever the other
  // methods do not cover.
  const [balancingIndex] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [debtorName, setDebtorName] = useState('');
  const [debtorPhone, setDebtorPhone] = useState<string | null>(null);
  const [typingNewDebtor, setTypingNewDebtor] = useState(false);

  const due = useMemo(() => Math.max(food - discount, 0) + (order.serviceChargeSnapshot ?? 0), [food, discount, order.serviceChargeSnapshot]);
  const paid = useMemo(() => legs.reduce((sum, leg) => sum + leg.amount, 0), [legs]);
  const balanced = paid === due;
  const hasDebtLeg = legs.some((leg) => leg.method === 'DEBT' && leg.amount > 0);
  const needsDebtor = hasDebtLeg && debtorName.trim().length === 0;

  // Only fetched once a nasiya leg exists — the vast majority of confirms are
  // cash and never touch the debt ledger. Same key as the unfiltered Qarzlar
  // list, so the two share a cache entry.
  const { data: debts } = useQuery({
    queryKey: ['debts', ''],
    queryFn: () => debtsApi.list(),
    enabled: hasDebtLeg,
    staleTime: 60_000,
  });

  const debtors = useMemo(() => foldDebtors(debts?.items ?? []), [debts]);

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
    if (editing.kind !== 'payment') return;
    const index = editing.index;
    setLegs((current) => {
      const nextAmount = applyKey(current[index]?.amount ?? 0, key);
      return setLegAmount(current, index, nextAmount, due, balancingIndex);
    });
  };

  const addLeg = (method: PaymentMethod) => {
    setLegs((current) => addLegTo(current, method, due, balancingIndex));
    // Naming the debtor is the next thing that has to happen, and TASDIQLASH
    // stays disabled until it does — so go straight there rather than making
    // the operator discover a second row.
    if (method === 'DEBT' && debtorName.trim().length === 0) {
      setTypingNewDebtor(false);
      setEditing({ kind: 'debtor' });
    }
  };

  const chooseDebtor = (debtor: Debtor) => {
    setDebtorName(debtor.name);
    setDebtorPhone(debtor.phone);
    setTypingNewDebtor(false);
    setEditing(null);
  };

  const startNewDebtor = () => {
    setDebtorName('');
    setDebtorPhone(null);
    setTypingNewDebtor(true);
  };

  const submit = () => {
    const name = debtorName.trim();
    onConfirm({
      discountAmount: discount > 0 ? discount : null,
      payments: toPayments(legs),
      ...(hasDebtLeg && name
        ? { debt: { debtorName: name, ...(debtorPhone ? { debtorPhone } : {}) } }
        : {}),
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
      {editing?.kind === 'debtor' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-seam">
          <RowHeader className="shrink-0">
            {typingNewDebtor ? 'Yangi qarzdor' : 'Qarzdorni tanlang'}
          </RowHeader>

          {typingNewDebtor ? (
            <div className="flex min-h-0 flex-1 flex-col gap-seam bg-field-raised p-seam">
              <Input
                autoFocus
                value={debtorName}
                onChange={(event) => {
                  setDebtorName(event.target.value);
                  setDebtorPhone(null);
                }}
                placeholder="Qarzdor ismi"
                aria-label="Qarzdor ismi"
              />
              <div className="flex flex-1 items-end gap-seam">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setTypingNewDebtor(false)}
                >
                  Ro'yxat
                </Button>
                <Button
                  className="flex-1"
                  disabled={debtorName.trim().length === 0}
                  onClick={() => setEditing(null)}
                >
                  Tayyor
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-auto">
                <Seam className="content-start">
                  {debtors.map((debtor) => (
                    <Row
                      key={debtor.name}
                      columns="1fr 110px"
                      selected={debtor.name === debtorName}
                      onClick={() => chooseDebtor(debtor)}
                    >
                      <span className="min-w-0 truncate">
                        {debtor.name}
                        <RowSub>{debtor.phone ?? 'telefon yo\'q'}</RowSub>
                      </span>
                      <RowMoney>
                        {debtor.outstanding > 0 ? formatMoney(debtor.outstanding) : '—'}
                      </RowMoney>
                    </Row>
                  ))}
                  {debtors.length === 0 ? (
                    <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">
                      Avvalgi qarzdorlar yo'q
                    </div>
                  ) : null}
                </Seam>
              </div>
              <Button size="action" className="w-full shrink-0" onClick={startNewDebtor}>
                + Yangi qarzdor
              </Button>
            </>
          )}
        </div>
      ) : editing ? (
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
          // The Row below renders as a <button> (it has an onClick), so the
          // remove control must sit beside it rather than inside it — a
          // button nested in a button is invalid markup. This wrapper is the
          // grid row instead; the Row and the × share it as flex siblings.
          <div key={`${leg.method}-${index}`} className="flex gap-seam bg-seam">
            <Row
              className="flex-1"
              columns="1fr 130px"
              onClick={() => setEditing({ kind: 'payment', index })}
            >
              <span>{METHOD_LABEL[leg.method]}</span>
              <RowMoney>{formatMoney(leg.amount)}</RowMoney>
            </Row>
            {legs.length > 1 ? (
              <button
                type="button"
                aria-label={`${METHOD_LABEL[leg.method]} qatorini o'chirish`}
                className="h-control w-control bg-field text-owed"
                onClick={() => {
                  setLegs((current) => removeLegFrom(current, index, due, balancingIndex));
                  setEditing(null);
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}

        {hasDebtLeg ? (
          <Row
            columns="1fr 1fr"
            onClick={() => {
              setTypingNewDebtor(false);
              setEditing({ kind: 'debtor' });
            }}
          >
            <span>Qarzdor</span>
            <span className="min-w-0 truncate text-right font-semibold">
              {debtorName.trim() || 'Tanlanmagan'}
            </span>
          </Row>
        ) : null}

        {needsDebtor ? (
          <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">
            Qarzdorni tanlang
          </div>
        ) : null}

        <div className="flex gap-seam bg-field px-pad py-2">
          {(['CASH', 'CARD', 'DEBT'] as const)
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
