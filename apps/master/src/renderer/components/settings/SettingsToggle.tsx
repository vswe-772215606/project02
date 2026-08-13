import { Button } from '@/components/ui/button';

type SettingsToggleProps = {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
};

/**
 * An on/off setting built from two Buttons rather than a bespoke switch —
 * Blocks C1 has no switch primitive yet, and a two-state button pair already
 * satisfies "colour is never alone": the word (`Yoqilgan` / `O'chirilgan`) is
 * on the control itself, not implied by a thumb position.
 */
export function SettingsToggle({
  value,
  onChange,
  disabled = false,
  onLabel = 'Yoqilgan',
  offLabel = "O'chirilgan",
}: SettingsToggleProps) {
  return (
    <div className="flex gap-seam">
      <Button
        type="button"
        variant={value ? 'default' : 'secondary'}
        disabled={disabled}
        onClick={() => onChange(true)}
        className="flex-1"
        aria-pressed={value}
      >
        {onLabel}
      </Button>
      <Button
        type="button"
        variant={!value ? 'default' : 'secondary'}
        disabled={disabled}
        onClick={() => onChange(false)}
        className="flex-1"
        aria-pressed={!value}
      >
        {offLabel}
      </Button>
    </div>
  );
}
