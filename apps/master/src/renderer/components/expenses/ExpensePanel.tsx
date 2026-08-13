import { ActionBar, Chip, Field, Row, RowMoney, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { Panel } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { ExpenseItem, ExpenseRepayStatus } from '@/api/expenses';
import type { ReturnTarget } from '@/components/expenses/ExpenseReturnDialog';
import type { WriteOffTarget } from '@/components/expenses/ExpenseWriteOffDialog';
import type { ReversalTarget } from '@/components/expenses/ExpenseReverseDialog';

function isToday(date: string | Date) {
  const value = new Date(date);
  const now = new Date();
  return (
    value.getFullYear() === now.getFullYear() &&
    value.getMonth() === now.getMonth() &&
    value.getDate() === now.getDate()
  );
}

const STATUS_LABEL: Record<ExpenseItem['status'], string> = {
  ACTIVE: 'Faol',
  REVERSED: 'Bekor qilingan',
  REVERSAL: 'Qaytarilish',
};

const STATUS_TONE: Record<ExpenseItem['status'], ChipTone> = {
  ACTIVE: 'settled',
  REVERSED: 'owed',
  REVERSAL: 'inert',
};

const REPAY_LABEL: Record<ExpenseRepayStatus, string> = {
  NOT_REPAYABLE: '',
  PENDING: 'Kutilmoqda',
  PARTIAL: 'Qisman',
  RETURNED: 'Qaytarildi',
  WRITTEN_OFF: "Yo'qotildi",
};

const REPAY_TONE: Record<ExpenseRepayStatus, ChipTone> = {
  NOT_REPAYABLE: 'inert',
  PENDING: 'live',
  PARTIAL: 'live',
  RETURNED: 'settled',
  WRITTEN_OFF: 'owed',
};

/**
 * The selected expense and its actions.
 *
 * `Qaytim` and `Yo'qotish` used to be 28px buttons 4px apart with opposite
 * outcomes. Here they sit in an `ActionBar`, so the destructive one — the
 * write-off — always gets the 16px moat, structurally, not by convention.
 */
export function ExpensePanel({
  item,
  onReturn,
  onWriteOff,
  onReverse,
}: {
  item: ExpenseItem;
  onReturn: (target: ReturnTarget) => void;
  onWriteOff: (target: WriteOffTarget) => void;
  onReverse: (target: ReversalTarget) => void;
}) {
  const canReturnOrWriteOff = item.repayable && (item.repayStatus === 'PENDING' || item.repayStatus === 'PARTIAL');
  const canReverse = item.status === 'ACTIVE' && !item.repayable;
  const reverseToday = canReverse && isToday(item.occurredAt);

  const chip =
    item.repayable && item.repayStatus !== 'NOT_REPAYABLE'
      ? { tone: REPAY_TONE[item.repayStatus], label: REPAY_LABEL[item.repayStatus] }
      : { tone: STATUS_TONE[item.status], label: STATUS_LABEL[item.status] };

  return (
    <Panel
      head={
        <>
          <div className="truncate text-[15px] font-semibold">{item.reason}</div>
          <div className="text-[13px] text-muted-foreground">
            {formatDateTime(item.occurredAt)} · {item.categoryName}
          </div>
        </>
      }
      foot={
        canReturnOrWriteOff ? (
          <Field>
            <ActionBar
              destructive={
                <Button
                  variant="destructive"
                  onClick={() =>
                    onWriteOff({ id: item.id, reason: item.reason, remainingAmount: item.remainingAmount ?? '0' })
                  }
                >
                  Yo&apos;qotish
                </Button>
              }
            >
              <Button
                variant="secondary"
                onClick={() =>
                  onReturn({ id: item.id, reason: item.reason, remainingAmount: item.remainingAmount ?? '0' })
                }
              >
                Qaytim
              </Button>
            </ActionBar>
          </Field>
        ) : reverseToday ? (
          <Field>
            <Button
              variant="destructive"
              size="action"
              className="w-full"
              onClick={() => onReverse({ id: item.id, reason: item.reason, amount: item.signedAmount })}
            >
              Bekor qilish
            </Button>
          </Field>
        ) : undefined
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-seam overflow-auto">
        <div className="flex items-center justify-between bg-field px-pad py-2.5">
          <Chip tone={chip.tone}>{chip.label}</Chip>
          <RowMoney className={item.status === 'REVERSAL' ? 'text-owed' : undefined}>
            {item.status === 'REVERSAL' ? '-' : ''}
            {formatMoney(item.amount)}
          </RowMoney>
        </div>

        {item.purchaseId ? (
          <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">
            Bu chiqim Xaridlar sahifasidagi xarid bilan bog&apos;liq
          </div>
        ) : null}

        {item.note ? (
          <div className="bg-field px-pad py-2 text-[13px] italic text-muted-foreground">{item.note}</div>
        ) : null}

        {item.repayable ? (
          <Seam columns="1fr 1fr" className="shrink-0">
            <div className="bg-field px-pad py-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
                Qaytarildi
              </div>
              <div className="mt-0.5 text-[17px] font-semibold tabular-nums">
                {formatMoney(item.returnedTotal ?? '0')}
              </div>
            </div>
            <div className="bg-field px-pad py-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Qoldiq</div>
              <div className="mt-0.5 text-[17px] font-semibold tabular-nums">
                {formatMoney(item.remainingAmount ?? '0')}
              </div>
            </div>
          </Seam>
        ) : null}

        {item.repayable && item.returns.length > 0 ? (
          <Seam className="content-start">
            <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Qaytimlar
            </div>
            {item.returns.map((r) => (
              <Row key={r.id} columns="1fr 130px">
                <span>
                  {formatDateTime(r.receivedAt)}
                  <RowSub>{r.receivedByName}</RowSub>
                </span>
                <RowMoney>{formatMoney(r.amount)}</RowMoney>
              </Row>
            ))}
          </Seam>
        ) : null}

        {item.repayable && item.repayStatus === 'WRITTEN_OFF' ? (
          <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">
            Yo&apos;qotildi: {item.writtenOffReason}
            {item.writtenOffByName ? ` — ${item.writtenOffByName}` : ''}
          </div>
        ) : null}

        {canReverse && !reverseToday ? (
          <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">
            Faqat bugun kiritilgan chiqimni bekor qilish mumkin.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
