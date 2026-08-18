import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { ActionBar, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Discount } from '@/api/discounts';

const FIELD_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground';

/**
 * The editor. `discount` null means "new" — the panel is always the editor,
 * never a read-only view, so there is nothing to switch into edit mode from.
 */
export function DiscountPanel({
  discount,
  maxAmount,
  isSaving,
  onSave,
  onDeactivate,
  onReactivate,
}: {
  discount: Discount | null;
  maxAmount: number;
  isSaving: boolean;
  onSave: (data: { name: string; value: number }) => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const isEdit = !!discount;
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(discount?.name ?? '');
    setValue(discount ? String(discount.value) : '');
    setError(null);
  }, [discount]);

  const submit = () => {
    if (!name.trim()) {
      setError('Nom kiritilishi shart');
      return;
    }
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < 0) {
      setError("Summa butun son bo'lishi kerak");
      return;
    }
    if (numeric > maxAmount) {
      setError(`Chegirma summasi ${formatMoney(maxAmount)} so'mdan oshmasligi kerak`);
      return;
    }
    setError(null);
    onSave({ name: name.trim(), value: numeric });
  };

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">{isEdit ? discount.name : 'Yangi chegirma'}</div>}
      foot={
        <div className="bg-field p-pad">
          <ActionBar
            destructive={
              isEdit && discount.isActive ? (
                <Button variant="destructive" onClick={onDeactivate}>
                  Faolsizlantirish
                </Button>
              ) : undefined
            }
          >
            {isEdit && !discount.isActive ? (
              <Button variant="secondary" onClick={onReactivate}>
                Faollashtirish
              </Button>
            ) : null}
            <Button onClick={submit} disabled={isSaving}>
              {isSaving ? 'Saqlanmoqda…' : 'Saqlash'}
            </Button>
          </ActionBar>
        </div>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <div className="grid gap-1 bg-field-raised p-pad">
            <label htmlFor="discount-name" className={FIELD_LABEL}>
              Chegirma nomi
            </label>
            <Input
              id="discount-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Bayram chegirmasi"
              autoFocus
            />
          </div>

          <div className="grid gap-1 bg-field-raised p-pad">
            <label htmlFor="discount-value" className={FIELD_LABEL}>
              Summasi (so&apos;m)
            </label>
            <Input
              id="discount-value"
              numeric
              type="number"
              step="1"
              min="0"
              value={value}
              placeholder="0"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>

          <div className="bg-field-raised px-pad py-2 text-[13px] text-muted-foreground">
            Maksimal:{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(maxAmount)} so&apos;m
            </span>
          </div>

          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
        </Seam>
      </div>
    </Panel>
  );
}
