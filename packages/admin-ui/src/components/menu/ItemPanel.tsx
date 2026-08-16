import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, RowSub, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PickerStrip } from './PickerStrip';
import type { Category, MenuItem } from '@/api/menu';

export type ItemEditPayload = {
  name: string;
  categoryId: string;
  price: number;
  counted: boolean;
  costPrice: number | null;
};

/**
 * The item in hand.
 *
 * Edit, availability and activate/deactivate were three separate icon
 * buttons wedged into a table row's last cell. They now live together here,
 * each labelled by the action it performs rather than an icon and a tooltip.
 */
export function ItemPanel({
  item,
  categories,
  onSave,
  onToggleAvailability,
  onToggleActive,
  submitting,
  availabilityPending,
  error,
}: {
  item: MenuItem;
  categories: Category[];
  onSave: (data: ItemEditPayload) => void;
  onToggleAvailability: () => void;
  onToggleActive: () => void;
  submitting: boolean;
  availabilityPending: boolean;
  error: string | null;
}) {
  const isService = item.kind === 'SERVICE';

  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [price, setPrice] = useState(String(item.price));
  const [costPrice, setCostPrice] = useState(item.costPrice ?? '');
  const [counted, setCounted] = useState(item.counted);

  useEffect(() => {
    setName(item.name);
    setCategoryId(item.categoryId);
    setPrice(String(item.price));
    setCostPrice(item.costPrice ?? '');
    setCounted(item.counted);
  }, [item.id, item.name, item.categoryId, item.price, item.costPrice, item.counted]);

  const priceNum = Number(price);
  const priceValid = price.trim().length > 0 && Number.isFinite(priceNum) && priceNum >= 0;

  const dirty =
    name.trim() !== item.name ||
    categoryId !== item.categoryId ||
    (priceValid && priceNum !== item.price) ||
    String(costPrice).trim() !== (item.costPrice ?? '') ||
    counted !== item.counted;

  const categoryName = categories.find((c) => c.id === item.categoryId)?.name ?? '—';

  const save = () => {
    if (!name.trim() || !priceValid) return;
    onSave({
      name: name.trim(),
      categoryId,
      price: priceNum,
      counted,
      costPrice: String(costPrice).trim() ? Number(costPrice) : null,
    });
  };

  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{item.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {categoryName} · {isService ? 'Xizmat haqi' : item.counted ? 'Sanaladigan' : 'Sanoqsiz'}
            {!item.isActive ? ' · Nofaol' : ''}
          </div>
        </>
      }
      foot={
        <Seam>
          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
          {!priceValid ? (
            <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">Sotuv narxi noto'g'ri</div>
          ) : null}
          <div className="flex flex-wrap items-center gap-seam bg-field px-pad py-2.5">
            <Button variant="secondary" disabled={!dirty || !priceValid || submitting} onClick={save}>
              Saqlash
            </Button>
            <Button variant="secondary" disabled={availabilityPending} onClick={onToggleAvailability}>
              {item.isAvailable ? 'Sotuvdan olish' : 'Sotuvga qo\'yish'}
            </Button>
            <Button variant="destructive" className="ml-moat" disabled={submitting} onClick={onToggleActive}>
              {item.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
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

          <Field>
            <FieldLabel>Kategoriya</FieldLabel>
            <div className="mt-1.5">
              <PickerStrip options={categories} activeId={categoryId} onPick={(c) => setCategoryId(c.id)} />
            </div>
          </Field>

          <Seam direction="row" columns={isService ? '1fr' : '1fr 1fr'}>
            <Field>
              <FieldLabel>Narxi</FieldLabel>
              <Input
                type="number"
                numeric
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1.5"
              />
            </Field>
            {!isService ? (
              <Field>
                <FieldLabel>Tan narx</FieldLabel>
                <Input
                  type="number"
                  numeric
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="mt-1.5"
                />
              </Field>
            ) : null}
          </Seam>

          {!isService ? (
            <label className="flex items-start gap-3 bg-field px-pad py-2.5 text-[14px]">
              <Checkbox className="mt-0.5" checked={counted} onCheckedChange={(v) => setCounted(v === true)} />
              <span>
                Sanaladigan
                <RowSub>
                  Yoqilsa qoldiq NULL bo'ladi — Ombor sahifasida sanoq kiritilguncha sotilmaydi.
                </RowSub>
              </span>
            </label>
          ) : null}
        </Seam>
      </div>
    </Panel>
  );
}
