import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financeApi, type ServiceChargeMatrix } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Uzbek weekday short letters indexed by Date.getDay() (0=Sun..6=Sat)
const UZ_WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'] as const;

function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

export function SalariesPage() {
  usePageTitle('Xodimlar maoshi');
  const [month, setMonth] = useState(currentMonthKey);

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['finance', 'service-charge', month],
    queryFn: () => financeApi.serviceChargeMatrix(month),
    refetchInterval: 60_000,
  });

  return (
    <PageContent>
      <PageHeader
        title="Xodimlar maoshi"
        description="Yopilgan buyurtmalardan ofitsiantlar olgan xizmat haqi — har kun bo'yicha"
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="salary-month" className="text-xs text-muted-foreground">Oy:</Label>
            <Input
              id="salary-month"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value || currentMonthKey())}
              className="w-40 h-9"
            />
          </div>
        }
      />

      <ServiceChargeMatrixCard month={month} matrix={matrix} isLoading={isLoading} />
    </PageContent>
  );
}

function ServiceChargeMatrixCard({
  month,
  matrix,
  isLoading,
}: {
  month: string;
  matrix: ServiceChargeMatrix | undefined;
  isLoading: boolean;
}) {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIdx = Number(monthStr); // 1..12
  const days = matrix?.days ?? new Date(year, monthIdx, 0).getDate();

  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === monthIdx;
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  const dayHeaders = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const weekday = new Date(year, monthIdx - 1, day).getDay();
    return {
      day,
      weekdayLabel: UZ_WEEKDAY_SHORT[weekday] ?? '',
      isWeekend: weekday === 0 || weekday === 6,
      isToday: day === todayDay,
    };
  });

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Oylik xizmat haqi taqsimoti</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Qatorlar — ofitsiantlar, ustunlar — oydagi kunlar
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && !matrix ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Yuklanmoqda...</div>
        ) : !matrix || matrix.waiters.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Bu oyda yopilgan buyurtmalar topilmadi
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="text-xs tabular-nums border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 bg-muted/40 text-left font-semibold px-3 py-2 border-b border-border/60 min-w-[160px]">
                    Ofitsiant
                  </th>
                  {dayHeaders.map((h) => (
                    <th
                      key={h.day}
                      className={cn(
                        'text-center font-semibold px-1.5 py-1 border-b border-l border-border/60 min-w-[42px]',
                        h.isWeekend && 'bg-muted/60 text-muted-foreground',
                        h.isToday && 'bg-amber-100 text-amber-900',
                      )}
                    >
                      <div className="text-[9px] uppercase tracking-wider opacity-70 leading-tight">
                        {h.weekdayLabel}
                      </div>
                      <div className="text-[11px] leading-tight">{h.day}</div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-muted/60 text-right font-semibold px-3 py-2 border-b border-l border-border/60 min-w-[110px]">
                    Jami
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrix.waiters.map((row) => (
                  <tr key={row.waiterId} className="hover:bg-muted/30">
                    <td className="sticky left-0 z-10 bg-background hover:bg-muted/30 font-medium px-3 py-1.5 border-b border-border/40 whitespace-nowrap">
                      {row.waiterName}
                    </td>
                    {row.daily.map((value, idx) => {
                      const header = dayHeaders[idx];
                      const num = Number(value);
                      return (
                        <td
                          key={idx}
                          className={cn(
                            'text-right px-1.5 py-1.5 border-b border-l border-border/40 leading-tight',
                            header?.isWeekend && 'bg-muted/20',
                            header?.isToday && 'bg-amber-50',
                            num === 0 && 'text-muted-foreground/50',
                          )}
                          title={num > 0 ? `${header?.day}-kun: ${fmtMoney(value)} UZS` : undefined}
                        >
                          {fmtMoney(value)}
                        </td>
                      );
                    })}
                    <td className="sticky right-0 z-10 bg-background hover:bg-muted/30 text-right font-semibold px-3 py-1.5 border-b border-l border-border/40 whitespace-nowrap">
                      {fmtMoney(row.total)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/50 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/50 px-3 py-2 border-t border-border/60">
                    Jami
                  </td>
                  {matrix.dayTotals.map((value, idx) => {
                    const header = dayHeaders[idx];
                    const num = Number(value);
                    return (
                      <td
                        key={idx}
                        className={cn(
                          'text-right px-1.5 py-2 border-t border-l border-border/60 leading-tight',
                          header?.isWeekend && 'bg-muted/60',
                          header?.isToday && 'bg-amber-100',
                          num === 0 && 'text-muted-foreground/60',
                        )}
                      >
                        {fmtMoney(value)}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-muted/60 text-right px-3 py-2 border-t border-l border-border/60 whitespace-nowrap">
                    {fmtMoney(matrix.grandTotal)} UZS
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
