import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financeApi, type ServiceChargeMatrix } from '@/api/finance';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Uzbek weekday short letters indexed by Date.getDay() (0=Sun..6=Sat)
const UZ_WEEKDAY_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'] as const;
const UZ_MONTH_SHORT = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn',
  'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
] as const;

function fmtMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('uz-UZ').replace(/,/g, ' ');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function shortcut(name: 'today' | 'this-week' | 'this-month' | 'last-month' | 'last-30'): { from: string; to: string } {
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

export function SalariesPage() {
  usePageTitle('Xodimlar maoshi');
  const [range, setRange] = useState(() => shortcut('this-month'));

  const { data: matrix, isLoading } = useQuery({
    queryKey: ['finance', 'service-charge', range.from, range.to],
    queryFn: () => financeApi.serviceChargeMatrix({ from: range.from, to: range.to }),
    refetchInterval: 60_000,
  });

  return (
    <PageContent>
      <PageHeader
        title="Xodimlar maoshi"
        description="Yopilgan buyurtmalardagi xizmat haqi menyu mahsulotlari (SERVICE) bo'yicha ofitsiantlar daromadi"
      />

      <Card>
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="salary-from" className="text-xs text-muted-foreground">Boshlanish</Label>
              <Input
                id="salary-from"
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value || r.from }))}
                className="w-44 h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="salary-to" className="text-xs text-muted-foreground">Tugash</Label>
              <Input
                id="salary-to"
                type="date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value || r.to }))}
                className="w-44 h-9"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="outline" onClick={() => setRange(shortcut('today'))}>Bugun</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(shortcut('this-week'))}>Shu hafta</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(shortcut('this-month'))}>Shu oy</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(shortcut('last-month'))}>O'tgan oy</Button>
              <Button size="sm" variant="outline" onClick={() => setRange(shortcut('last-30'))}>Oxirgi 30 kun</Button>
            </div>
          </div>
          {matrix && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>Kunlar: <span className="font-medium text-foreground tabular-nums">{matrix.days}</span></span>
              <span>Ofitsiantlar: <span className="font-medium text-foreground tabular-nums">{matrix.waiters.length}</span></span>
              <span>Jami buyurtmalar: <span className="font-medium text-foreground tabular-nums">{matrix.waiters.reduce((s, w) => s + w.orderCount, 0)}</span></span>
              <span>Jami xizmat haqi: <span className="font-medium text-foreground tabular-nums">{fmtMoney(matrix.grandTotal)} UZS</span></span>
            </div>
          )}
        </CardHeader>
      </Card>

      <SummaryCard matrix={matrix} />
      <ServiceChargeMatrixCard matrix={matrix} isLoading={isLoading} />
    </PageContent>
  );
}

function SummaryCard({ matrix }: { matrix: ServiceChargeMatrix | undefined }) {
  if (!matrix || matrix.waiters.length === 0) return null;

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Ofitsiantlar bo'yicha jami</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tanlangan davrda har bir ofitsiantning umumiy xizmat haqi va buyurtmalar soni
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-semibold px-3 py-2 border-b border-border/60">Ofitsiant</th>
                <th className="text-right font-semibold px-3 py-2 border-b border-border/60">Buyurtmalar</th>
                <th className="text-right font-semibold px-3 py-2 border-b border-border/60">O'rtacha (1 buyurtma)</th>
                <th className="text-right font-semibold px-3 py-2 border-b border-border/60">Jami xizmat haqi</th>
              </tr>
            </thead>
            <tbody>
              {matrix.waiters.map((row) => {
                const total = Number(row.total);
                const avg = row.orderCount > 0 ? total / row.orderCount : 0;
                return (
                  <tr key={row.waiterId} className="hover:bg-muted/30">
                    <td className="px-3 py-2 border-b border-border/40 font-medium whitespace-nowrap">{row.waiterName}</td>
                    <td className="px-3 py-2 border-b border-border/40 text-right tabular-nums">{row.orderCount}</td>
                    <td className="px-3 py-2 border-b border-border/40 text-right tabular-nums text-muted-foreground">{fmtMoney(avg)}</td>
                    <td className="px-3 py-2 border-b border-border/40 text-right font-semibold tabular-nums">{fmtMoney(row.total)} <span className="text-muted-foreground font-normal">UZS</span></td>
                  </tr>
                );
              })}
              <tr className="bg-muted/50 font-semibold">
                <td className="px-3 py-2 border-t border-border/60">Jami</td>
                <td className="px-3 py-2 border-t border-border/60 text-right tabular-nums">{matrix.waiters.reduce((s, w) => s + w.orderCount, 0)}</td>
                <td className="px-3 py-2 border-t border-border/60"></td>
                <td className="px-3 py-2 border-t border-border/60 text-right tabular-nums">{fmtMoney(matrix.grandTotal)} <span className="text-muted-foreground font-normal">UZS</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ServiceChargeMatrixCard({
  matrix,
  isLoading,
}: {
  matrix: ServiceChargeMatrix | undefined;
  isLoading: boolean;
}) {
  const todayIso = isoDate(new Date());
  const dayHeaders = (matrix?.dayLabels ?? []).map((d) => ({
    ...d,
    weekdayLabel: UZ_WEEKDAY_SHORT[d.weekday] ?? '',
    isWeekend: d.weekday === 0 || d.weekday === 6,
    isToday: d.key === todayIso,
  }));

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Kunlik taqsimot</CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Qatorlar — ofitsiantlar, ustunlar — tanlangan davrdagi har bir kun
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && !matrix ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Yuklanmoqda...</div>
        ) : !matrix || matrix.waiters.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Bu davrda yopilgan buyurtmalar topilmadi
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
                      key={h.key}
                      className={cn(
                        'text-center font-semibold px-1.5 py-1 border-b border-l border-border/60 min-w-[44px]',
                        h.isWeekend && 'bg-muted/60 text-muted-foreground',
                        h.isToday && 'bg-amber-100 text-amber-900',
                        h.isMonthStart && 'border-l-foreground/30',
                      )}
                      title={`${h.day}.${String(h.month).padStart(2, '0')}`}
                    >
                      <div className="text-[9px] uppercase tracking-wider opacity-70 leading-tight">
                        {h.weekdayLabel}
                      </div>
                      <div className="text-[11px] leading-tight font-semibold">{h.day}</div>
                      {h.isMonthStart && (
                        <div className="text-[8px] leading-tight opacity-70">{UZ_MONTH_SHORT[h.month - 1]}</div>
                      )}
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
                            header?.isMonthStart && 'border-l-foreground/30',
                            num === 0 && 'text-muted-foreground/50',
                          )}
                          title={num > 0 && header ? `${header.day}.${String(header.month).padStart(2, '0')}: ${fmtMoney(value)} UZS` : undefined}
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
                          header?.isMonthStart && 'border-l-foreground/30',
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
