import { useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PickerStrip } from './PickerStrip';
import type { Category, CreateItemPayload } from '@/api/menu';

type Mode = 'COUNTED' | 'UNCOUNTED' | 'SERVICE';

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'COUNTED', label: 'Sanaladigan', hint: 'Qoldiq soni yuritiladi (plov, Pepsi, somsa)' },
  { id: 'UNCOUNTED', label: 'Sanoqsiz', hint: 'Qoldiq sanalmaydi, doim sotuvda (choy)' },
  { id: 'SERVICE', label: 'Xizmat haqi', hint: 'Ovqat emas — hisobga xizmat qatori' },
];

/** Create-mode is unchangeable after this — mirrors the server, which has no
 * DELETE route and no way to move a dish between modes post-creation. */
export function NewItemPanel({
  categories,
  initialCategoryId,
  onCancel,
  onSave,
  submitting,
  error,
}: {
  categories: Category[];
  initialCategoryId: string | null;
  onCancel: () => void;
  onSave: (data: CreateItemPayload) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [mode, setMode] = useState<Mode>('COUNTED');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId ?? categories[0]?.id ?? '');
  const [price, setPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [initialCount, setInitialCount] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError('Nomini kiriting');
    if (!categoryId) return setFormError('Kategoriyani tanlang');
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setFormError('Sotuv narxi noto\'g\'ri');

    const base = { categoryId, name: trimmedName, price: priceNum };

    if (mode === 'SERVICE') {
      onSave({ ...base, mode: 'SERVICE' });
      return;
    }

    onSave({
      ...base,
      mode,
      costPrice: costPrice.trim() ? Number(costPrice) : null,
      initialCount: mode === 'COUNTED' && initialCount.trim() ? Number(initialCount) : null,
    });
  };

  const activeHint = MODES.find((m) => m.id === mode)?.hint ?? '';

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">Yangi mahsulot</div>}
      foot={
        <Seam>
          {formError || error ? (
            <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{formError || error}</div>
          ) : null}
          <div className="flex gap-seam bg-field px-pad py-2.5">
            <Button variant="secondary" className="flex-1" disabled={submitting} onClick={onCancel}>
              Bekor qilish
            </Button>
          </div>
          <Button size="action" className="w-full" disabled={submitting} onClick={submit}>
            {submitting ? 'Saqlanmoqda…' : 'QO\'SHISH'}
          </Button>
        </Seam>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Seam direction="row" columns="1fr 1fr 1fr">
            {MODES.map((m) => (
              <Button key={m.id} variant={mode === m.id ? 'default' : 'secondary'} onClick={() => setMode(m.id)}>
                {m.label}
              </Button>
            ))}
          </Seam>
          <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">{activeHint}</div>

          <Field>
            <FieldLabel>Nomi</FieldLabel>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
          </Field>

          <Field>
            <FieldLabel>Kategoriya</FieldLabel>
            <div className="mt-1.5">
              <PickerStrip options={categories} activeId={categoryId || null} onPick={(c) => setCategoryId(c.id)} />
            </div>
          </Field>

          <Seam direction="row" columns={mode === 'SERVICE' ? '1fr' : '1fr 1fr'}>
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
            {mode !== 'SERVICE' ? (
              <Field>
                <FieldLabel>Tan narx (ixtiyoriy)</FieldLabel>
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

          {mode === 'COUNTED' ? (
            <Field>
              <FieldLabel>Boshlang'ich sanoq (ixtiyoriy)</FieldLabel>
              <Input
                type="number"
                numeric
                value={initialCount}
                onChange={(e) => setInitialCount(e.target.value)}
                className="mt-1.5"
              />
            </Field>
          ) : null}
        </Seam>
      </div>
    </Panel>
  );
}
