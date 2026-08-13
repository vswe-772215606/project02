import { Panel } from '@/components/layout/Screen';
import { Row, Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import type { Combo } from '@/api/menu';

/**
 * The combo in hand. Components are fixed at creation — there is no route to
 * edit them after the fact, only to activate/deactivate the combo itself, so
 * the panel only ever needs to show the list, never edit it.
 */
export function ComboPanel({
  combo,
  onToggleActive,
  submitting,
  error,
}: {
  combo: Combo;
  onToggleActive: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <Panel
      head={
        <>
          <div className="text-[15px] font-semibold">{combo.name}</div>
          <div className="text-[13px] text-muted-foreground">
            {combo.components.length} ta tarkib
            {!combo.isActive ? ' · Nofaol' : ''}
          </div>
        </>
      }
      foot={
        <Seam>
          {error ? <div className="bg-owed px-pad py-2 text-[13px] text-owed-foreground">{error}</div> : null}
          <div className="flex items-center gap-seam bg-field px-pad py-2.5">
            <Button variant="destructive" disabled={submitting} onClick={onToggleActive}>
              {combo.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
            </Button>
          </div>
        </Seam>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Seam className="content-start">
          {combo.components.map((component) => (
            <Row key={component.id} columns="1fr 60px">
              <span className="min-w-0 truncate">{component.menuItem?.name ?? 'Noma\'lum'}</span>
              <span className="text-right text-[15px] font-semibold tabular-nums">×{component.quantity}</span>
            </Row>
          ))}
        </Seam>
      </div>
    </Panel>
  );
}
