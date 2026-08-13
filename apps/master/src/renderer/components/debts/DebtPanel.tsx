import { useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Chip, Keypad, Row, RowMoney, RowSub, Seam, type ChipTone, type KeypadKey } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { DebtDetail, DebtListItem } from '@/api/debts';

/** Summary row from the list, upgraded to the full detail once it loads. */
export type DebtPanelData = DebtListItem & Partial<Pick<DebtDetail, 'repayments'>>;

const STATUS_CHIP: Record<DebtListItem['status'], { tone: ChipTone; label: string }> = {
  OPEN: { tone: 'owed', label: 'Ochiq' },
  PARTIAL: { tone: 'live', label: 'Qisman' },
  PAID: { tone: 'settled', label: 'Yopilgan' },
  WRITTEN_OFF: { tone: 'owed', label: "Yo'qotilgan" },
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
 * The debt in hand.
 *
 * Repayment is driven by the resident `Keypad`, the same idiom `StockPanel`
 * uses for counting — not the modal dialog this replaces. The amount and the
 * confirm action live in the foot, so a long repayment history above them
 * can never push `TO'LOVNI TASDIQLASH` off the screen.
 */
export function DebtPanel({
  debt,
  submitting,
  error,
  reprinting,
  onRepay,
  onReprint,
}: {
  debt: DebtPanelData;
  submitting: boolean;
  error: string | null;
  reprinting: boolean;
  onRepay: (body: { amount: number; method: 'CASH' | 'CARD'; note: string }) => void;
  onReprint: (orderId: string) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'CASH' | 'CARD'>('CASH');
  const [note, setNote] = useState('');

  const canRepay = debt.status !== 'PAID' && debt.status !== 'WRITTEN_OFF';
  const remaining = Number(debt.remainingAmount);
  const chip = STATUS_CHIP[debt.status];

  const submit = () => {
    if (amount <= 0) return;
    onRepay({ amount, method, note });
  };

  return (
    <Panel
      head={
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{debt.debtorName}</div>
            <div className="text-[13px] text-muted-foreground">
              Chek #{debt.orderNumber}
              {debt.debtorPhone ? ` · ${debt.debtorPhone}` : ''}
            </div>
          </div>
          <Button size="sm" variant="secondary" disabled={reprinting} onClick={() => onReprint(debt.orderId)}>
            {reprinting ? 'Yuborilmoqda…' : 'Chek chiqarish'}
          </Button>
        </div>
      }
      foot={
        canRepay ? (
          <Seam>
            {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
            <div className="flex items-center justify-between bg-selected px-pad py-2.5 text-selected-foreground">
              <span className="text-[13px] font-semibold uppercase tracking-[0.06em]">Qaytim</span>
              <span className="text-[22px] font-semibold tabular-nums">{formatMoney(amount)}</span>
            </div>
            <Button
              size="action"
              className="w-full"
              disabled={amount <= 0 || amount > remaining || submitting}
              onClick={submit}
            >
              {submitting ? 'Saqlanmoqda…' : "TO'LOVNI TASDIQLASH"}
            </Button>
          </Seam>
        ) : undefined
      }
    >
      <Seam columns="1fr 1fr 1fr" className="shrink-0">
        <div className="bg-field px-pad py-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Asl qarz</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular-nums">{formatMoney(debt.originalAmount)}</div>
        </div>
        <div className="bg-field px-pad py-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">To&apos;langan</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular-nums">{formatMoney(debt.repaidAmount)}</div>
        </div>
        <div className="bg-field px-pad py-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Qoldiq</div>
          <div className="mt-0.5 text-[17px] font-semibold tabular-nums">{formatMoney(debt.remainingAmount)}</div>
        </div>
      </Seam>

      <div className="flex shrink-0 items-center gap-seam bg-field px-pad py-2.5">
        <Chip tone={chip.tone}>{chip.label}</Chip>
      </div>

      {canRepay ? (
        <>
          <Seam direction="row" columns="1fr 1fr" className="shrink-0">
            <Button variant={method === 'CASH' ? 'default' : 'secondary'} onClick={() => setMethod('CASH')}>
              Naqd
            </Button>
            <Button variant={method === 'CARD' ? 'default' : 'secondary'} onClick={() => setMethod('CARD')}>
              Karta
            </Button>
          </Seam>

          <div className="shrink-0 bg-field px-pad py-2">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Izoh (ixtiyoriy)"
              aria-label="Izoh"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-start gap-seam overflow-hidden">
            <Keypad
              onKey={(key) => setAmount((value) => Math.min(applyKey(value, key), remaining))}
              className="w-full [&>*]:w-full"
            />

            <div className="min-h-0 flex-1 overflow-auto">
              <Seam className="content-start">
                <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Qaytimlar tarixi
                </div>
                {!debt.repayments ? (
                  <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">Yuklanmoqda…</div>
                ) : debt.repayments.length === 0 ? (
                  <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">Hali to&apos;lov qilinmagan</div>
                ) : (
                  debt.repayments.map((repayment) => (
                    <Row key={repayment.id} columns="1fr 72px 120px">
                      <span>
                        {formatDateTime(repayment.paidAt)}
                        <RowSub>{repayment.receivedByName}</RowSub>
                      </span>
                      <span className="text-[13px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                        {repayment.method === 'CASH' ? 'Naqd' : 'Karta'}
                      </span>
                      <RowMoney>{formatMoney(repayment.amount)}</RowMoney>
                    </Row>
                  ))
                )}
              </Seam>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[13px] text-muted-foreground">
          Bu qarz {debt.status === 'PAID' ? 'yopilgan' : "yo'qotilgan deb belgilangan"} — to&apos;lov qabul qilib bo&apos;lmaydi.
        </div>
      )}
    </Panel>
  );
}
