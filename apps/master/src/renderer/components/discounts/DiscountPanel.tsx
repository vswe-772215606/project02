import { useEffect, useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { ActionBar, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Discount } from '@/api/discounts';

type DiscountType = Discount['type'];

const FIELD_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground';

/**
 * The editor. `discount` null means "new" — the panel is always the editor,
 * never a read-only view, so there is nothing to switch into edit mode from.
 */
export function DiscountPanel({
  discount,
  maxPercent,
  maxAmount,
  isSaving,
  onSave,
  onDeactivate,
  onReactivate,
}: {
  discount: Discount | null;
  maxPercent: number;
  maxAmount: number;
  isSaving: boolean;
  onSave: (data: { name: string; type: DiscountType; value: number }) => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const isEdit = !!discount;
  const [name, setName] = useState('');
  const [type, setType] = useState<DiscountType>('PERCENT');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(discount?.name ?? '');
    setType(discount?.type ?? 'PERCENT');
    setValue(discount ? String(discount.value) : '');
    setError(null);
  }, [discount]);

  const max = type === 'PERCENT' ? maxPercent : maxAmount;

  const submit = () => {
    if (!name.trim()) {
      setError('Nom kiritilishi shart');
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError("Qiymat noto'g'ri");
      return;
    }
    if (numeric > max) {
      setError(
        type === 'PERCENT'
          ? `Chegirma foizi ${max}% dan oshmasligi kerak`
          : `Chegirma summasi ${formatMoney(max)} dan oshmasligi kerak`,
      );
      return;
    }
    setError(null);
    onSave({ name: name.trim(), type, value: numeric });
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
          <div className="grid gap-1 bg-field p-pad">
            <label htmlFor="discount-name" className={FIELD_LABEL}>
              Chegirma nomi
            </label>
            <Input
              id="discount-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: 10% Bayram chegirmasi"
              autoFocus
            />
          </div>

          <Seam direction="row" columns="1fr 1fr">
            <Button type="button" variant={type === 'PERCENT' ? 'default' : 'secondary'} onClick={() => setType('PERCENT')}>
              Foiz (%)
            </Button>
            <Button type="button" variant={type === 'FIXED' ? 'default' : 'secondary'} onClick={() => setType('FIXED')}>
              Summa (so'm)
            </Button>
          </Seam>

          <div className="grid gap-1 bg-field p-pad">
            <label htmlFor="discount-value" className={FIELD_LABEL}>
              Qiymati
            </label>
            <Input id="discount-value" numeric type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>

          <div className="bg-field-raised px-pad py-2 text-[13px] text-muted-foreground">
            Maksimal:{' '}
            <span className="font-semibold text-foreground tabular-nums">
              {type === 'PERCENT' ? `${maxPercent}%` : formatMoney(maxAmount)}
            </span>
          </div>

          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
        </Seam>
      </div>
    </Panel>
  );
}
