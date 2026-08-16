import { useState } from 'react';

import { Panel } from '@/components/layout/Screen';
import { Field, FieldLabel, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Table as TableModel } from '@/api/tables';
import type { TableEditPayload } from './TablePanel';

export function NewTablePanel({
  submitting,
  error,
  onCancel,
  onSave,
}: {
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (data: TableEditPayload) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TableModel['type']>('TABLE');

  return (
    <Panel
      head={<div className="text-[15px] font-semibold">Yangi stol</div>}
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
            onClick={() => onSave({ name: name.trim(), type })}
          >
            {submitting ? 'Saqlanmoqda…' : 'QO\'SHISH'}
          </Button>
        </Seam>
      }
    >
      <Seam className="content-start">
        <Field>
          <FieldLabel>Nomi</FieldLabel>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stol 1"
            className="mt-1.5"
          />
        </Field>
        <Seam direction="row" columns="1fr 1fr">
          <Button variant={type === 'TABLE' ? 'default' : 'secondary'} onClick={() => setType('TABLE')}>
            Stol
          </Button>
          <Button variant={type === 'ROOM' ? 'default' : 'secondary'} onClick={() => setType('ROOM')}>
            Xona
          </Button>
        </Seam>
      </Seam>
    </Panel>
  );
}
