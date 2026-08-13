import { Chip, Row, RowHeader, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { StockItem } from '@/api/stock';

const COLUMNS = '1fr 150px 120px';

/**
 * The counted dishes.
 *
 * A row is a selection, not a menu of verbs — the additive verb (Keldi) and
 * the absolute one (Sanoq) used to sit 8px apart looking identical, and
 * picking the wrong one silently produced a wrong number. Choosing between
 * them now happens in the panel, where they are labelled and separated.
 */
export function StockList({
  items,
  selectedId,
  onSelect,
}: {
  items: StockItem[];
  selectedId: string | null;
  onSelect: (item: StockItem) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Taom</span>
        <span>Qoldiq</span>
        <span className="text-right">Tan narx</span>
      </RowHeader>

      {items.map((item) => (
        <Row
          key={item.id}
          columns={COLUMNS}
          selected={item.id === selectedId}
          onClick={() => onSelect(item)}
        >
          <span className="min-w-0 truncate">
            {item.name}
            <RowSub>{item.categoryName}</RowSub>
          </span>

          <span>
            {item.stockCount === null ? (
              <Chip tone="owed">Sanoqsiz</Chip>
            ) : item.stockCount <= 0 ? (
              <Chip tone="owed">Tugadi</Chip>
            ) : (
              <span className="text-[17px] font-semibold tabular-nums">{item.stockCount}</span>
            )}
          </span>

          <RowMoney>
            {item.costPrice ? formatMoney(item.costPrice) : <span className="text-muted-foreground">—</span>}
          </RowMoney>
        </Row>
      ))}
    </Seam>
  );
}
