import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Category } from '@/api/menu';

/**
 * The category in hand: rename, reorder, activate/deactivate. All four used
 * to be 22px icons 4px apart, visible only on hover — undiscoverable on a
 * touchscreen and one accidental tap from deactivating the wrong thing.
 */
export function CategoryPanel({
  category,
  itemCount,
  canMoveUp,
  canMoveDown,
  onSave,
  onReorder,
  onToggleActive,
  submitting,
  error,
}: {
  category: Category;
  itemCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSave: (name: string) => void;
  onReorder: (direction: 'up' | 'down') => void;
  onToggleActive: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(category.name);

  useEffect(() => setName(category.name), [category.id, category.name]);

  const dirty = name.trim().length > 0 && name.trim() !== category.name;

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{category.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {itemCount} ta mahsulot
            {!category.isActive ? ' · Nofaol' : ''}
          </div>
        </>
      }
      foot={
        <Seam>
          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
          <div className="flex flex-wrap items-center gap-seam bg-field px-pad py-2.5">
            <Button variant="secondary" disabled={!dirty || submitting} onClick={() => onSave(name.trim())}>
              Saqlash
            </Button>
            <Button variant="destructive" className="ml-moat" disabled={submitting} onClick={onToggleActive}>
              {category.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
            </Button>
          </div>
        </Seam>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Field>
            <FieldLabel>Nomi</FieldLabel>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
          </Field>

          <Seam direction="row" columns="1fr 1fr">
            <Button variant="secondary" disabled={!canMoveUp || submitting} onClick={() => onReorder('up')}>
              Yuqoriga
            </Button>
            <Button variant="secondary" disabled={!canMoveDown || submitting} onClick={() => onReorder('down')}>
              Pastga
            </Button>
          </Seam>
        </Seam>
      </div>
    </Panel>
  );
}
