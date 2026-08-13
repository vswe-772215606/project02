import { Row, RowHeader, RowSub, Seam } from '@/components/blocks';
import type { Category } from '@/api/menu';

/**
 * Categories, left column.
 *
 * Rename, reorder and deactivate used to be four icons that only appeared on
 * `hover` — meaning they did not exist on a touchscreen at all. Selecting a
 * category here is the only gesture; everything you can do about it lives in
 * the panel.
 */
export function CategoryList({
  categories,
  itemCounts,
  selectedId,
  onSelect,
}: {
  categories: Category[];
  itemCounts: Map<string, number>;
  selectedId: string | null;
  onSelect: (category: Category) => void;
}) {
  return (
    <Seam className="content-start">
      <RowHeader>Kategoriyalar</RowHeader>

      {categories.map((category) => (
        <Row
          key={category.id}
          selected={category.id === selectedId}
          inert={!category.isActive}
          onClick={() => onSelect(category)}
        >
          <span className="min-w-0 truncate">
            {category.name}
            <RowSub>
              {itemCounts.get(category.id) ?? 0} ta mahsulot
              {!category.isActive ? ' · Nofaol' : ''}
            </RowSub>
          </span>
        </Row>
      ))}

      {categories.length === 0 ? (
        <div className="bg-field px-pad py-3 text-center text-[13px] text-muted-foreground">
          Kategoriya yo'q
        </div>
      ) : null}
    </Seam>
  );
}
