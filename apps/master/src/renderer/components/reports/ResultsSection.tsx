import { TrendingDown, TrendingUp } from 'lucide-react';
import type { DailyReport } from '@/api/reports';
import { formatMoney } from '@/lib/format';
import { Row, Section, StatTile } from './report-helpers';

export function ResultsSection({ report }: { report: DailyReport }) {
  const salesProfit = Number(report.results.salesBasedProfit);
  const cashflowNet = Number(report.results.cashflowBasedNet);

  const salesTone = salesProfit > 0 ? 'good' : salesProfit < 0 ? 'danger' : 'neutral';
  const cashTone = cashflowNet > 0 ? 'good' : cashflowNet < 0 ? 'danger' : 'neutral';

  const paymentDiff = Number(report.checks.salesVsPayments.difference);

  return (
    <Section title="Sof natija" description="Bugungi kun bo'yicha foyda va pul oqimi natijasi.">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StatTile
          label="Sof foyda (savdo)"
          value={formatMoney(report.results.salesBasedProfit)}
          hint="Sof savdo − netto chiqim"
          icon={salesProfit >= 0 ? TrendingUp : TrendingDown}
          tone={salesTone}
          size="lg"
        />
        <StatTile
          label="Pul oqimi natijasi"
          value={formatMoney(report.results.cashflowBasedNet)}
          hint="Real tushum − netto chiqim"
          icon={cashflowNet >= 0 ? TrendingUp : TrendingDown}
          tone={cashTone}
          size="lg"
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
