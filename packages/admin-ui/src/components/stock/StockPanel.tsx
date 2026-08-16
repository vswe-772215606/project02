import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Keypad, Row, RowSub, Seam, type KeypadKey } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { formatMoney } from '@/lib/format';
import type { StockEntry, StockItem } from '@/api/stock';

export type StockVerb = 'count' | 'restock';

/** Which number the keypad is driving while in Keldi mode. */
type RestockField = 'qty' | 'paid';

function applyKey(current: number, key: KeypadKey): number {
  if (key === 'backspace') return Math.floor(current / 10);
  if (key === 'decimal') return current;
  if (key === '000') return current * 1000;
  const digit = Number(key);
  if (!Number.isFinite(digit)) return current;
  return current * 10 + digit;
}

function entryLine(entry: StockEntry): string {
  if (entry.kind === 'RESTOCK') {
    const paid = entry.paidUzs ? ` · ${formatMoney(entry.paidUzs)} so'm` : '';
    return `+${entry.qty}${paid} → ${entry.countAfter}`;
  }
  return `${entry.countBefore ?? '—'} → ${entry.countAfter}`;
}

/**
 * The dish in hand.
 *
 * Counting is the reason this screen exists, so the keypad is resident rather
 * than contextual — unlike the confirm panel, where typing is the exception.
 * The two verbs are a labelled switch, never two identical adjacent buttons.
 */
export function StockPanel({
  item,
  entries,
  verb,
  onVerbChange,
  submitting,
  hasNextUncounted,
  onSave,
}: {
  item: StockItem;
  entries: StockEntry[];
  verb: StockVerb;
  onVerbChange: (verb: StockVerb) => void;
  submitting: boolean;
  hasNextUncounted: boolean;
  onSave: (payload:
    | { verb: 'count'; countedQty: number }
    | { verb: 'restock'; qty: number; paidUzs: number | null; setCostFromPaid: boolean }
  ) => void;
}) {
  const [counted, setCounted] = useState(0);
  const [qty, setQty] = useState(0);
  const [paid, setPaid] = useState(0);
  const [field, setField] = useState<RestockField>('qty');
  const [updateCost, setUpdateCost] = useState(true);

  // A new dish is a new entry — never inherit the previous one's digits.
  useEffect(() => {
    setCounted(0);
    setQty(0);
    setPaid(0);
    setField('qty');
  }, [item.id, verb]);

  const onKey = (key: KeypadKey) => {
    if (verb === 'count') {
      setCounted((value) => applyKey(value, key));
      return;
    }
    if (field === 'qty') setQty((value) => applyKey(value, key));
    else setPaid((value) => applyKey(value, key));
  };

  const derivedUnitCost = verb === 'restock' && paid > 0 && qty > 0 ? Math.round(paid / qty) : null;
  const canSave = verb === 'count' ? true : qty > 0;

  const save = () => {
    if (verb === 'count') onSave({ verb: 'count', countedQty: counted });
    else onSave({ verb: 'restock', qty, paidUzs: paid > 0 ? paid : null, setCostFromPaid: paid > 0 && updateCost });
  };

  const saveLabel =
    verb === 'count'
      ? hasNextUncounted
        ? 'SAQLA VA KEYINGISI'
        : 'SAQLA'
      : 'KIRIMNI SAQLA';

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{item.name}</div>
          <div className="text-[13px] text-muted-foreground">{item.categoryName}</div>
        </>
      }
      foot={
        <Seam>
          <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
            <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">
              {verb === 'count' ? 'Yangi qoldiq' : 'Yangi qoldiq'}
            </span>
            <span className="text-[22px] font-semibold tabular-nums">
              {verb === 'count' ? counted : (item.stockCount ?? 0) + qty}
            </span>
          </div>
          <Button size="action" className="w-full" disabled={!canSave || submitting} onClick={save}>
            {submitting ? 'Saqlanmoqda…' : saveLabel}
          </Button>
        </Seam>
      }
    >
      <Seam direction="row" columns="1fr 1fr" className="shrink-0">
        <Button
          variant={verb === 'count' ? 'default' : 'secondary'}
          onClick={() => onVerbChange('count')}
        >
          Sanoq
        </Button>
        <Button
          variant={verb === 'restock' ? 'default' : 'secondary'}
          onClick={() => onVerbChange('restock')}
        >
          Keldi
        </Button>
      </Seam>

      <div className="shrink-0 bg-field px-pad py-2 text-[13px] text-muted-foreground">
        {verb === 'count'
          ? 'Hozir omborda nechta borligini yozing — raqam shu qiymatga o\'rnatiladi.'
          : 'Nechta keldi va (ixtiyoriy) qancha to\'landi.'}
      </div>

      {verb === 'restock' && (
        <Seam className="shrink-0">
          <Row columns="1fr 120px" selected={field === 'qty'} onClick={() => setField('qty')}>
            <span>Nechta keldi</span>
            <span className="text-right text-[17px] font-semibold tabular-nums">{qty}</span>
          </Row>
          <Row columns="1fr 120px" selected={field === 'paid'} onClick={() => setField('paid')}>
            <span>
              To'landi
              {derivedUnitCost !== null ? <RowSub>birlik {formatMoney(derivedUnitCost)}</RowSub> : null}
            </span>
            <span className="text-right text-[17px] font-semibold tabular-nums">{formatMoney(paid)}</span>
          </Row>
          {paid > 0 && (
            <label className="flex items-center gap-3 bg-field px-pad py-2.5 text-[14px]">
              <Checkbox checked={updateCost} onCheckedChange={(v) => setUpdateCost(v === true)} />
              Tan narxni yangilash
            </label>
          )}
        </Seam>
      )}

      {verb === 'count' && (
        <div className="flex shrink-0 items-baseline justify-between bg-field px-pad py-2.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            Sanoq
          </span>
          <span className="text-[26px] font-semibold tabular-nums">{counted}</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col justify-start gap-seam overflow-hidden">
        <Keypad onKey={onKey} className="w-full [&>*]:w-full" />

        <div className="min-h-0 flex-1 overflow-auto">
          <Seam className="content-start">
            <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Tarix
            </div>
            {entries.length === 0 ? (
              <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">
                Hozircha yozuv yo'q
              </div>
            ) : (
              entries.slice(0, 4).map((entry) => (
                <Row key={entry.id} columns="1fr auto">
                  <span className="text-[13px] text-muted-foreground">
                    {new Date(entry.occurredAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' })}
                    {' · '}
                    {entry.kind === 'RESTOCK' ? 'Keldi' : 'Sanoq'}
                  </span>
                  <span className="text-[13px] tabular-nums">{entryLine(entry)}</span>
                </Row>
              ))
            )}
          </Seam>
        </div>
      </div>
    </Panel>
  );
}
