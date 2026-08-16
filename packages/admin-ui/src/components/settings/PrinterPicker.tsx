import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type PrinterPickerProps = {
  value: string;
  printers: string[];
  isLoading: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
};

/**
 * Printer name entry: a dropdown when the system reports printers, a text
 * field when it doesn't or the operator asks to type one.
 *
 * A native `<select>` rather than the shadcn `Select` — that primitive is
 * not yet retargeted onto Blocks C1 (still a 36px bordered control, see
 * `docs/design/BLOCKS_C1.md` §7), and every control on this page has to
 * clear the touch floor.
 */
export function PrinterPicker({
  value,
  printers,
  isLoading,
  onChange,
  placeholder,
  disabled = false,
}: PrinterPickerProps) {
  const [manualMode, setManualMode] = useState(
    () => value !== '' && printers.length > 0 && !printers.includes(value),
  );

  const isInList = printers.includes(value);
  const showDropdown = printers.length > 0 && !manualMode;

  return (
    <div className="flex gap-seam">
      {showDropdown ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || isLoading}
          className={cn(
            'h-control flex-1 bg-field px-3 text-[15px] text-foreground focus-block',
            'disabled:cursor-not-allowed disabled:bg-field-raised disabled:text-muted-foreground',
          )}
        >
          <option value="">{isLoading ? 'Yuklanmoqda...' : placeholder}</option>
          {printers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'h-control flex-1 bg-field px-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-block',
            'disabled:cursor-not-allowed disabled:bg-field-raised disabled:text-muted-foreground',
          )}
        />
      )}

      {printers.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            setManualMode((m) => !m);
            if (!manualMode && !isInList) onChange('');
          }}
          title={manualMode ? "Ro'yxatdan tanlash" : "Qo'lda kiritish"}
        >
          {manualMode ? "Ro'yxat" : "Qo'lda"}
        </Button>
      )}
    </div>
  );
}
