import { Chip, Field, Seam } from '@/components/blocks';
import type { StockItem } from '@/api/stock';

/**
 * Shows up only when it must: dishes with no count taken today can't be
 * sold (the till rejects the order line), so this is a work item, not a
 * status readout. Silent when empty rather than a quiet "0 ta" — an owed
 * card with nothing owed reads as broken, not reassuring.
 */
export function UncountedDishesCard({ items }: { items: StockItem[] }) {
  if (items.length === 0) return null;

  return (
    <Seam className="content-start">
      <Field tone="owed">
        <div className="text-[17px] font-semibold">
          {items.length} ta taom sanoqsiz — sotib bo&apos;lmaydi
        </div>
      </Field>
      <Field className="flex flex-wrap gap-2.5">
        {items.map((item) => (
          <Chip key={item.id} tone="owed">
            {item.name}
          </Chip>
        ))}
      </Field>
    </Seam>
  );
}
