import { Chip, Row, RowHeader, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { MenuItem } from '@/api/menu';

const COLUMNS = '1fr 110px 96px 108px';

function StockCell({ item }: { item: MenuItem }) {
  if (item.kind === 'SERVICE' || !item.counted) {
    return <span className="text-[13px] text-muted-foreground">Doim mavjud</span>;
  }
  if (item.stockCount === null) return <Chip tone="owed">Sanoqsiz</Chip>;
  if (item.stockCount <= 0) return <Chip tone="owed">Tugadi</Chip>;
  return <span className="text-[15px] font-semibold tabular-nums">{item.stockCount}</span>;
}

/**
 * Items for the selected category, right column.
 *
 * Every mutating action — edit, availability, deactivate — used to be a raw
 * icon button crammed into the row's last cell. A clickable Row cannot host
 * a nested control (button-in-button breaks keyboard and screen-reader
 * behaviour), so selecting a row now hands the whole action set to the panel.
 */
export function ItemList({
  items,
  categoryName,
  selectedId,
  onSelect,
}: {
  items: MenuItem[];
  categoryName: string;
  selectedId: string | null;
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span className="truncate">{categoryName}</span>
        <span className="text-right">Narxi</span>
        <span className="text-center">Qoldiq</span>
        <span className="text-center">Holati</span>
      </RowHeader>

      {items.map((item) => (
        <Row
          key={item.id}
          columns={COLUMNS}
          selected={item.id === selectedId}
          inert={!item.isActive}
          onClick={() => onSelect(item)}
        >
          <span className="min-w-0 truncate">
            {item.name}
            {item.description ? <RowSub>{item.description}</RowSub> : null}
          </span>
          <RowMoney>{formatMoney(item.price)}</RowMoney>
          <span className="flex justify-center">
            <StockCell item={item} />
          </span>
          <span className="flex justify-center">
            <Chip tone={item.isAvailable ? 'settled' : 'owed'}>
              {item.isAvailable ? 'Mavjud' : 'Mavjud emas'}
            </Chip>
          </span>
        </Row>
      ))}

      {items.length === 0 ? (
        <div className="bg-field px-pad py-3 text-center text-[13px] text-muted-foreground">
          Ushbu kategoriyada mahsulot yo'q
        </div>
      ) : null}
    </Seam>
  );
}
