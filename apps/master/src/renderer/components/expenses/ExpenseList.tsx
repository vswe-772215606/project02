import { Chip, Row, RowHeader, RowMoney, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { ExpenseItem, ExpenseRepayStatus } from '@/api/expenses';

const COLUMNS = '1fr 120px 130px';

const REPAY_CHIP: Record<ExpenseRepayStatus, { tone: ChipTone; label: string } | null> = {
  NOT_REPAYABLE: null,
  PENDING: { tone: 'live', label: 'Kutilmoqda' },
  PARTIAL: { tone: 'live', label: 'Qisman' },
  RETURNED: { tone: 'settled', label: 'Qaytarildi' },
  WRITTEN_OFF: { tone: 'owed', label: "Yo'qotildi" },
};

const STATUS_CHIP: Record<ExpenseItem['status'], { tone: ChipTone; label: string } | null> = {
  ACTIVE: null,
  REVERSED: { tone: 'owed', label: 'Bekor qilingan' },
  REVERSAL: { tone: 'inert', label: 'Qaytarilish' },
};

function statusChip(item: ExpenseItem) {
  if (item.repayable) return REPAY_CHIP[item.repayStatus];
  return STATUS_CHIP[item.status];
}

/**
 * The expense list.
 *
 * Selecting a row is the only way in now — its actions used to be 28px
 * buttons crowded into this same row; they live in the panel instead, where
 * `Qaytim` and `Yo'qotish` get room and the 16px moat.
 */
export function ExpenseList({
  items,
  search,
  onSearchChange,
  openRepayableOnly,
  onOpenRepayableOnlyChange,
  selectedId,
  onSelect,
  isLoading,
}: {
  items: ExpenseItem[];
  search: string;
  onSearchChange: (value: string) => void;
  openRepayableOnly: boolean;
  onOpenRepayableOnlyChange: (value: boolean) => void;
  selectedId: string | null;
  onSelect: (item: ExpenseItem) => void;
  isLoading: boolean;
}) {
  return (
    <Seam className="content-start">
      <Seam direction="row" columns="1fr auto" className="shrink-0">
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Sabab yoki izoh bo'yicha qidirish"
          aria-label="Qidirish"
        />
        <label className="flex h-control items-center gap-2.5 whitespace-nowrap bg-field px-pad text-[13px] font-medium">
          <Checkbox
            checked={openRepayableOnly}
            onCheckedChange={(v) => onOpenRepayableOnlyChange(v === true)}
          />
          Faqat ochiq qaytariladiganlar
        </label>
      </Seam>

      <RowHeader columns={COLUMNS}>
        <span>Sabab</span>
        <span>Holat</span>
        <span className="text-right">Summa</span>
      </RowHeader>

      {items.length === 0 ? (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">
          {isLoading
            ? 'Yuklanmoqda…'
            : search.trim() || openRepayableOnly
              ? 'Hech narsa topilmadi'
              : "Bugun chiqimlar yo'q"}
        </div>
      ) : (
        items.map((item) => {
          const chip = statusChip(item);
          return (
            <Row key={item.id} columns={COLUMNS} selected={item.id === selectedId} onClick={() => onSelect(item)}>
              <span className="min-w-0 truncate">
                <span className={item.status === 'REVERSED' ? 'line-through text-muted-foreground' : undefined}>
                  {item.reason}
                </span>
                {item.purchaseId ? <Chip tone="inert" className="ml-2">Xarid</Chip> : null}
                <RowSub>
                  {formatDateTime(item.occurredAt)} · {item.categoryName}
                </RowSub>
              </span>
              <span>{chip ? <Chip tone={chip.tone}>{chip.label}</Chip> : null}</span>
              <RowMoney className={item.status === 'REVERSAL' ? 'text-owed' : undefined}>
                {item.status === 'REVERSAL' ? '-' : ''}
                {formatMoney(item.amount)}
              </RowMoney>
            </Row>
          );
        })
      )}
    </Seam>
  );
}
