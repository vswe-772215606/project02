import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';

import { Field } from '@/components/blocks';

type SettingFieldProps = {
  label: string;
  description: string;
  /** Shows a lock glyph beside the label — the word "O'quvchi" role never sees this control unlocked. */
  readonly?: boolean;
  children: ReactNode;
};

/** One setting: label and description on the left, the control on the right. */
export function SettingField({ label, description, readonly, children }: SettingFieldProps) {
  return (
    <Field className="grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,300px)_1fr]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[14.5px] font-semibold">{label}</div>
          {readonly ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
        </div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Field>
  );
}
