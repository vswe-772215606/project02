import { useMemo } from 'react';
import type { DailyReport, MonthlyReport } from '@/api/reports';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Section } from './report-helpers';

const UZBEK_DAY_ABBR = ['Du', 'Se', 'Ch', 'Pe', 'Ju', 'Sh', 'Ya'];

function buildCalendarGrid(year: number, monthNum: number, daily: DailyReport[]) {
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const firstDow = new Date(year, monthNum - 1, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;

  const reportByDate = new Map(daily.map((r) => [r.date, r]));

  const cells: Array<{ day: number | null; report: DailyReport | null }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null, report: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, report: reportByDate.get(dateStr) ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, report: null });

  const rows: Array<typeof cells> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function MonthlyCalendar({
  report,
  title,
  description,
  onSelectDay,
}: {
  report: MonthlyReport;
  title: string;
  description?: string;
  onSelectDay: (day: DailyReport) => void;
}) {
  const parts = report.month.split('-').map(Number);
  const yearNum = parts[0] ?? new Date().getFullYear();
  const monthNum = parts[1] ?? new Date().getMonth() + 1;

  const calendarRows = useMemo(
    () => buildCalendarGrid(yearNum, monthNum, report.daily),
    [yearNum, monthNum, report.daily],
  );

  return (
    <Section title={title} description={description}>
      <div className="mb-2 grid grid-cols-7 gap-2">
        {UZBEK_DAY_ABBR.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {calendarRows.map((row, rowIdx) => (
          <div key={rowIdx} className="grid grid-cols-7 gap-2">
            {row.map((cell, cellIdx) => {
              if (!cell.day) {
                return <div key={cellIdx} className="h-20 rounded-md" />;
              }
              const hasActivity = !!cell.report
                && (cell.report.sales.closedOrders > 0 || Number(cell.report.cashflow.realCashIn) > 0);
              return (
                <button
                  key={cellIdx}
                  type="button"
                  disabled={!hasActivity}
                  onClick={() => cell.report && onSelectDay(cell.report)}
                  className={cn(
                    'h-20 w-full rounded-md border p-2 text-left transition-colors',
                    hasActivity
                      ? 'cursor-pointer border-border bg-card hover:bg-muted/60'
                      : 'cursor-default border-border/60 bg-muted/30',
                  )}
                >
                  <div
                    className={cn(
                      'text-sm font-semibold tabular-nums',
                      hasActivity ? 'text-foreground' : 'text-muted-foreground/60',
                    )}
                  >
                    {cell.day}
                  </div>
                  {hasActivity && cell.report ? (
                    <div className="mt-1 space-y-0.5">
                      <div className="text-[10px] text-muted-foreground">
                        {cell.report.sales.closedOrders} ta
                      </div>
                      <div className="truncate text-[11px] font-medium tabular-nums text-foreground">
                        {formatMoney(cell.report.cashflow.realCashIn)}
                      </div>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Section>
  );
}
