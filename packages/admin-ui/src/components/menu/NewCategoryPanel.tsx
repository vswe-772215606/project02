import { useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function NewCategoryPanel({
  submitting,
  error,
  onCancel,
  onSave,
}: {
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">Yangi kategoriya</div>}
      foot={
        <Seam>
          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
          <div className="flex gap-seam bg-field px-pad py-2.5">
            <Button variant="secondary" className="flex-1" disabled={submitting} onClick={onCancel}>
              Bekor qilish
            </Button>
          </div>
          <Button
            size="action"
            className="w-full"
            disabled={!name.trim() || submitting}
            onClick={() => onSave(name.trim())}
          >
            {submitting ? 'Saqlanmoqda…' : 'QO\'SHISH'}
          </Button>
        </Seam>
      }
    >
      <Seam className="content-start">
        <Field>
          <FieldLabel>Nomi</FieldLabel>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" />
        </Field>
      </Seam>
    </Panel>
  );
}
