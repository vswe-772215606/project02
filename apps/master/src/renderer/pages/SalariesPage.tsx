import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { financeApi } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Field } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WaiterSummaryTable } from '@/components/salaries/WaiterSummaryTable';
import { DailyMatrix } from '@/components/salaries/DailyMatrix';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type PresetKey = 'today' | 'this-week' | 'this-month' | 'last-month' | 'last-30';

function shortcut(name: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (name) {
    case 'today':
      return { from: isoDate(today), to: isoDate(today) };
    case 'this-week': {
      // Week starts Monday (Uzbek workweek)
      const dow = today.getDay(); // 0=Sun
      const diff = (dow + 6) % 7; // days since Monday
      const monday = new Date(today);
      monday.setDate(today.getDate() - diff);
      return { from: isoDate(monday), to: isoDate(today) };
    }
    case 'this-month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDate(start), to: isoDate(today) };
    }
    case 'last-month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: isoDate(start), to: isoDate(end) };
    }
    case 'last-30': {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      return { from: isoDate(start), to: isoDate(today) };
    }
  }
}

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Bugun' },
  { key: 'this-week', label: 'Shu hafta' },
  { key: 'this-month', label: 'Shu oy' },
  { key: 'last-month', label: "O'tgan oy" },
  { key: 'last-30', label: 'Oxirgi 30 kun' },
];

/** Same zero-as-dash convention as the tables below — kept verbatim. */
function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

/**
 * Xodimlar maoshi — rebuilt full-width on Blocks C1.
 *
 * The per-waiter summary is the primary content now; the day-by-day matrix
 * (the page's known layout problem — see `DailyMatrix`) sits collapsed
 * beneath it instead of loading open by default.
 */
export function SalariesPage() {
  usePageTitle('Xodimlar maoshi');
  const [range, setRange] = useState(() => shortcut('this-month'));

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['finance', 'service-charge', range.from, range.to],
    queryFn: () => financeApi.serviceChargeMatrix({ from: range.from, to: range.to }),
    refetchInterval: 60_000,
  });

  return (
    <Screen
      title="Xodimlar maoshi"
      status={
        <>
          {PRESETS.map((p) => {
            const preset = shortcut(p.key);
            const active = preset.from === range.from && preset.to === range.to;
            return (
              <Button
                key={p.key}
                size="sm"
                variant={active ? 'default' : 'secondary'}
                onClick={() => setRange(preset)}
              >
                {p.label}
              </Button>
            );
          })}
        </>
      }
    >
      <div className="flex flex-col gap-pad p-pad">
        <Field className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="salary-from"
              className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              Aniq davr
            </label>
            <Input
              id="salary-from"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || r.from }))}
              className="w-[168px]"
            />
            <span className="text-muted-foreground">—</span>
            <Input
              id="salary-to"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || r.to }))}
              className="w-[168px]"
            />
          </div>

          {matrix ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] text-muted-foreground">
              <span>
                Kunlar: <span className="font-semibold text-foreground tabular-nums">{matrix.days}</span>
              </span>
              <span>
                Ofitsiantlar:{' '}
                <span className="font-semibold text-foreground tabular-nums">{matrix.waiters.length}</span>
              </span>
              <span>
                Jami buyurtmalar:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {matrix.waiters.reduce((s, w) => s + w.orderCount, 0)}
                </span>
              </span>
              <span>
                Jami xizmat haqi:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {fmtMoney(matrix.grandTotal)} so'm
                </span>
              </span>
            </div>
          ) : null}
        </Field>

        <WaiterSummaryTable matrix={matrix} isLoading={isLoading} />

        <DailyMatrix matrix={matrix} isLoading={isLoading} />
      </div>
    </Screen>
  );
}
