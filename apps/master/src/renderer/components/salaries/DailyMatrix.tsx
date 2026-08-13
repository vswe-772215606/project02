import { useState } from 'react';

import type { ServiceChargeMatrix } from '@/api/finance';
import { Seam } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const UZ_WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'] as const;
const UZ_MONTH_SHORT = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn',
  'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
] as const;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Same zero-as-dash convention as the summary table — kept verbatim. */
function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

/**
 * Kunlik taqsimot — the known problem screen (UI/UX audit §5): rows are
 * waiters, columns are every day in the range, and a month-wide range computes
 * to roughly 1300–1600px of table on a device with no mouse wheel to
 * drag-scroll it.
 *
 * This is deliberately NOT a redesign. Per the brief: keep the matrix
 * mechanics (native table, sticky first/last columns, drag-scroll), only
 * raise the type past the touch floors and default it closed so the summary
 * table loads first. Whether this should become a per-week matrix instead of
 * per-day — collapsing ~30 columns to ~4–5 — is an open product question,
 * not something to decide inside a layout pass. Left for a PRD decision;
 * see docs/PRD_FOUNDATION.md §7 for where that kind of open question gets
 * tracked.
 */
export function DailyMatrix({
  matrix,
  isLoading,
}: {
  matrix: ServiceChargeMatrix | undefined;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const todayIso = isoDate(new Date());
  const dayHeaders = (matrix?.dayLabels ?? []).map((d) => ({
    ...d,
    weekdayLabel: UZ_WEEKDAY_SHORT[d.weekday] ?? '',
    isWeekend: d.weekday === 0 || d.weekday === 6,
    isToday: d.key === todayIso,
  }));

  return (
    <Seam className="content-start">
      <div className="flex items-center justify-between gap-3 bg-field-raised px-pad py-2.5">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
            Kunlik taqsimot
          </div>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            Qatorlar — ofitsiantlar, ustunlar — tanlangan davrdagi har bir kun
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Yashirish' : `Ko'rsatish${matrix ? ` (${matrix.days} kun)` : ''}`}
        </Button>
      </div>

      {!expanded ? null : isLoading && !matrix ? (
        <div className="bg-field px-pad py-10 text-center text-[14px] text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : !matrix || matrix.waiters.length === 0 ? (
        <div className="bg-field px-pad py-10 text-center text-[14px] text-muted-foreground">
          Bu davrda yopilgan buyurtmalar topilmadi
        </div>
      ) : (
        <div className="overflow-x-auto bg-field">
          <table className="border-collapse tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[170px] border-b border-border/60 bg-field-raised px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Ofitsiant
                </th>
                {dayHeaders.map((h) => (
                  <th
                    key={h.key}
                    className={cn(
                      'min-w-[96px] border-b border-l border-border/60 px-2 py-2 text-center font-semibold',
                      h.isWeekend && 'bg-muted/60 text-muted-foreground',
                      h.isToday && 'bg-live/25 text-foreground',
                      h.isMonthStart && 'border-l-foreground/30',
                    )}
                    title={`${h.day}.${String(h.month).padStart(2, '0')}`}
                  >
                    <div className="text-[12px] uppercase leading-tight tracking-wider opacity-70">
                      {h.weekdayLabel}
                    </div>
                    <div className="text-[14px] font-semibold leading-tight tabular-nums">{h.day}</div>
                    {h.isMonthStart && (
                      <div className="text-[12px] uppercase leading-tight opacity-70">
                        {UZ_MONTH_SHORT[h.month - 1]}
                      </div>
                    )}
                  </th>
                ))}
                <th className="sticky right-0 z-10 min-w-[150px] border-b border-l border-border/60 bg-field-raised px-3 py-2 text-right text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Jami
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.waiters.map((row) => (
                <tr key={row.waiterId}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-border/40 bg-field px-3 py-2 text-[14px] font-semibold">
                    {row.waiterName}
                  </td>
                  {row.daily.map((value, idx) => {
                    const header = dayHeaders[idx];
                    const num = Number(value);
                    return (
                      <td
                        key={idx}
                        className={cn(
                          'border-b border-l border-border/40 px-2 py-2 text-right text-[17px] font-semibold leading-tight tabular-nums',
                          header?.isWeekend && 'bg-muted/20',
                          header?.isToday && 'bg-live/10',
                          header?.isMonthStart && 'border-l-foreground/30',
                          num === 0 && 'font-normal text-muted-foreground/50',
                        )}
                        title={num > 0 && header ? `${header.day}.${String(header.month).padStart(2, '0')}: ${fmtMoney(value)} UZS` : undefined}
                      >
                        {fmtMoney(value)}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 whitespace-nowrap border-b border-l border-border/40 bg-field px-3 py-2 text-right text-[17px] font-semibold tabular-nums">
                    {fmtMoney(row.total)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="sticky left-0 z-10 border-t border-border/60 bg-field-raised px-3 py-2.5 text-[14px] font-semibold uppercase tracking-[0.05em]">
                  Jami
                </td>
                {matrix.dayTotals.map((value, idx) => {
                  const header = dayHeaders[idx];
                  const num = Number(value);
                  return (
                    <td
                      key={idx}
                      className={cn(
                        'border-t border-l border-border/60 px-2 py-2.5 text-right text-[17px] font-semibold leading-tight tabular-nums',
                        header?.isWeekend && 'bg-muted/60',
                        header?.isToday && 'bg-live/25',
                        header?.isMonthStart && 'border-l-foreground/30',
                        num === 0 && 'font-normal text-muted-foreground/60',
                      )}
                    >
                      {fmtMoney(value)}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 whitespace-nowrap border-t border-l border-border/60 bg-field-raised px-3 py-2.5 text-right text-[17px] font-semibold tabular-nums">
                  {fmtMoney(matrix.grandTotal)} <span className="text-[13px] font-normal">UZS</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Seam>
  );
}
