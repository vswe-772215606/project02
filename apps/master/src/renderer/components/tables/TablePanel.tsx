import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Row, RowMoney, RowSub, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Table as TableModel } from '@/api/tables';
import type { Order } from '@/api/orders';

export type TableEditPayload = { name: string; type: TableModel['type'] };

/**
 * The table in hand.
 *
 * Rename and activate/deactivate live here, in one place, rather than as
 * icons that used to sit 4px apart on the card itself — undiscoverable and
 * mis-tappable on a touchscreen. Only the total and the jump to Tasdiqlash
 * are pinned in the foot; editing the table itself is not time-critical
 * enough to earn that space.
 */
export function TablePanel({
  table,
  order,
  onSave,
  onToggleActive,
  onGoToApproval,
  submitting,
  error,
}: {
  table: TableModel;
  order: Order | null;
  onSave: (data: TableEditPayload) => void;
  onToggleActive: () => void;
  onGoToApproval: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(table.name);
  const [type, setType] = useState(table.type);

  // A new table selection is a new edit — never inherit the previous one's draft.
  useEffect(() => {
    setName(table.name);
    setType(table.type);
  }, [table.id, table.name, table.type]);

  const hasOpenOrder = !!table.activeOrderId;
  const dirty = name.trim() !== table.name || type !== table.type;

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{table.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {table.type === 'ROOM' ? 'Xona' : 'Stol'}
            {!table.isActive ? ' · Nofaol' : ''}
          </div>
        </>
      }
      foot={
        order ? (
          <Seam>
            <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
              <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Jami</span>
              <span className="text-[22px] font-semibold tabular-nums">{formatMoney(order.totalAmount)}</span>
            </div>
            <Button size="action" className="w-full" onClick={onGoToApproval}>
              TASDIQLASHGA O'TISH
            </Button>
          </Seam>
        ) : undefined
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          {hasOpenOrder ? (
            order ? (
              <>
                <Row columns="1fr">
                  <span>
                    {order.waiter?.fullName ?? '—'}
                    <RowSub>{order.itemCount} pozitsiya</RowSub>
                  </span>
                </Row>
                {(order.lines ?? [])
                  .filter((line) => !line.isCanceled)
                  .map((line) => (
                    <Row key={line.id} columns="1fr 110px">
                      <span className="min-w-0 truncate">
                        {line.quantity}× {line.nameSnapshot || line.name}
                      </span>
                      <RowMoney>{formatMoney(line.price * line.quantity)}</RowMoney>
                    </Row>
                  ))}
              </>
            ) : (
              <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">Yuklanmoqda…</div>
            )
          ) : (
            <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">
              Bu stolda ochiq buyurtma yo'q
            </div>
          )}
        </Seam>
      </div>

      <Seam className="shrink-0 content-start">
        <Field>
          <FieldLabel>Nomi</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
        </Field>

        <Seam direction="row" columns="1fr 1fr">
          <Button variant={type === 'TABLE' ? 'default' : 'secondary'} onClick={() => setType('TABLE')}>
            Stol
          </Button>
          <Button variant={type === 'ROOM' ? 'default' : 'secondary'} onClick={() => setType('ROOM')}>
            Xona
          </Button>
        </Seam>

        {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}

        <div className="flex flex-wrap items-center gap-seam bg-field px-pad py-2.5">
          <Button
            variant="secondary"
            disabled={!dirty || submitting}
            onClick={() => onSave({ name: name.trim(), type })}
          >
            Saqlash
          </Button>
          <Button variant="destructive" className="ml-moat" disabled={submitting} onClick={onToggleActive}>
            {table.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
          </Button>
        </div>
      </Seam>
    </Panel>
  );
}
