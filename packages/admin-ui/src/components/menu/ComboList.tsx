import { Row, RowHeader, RowMoney, RowSub, Seam } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import type { Combo } from '@/api/menu';

const COLUMNS = '1fr 130px';

export function ComboList({
  combos,
  selectedId,
  onSelect,
}: {
  combos: Combo[];
  selectedId: string | null;
  onSelect: (combo: Combo) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader columns={COLUMNS}>
        <span>Kombo</span>
        <span className="text-right">Narxi</span>
      </RowHeader>

      {combos.map((combo) => (
        <Row
          key={combo.id}
          columns={COLUMNS}
          selected={combo.id === selectedId}
          inert={!combo.isActive}
          onClick={() => onSelect(combo)}
        >
          <span className="min-w-0 truncate">
            {combo.name}
            <RowSub>
              {combo.components.length} ta tarkib
              {!combo.isActive ? ' · Nofaol' : ''}
            </RowSub>
          </span>
          <RowMoney>{formatMoney(combo.price)}</RowMoney>
        </Row>
      ))}

      {combos.length === 0 ? (
        <div className="bg-field px-pad py-3 text-center text-[13px] text-muted-foreground">
          Kombolar yo'q
        </div>
      ) : null}
    </Seam>
  );
}
