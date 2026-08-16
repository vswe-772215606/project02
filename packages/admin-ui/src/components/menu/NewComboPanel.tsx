import { useState } from 'react';
import { X } from 'lucide-react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Row, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PickerStrip } from './PickerStrip';
import type { MenuItem } from '@/api/menu';

type DraftComponent = { menuItemId: string; name: string; quantity: number };

export function NewComboPanel({
  items,
  onCancel,
  onSave,
  submitting,
  error,
}: {
  items: MenuItem[];
  onCancel: () => void;
  onSave: (data: { name: string; components: { menuItemId: string; quantity: number }[] }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState('');
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const addComponent = (item: MenuItem) => {
    setComponents((current) =>
      current.some((c) => c.menuItemId === item.id)
        ? current
        : [...current, { menuItemId: item.id, name: item.name, quantity: 1 }],
    );
  };

  const setQuantity = (menuItemId: string, quantity: number) => {
    setComponents((current) =>
      current.map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: Math.max(1, quantity) } : c)),
    );
  };

  const removeComponent = (menuItemId: string) => {
    setComponents((current) => current.filter((c) => c.menuItemId !== menuItemId));
  };

  const submit = () => {
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError('Nomini kiriting');
    if (components.length === 0) return setFormError('Kamida bitta mahsulot qo\'shing');
    onSave({
      name: trimmedName,
      components: components.map((c) => ({ menuItemId: c.menuItemId, quantity: c.quantity })),
    });
  };

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">Yangi kombo</div>}
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
            {submitting ? 'Saqlanmoqda…' : 'YARATISH'}
          </Button>
        </Seam>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          <Field>
            <FieldLabel>Nomi</FieldLabel>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
          </Field>

          <Field>
            <FieldLabel>Mahsulot qo'shish</FieldLabel>
            <div className="mt-1.5">
              <PickerStrip
                options={items}
                activeId={null}
                disabledIds={new Set(components.map((c) => c.menuItemId))}
                onPick={addComponent}
              />
            </div>
          </Field>

          <div className="bg-field-raised px-pad py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Tarkibi
          </div>

          {components.length === 0 ? (
            <div className="bg-field px-pad py-2 text-[13px] text-muted-foreground">
              Hozircha mahsulot qo'shilmagan
            </div>
          ) : (
            components.map((component) => (
              <Row key={component.menuItemId} columns="1fr 72px 48px">
                <span className="min-w-0 truncate">{component.name}</span>
                <Input
                  type="number"
                  numeric
                  min={1}
                  value={String(component.quantity)}
                  onChange={(e) => setQuantity(component.menuItemId, Number(e.target.value) || 1)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeComponent(component.menuItemId)}
                  aria-label="O'chirish"
                >
                  <X />
                </Button>
              </Row>
            ))
          )}
        </Seam>
      </div>
    </Panel>
  );
}
