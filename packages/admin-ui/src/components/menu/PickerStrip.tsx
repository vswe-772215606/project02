import { Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';

type PickerOption = { id: string; name: string };

/**
 * A horizontally-scrolling strip of named options — category or menu item.
 * Stands in for a `<select>`: no native dropdown exists in this system, and a
 * scrollable strip of real 48px buttons is a better touch target than a
 * cramped popover menu anyway.
 */
export function PickerStrip<T extends PickerOption>({
  options,
  activeId,
  onPick,
  disabledIds,
}: {
  options: T[];
  activeId: string | null;
  onPick: (option: T) => void;
  disabledIds?: Set<string>;
}) {
  return (
    <div className="overflow-x-auto bg-seam">
      <Seam direction="row" className="w-max">
        {options.map((option) => (
          <Button
            key={option.id}
            size="sm"
            variant={option.id === activeId ? 'default' : 'secondary'}
            disabled={disabledIds?.has(option.id)}
            className="shrink-0"
            onClick={() => onPick(option)}
          >
            {option.name}
          </Button>
        ))}
      </Seam>
    </div>
  );
}
