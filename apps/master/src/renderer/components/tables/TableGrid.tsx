import { Seam, Tile, type TileTone } from '@/components/blocks';
import type { Table as TableModel } from '@/api/tables';

function tone(table: TableModel, isSelected: boolean): TileTone {
  if (isSelected) return 'selected';
  if (!table.isActive) return 'inert';
  if (table.activeOrderId) return 'live';
  return 'default';
}

function stateWord(table: TableModel): string {
  if (!table.isActive) return 'Nofaol';
  if (table.activeOrderId) return 'Band';
  return 'Bo\'sh';
}

/**
 * The floor. Every tile is a solid fill, never a translucent tint — the page
 * this replaces signalled occupancy at 10% opacity, invisible from across the
 * room. The state word is always shown too, independent of the fill, so a
 * selected occupied table still reads "Band" under its dark selected fill.
 */
export function TableGrid({
  tables,
  selectedId,
  onSelect,
}: {
  tables: TableModel[];
  selectedId: string | null;
  onSelect: (table: TableModel) => void;
}) {
  if (tables.length === 0) {
    return (
      <div className="bg-field px-pad py-3 text-center text-[13px] text-muted-foreground">
        Stollar yo'q
      </div>
    );
  }

  return (
    <Seam className="content-start grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {tables.map((table) => (
        <Tile
          key={table.id}
          className="w-full"
          label={table.name}
          state={stateWord(table)}
          tone={tone(table, table.id === selectedId)}
          onClick={() => onSelect(table)}
        />
      ))}
    </Seam>
  );
}
