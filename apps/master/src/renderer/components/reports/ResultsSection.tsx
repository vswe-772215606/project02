import { TrendingDown, TrendingUp } from 'lucide-react';
import type { DailyReport } from '@/api/reports';
import { formatMoney } from '@/lib/format';
import { Row, Section } from './report-helpers';
import { cn } from '@/lib/utils';

type ProfitProps = {
  label: string;
  value: string;
  hint: string;
};

function ProfitHeadline({ label, value, hint, prominent }: ProfitProps & { prominent?: boolean }) {
  const n = Number(value);
  const isProfit = n > 0;
  const isLoss = n < 0;
  const Icon = isLoss ? TrendingDown : TrendingUp;

  return (
    <div
      className={cn(
        'rounded-lg border p-5 flex flex-col gap-1',
        isProfit && 'border-success/40 bg-success/5',
        isLoss && 'border-destructive/40 bg-destructive/5',
        !isProfit && !isLoss && 'border-border bg-muted/40',
      )}
      data-print-keep
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
          {label}
        </div>
        <Icon
          className={cn(
            'h-5 w-5',
            isProfit && 'text-success',
            isLoss && 'text-destructive',
            !isProfit && !isLoss && 'text-muted-foreground',
          )}
          strokeWidth={2}
        />
      </div>
      <div
        className={cn(
          'tabular-nums font-bold leading-tight',
          prominent ? 'text-4xl xl:text-5xl' : 'text-3xl',
          isProfit && 'text-success',
          isLoss && 'text-destructive',
        )}
      >
        {formatMoney(value)}
      </div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

export function ResultsSection({ report }: { report: DailyReport }) {
  const salesProfit = Number(report.results.salesBasedProfit);

  const salesTone = salesProfit > 0 ? 'good' : salesProfit < 0 ? 'danger' : 'neutral';

  const paymentDiff = Number(report.checks.salesVsPayments.difference);

  return (
    <Section title="Sof natija" description="Bugungi kun bo'yicha foyda va pul oqimi natijasi.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ProfitHeadline
          label="Sof foyda (savdo)"
          value={report.results.salesBasedProfit}
          hint="Sof savdo − netto chiqim"
          prominent
        />
        <ProfitHeadline
          label="Pul oqimi natijasi"
          value={report.results.cashflowBasedNet}
          hint="Real tushum − netto chiqim"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Foyda hisobi
          </div>
          <Row label="Sof savdo" value={formatMoney(report.sales.netSales)} />
          <Row label="Netto chiqim" value={`-${formatMoney(report.expenses.net)}`} tone="muted" />
          <Row label="Sof foyda" value={formatMoney(report.results.salesBasedProfit)} bold tone={salesTone} />
          <Row label="Xizmat haqi (alohida)" value={formatMoney(report.sales.serviceCharge)} tone="muted" />
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            To'lov tekshiruvi
          </div>
          <Row label="Yakuniy chek summasi" value={formatMoney(report.checks.salesVsPayments.billedTotal)} />
          <Row label="To'lovlar yig'indisi" value={formatMoney(report.checks.salesVsPayments.paymentTotal)} />
          <Row
            label="Farq"
            value={formatMoney(report.checks.salesVsPayments.difference)}
            bold
            tone={paymentDiff === 0 ? 'good' : 'danger'}
          />
        </div>
      </div>
    </Section>
  );
}
