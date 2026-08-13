import { Chip, Row, RowHeader, RowMoney, RowSub, Seam, type ChipTone } from '@/components/blocks';
import { Input } from '@/components/ui/input';
import { formatDate, formatMoney } from '@/lib/format';
import type { DebtListItem } from '@/api/debts';

const COLUMNS = '1fr 120px 140px';

const STATUS_CHIP: Record<DebtListItem['status'], { tone: ChipTone; label: string }> = {
  OPEN: { tone: 'owed', label: 'Ochiq' },
  PARTIAL: { tone: 'live', label: 'Qisman' },
  PAID: { tone: 'settled', label: 'Yopilgan' },
  WRITTEN_OFF: { tone: 'owed', label: "Yo'qotilgan" },
};

/**
 * The debt list.
 *
 * A row is the only route into repaying it — and unlike the `<table>` it
 * replaces, a Row renders as a real button: reachable by keyboard, and
 * carrying its own fill so it never reads as inert text on a touchscreen.
 */
export function DebtList({
  items,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  isLoading,
}: {
  items: DebtListItem[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (item: DebtListItem) => void;
  isLoading: boolean;
}) {
  return (
    <Seam className="content-start">
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Qarzdorni qidirish (ism yoki telefon)"
        aria-label="Qidirish"
      />

      <RowHeader columns={COLUMNS}>
        <span>Mijoz</span>
        <span>Holat</span>
        <span className="text-right">Qoldiq</span>
      </RowHeader>

      {items.length === 0 ? (
        <div className="bg-field px-pad py-3 text-[13px] text-muted-foreground">
          {isLoading ? 'Yuklanmoqda…' : search.trim() ? 'Hech narsa topilmadi' : "Qarzlar yo'q"}
        </div>
      ) : (
        items.map((item) => {
          const chip = STATUS_CHIP[item.status];
          return (
            <Row
              key={item.id}
              columns={COLUMNS}
              selected={item.id === selectedId}
              onClick={() => onSelect(item)}
            >
              <span className="min-w-0 truncate">
                {item.debtorName}
                <RowSub>
                  Chek #{item.orderNumber} · {formatDate(item.openedAt)}
                  {item.debtorPhone ? ` · ${item.debtorPhone}` : ''}
                </RowSub>
              </span>
              <span>
                <Chip tone={chip.tone}>{chip.label}</Chip>
              </span>
              <RowMoney>{formatMoney(item.remainingAmount)}</RowMoney>
            </Row>
          );
        })
      )}
    </Seam>
  );
}
