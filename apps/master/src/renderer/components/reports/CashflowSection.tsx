import { Wallet } from 'lucide-react';
import type { DailyReport } from '@/api/reports';
import { formatMoney } from '@/lib/format';
import { Row, Section, toneClass } from './report-helpers';
import { cn } from '@/lib/utils';

export function CashflowSection({ report }: { report: DailyReport }) {
  const moneyIn =
    BigInt(report.cashflow.orderCash || '0') +
    BigInt(report.cashflow.orderCard || '0') +
    BigInt(report.cashflow.debtRepaymentsCash || '0') +
    BigInt(report.cashflow.debtRepaymentsCard || '0');
  const moneyOut = BigInt(report.expenses.net || '0');
  const drawerDelta = moneyIn - moneyOut;
  const drawerTone = drawerDelta > 0n ? 'good' : drawerDelta < 0n ? 'danger' : 'neutral';

  return (
    <Section title="Pul oqimi">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Kirim
          </div>
          <Row label="Naqd (buyurtmalardan)" value={formatMoney(report.cashflow.orderCash)} />
          <Row label="Karta (buyurtmalardan)" value={formatMoney(report.cashflow.orderCard)} />
          <Row
            label="Qarz qaytimi (naqd)"
            value={formatMoney(report.cashflow.debtRepaymentsCash)}
            tone={Number(report.cashflow.debtRepaymentsCash) > 0 ? 'good' : 'muted'}
          />
          <Row
            label="Qarz qaytimi (karta)"
            value={formatMoney(report.cashflow.debtRepaymentsCard)}
            tone={Number(report.cashflow.debtRepaymentsCard) > 0 ? 'good' : 'muted'}
          />
          <Row
            label="Jami kelgan pul"
            value={formatMoney(report.cashflow.realCashIn)}
            bold
          />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Chiqim
          </div>
          <Row label="Kiritilgan chiqim" value={formatMoney(report.checks.expenses.recordedExpense)} />
          <Row
            label="Bekor qilingan"
            value={formatMoney(report.checks.expenses.reversalAmount)}
            tone={Number(report.checks.expenses.reversalAmount) > 0 ? 'warning' : 'muted'}
          />
          <Row label="Jami ketgan pul" value={formatMoney(report.expenses.net)} bold />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-medium">
          <Wallet className="h-3.5 w-3.5" />
          Kassa o&apos;zgarishi
        </div>
        <div className={cn('text-lg font-semibold tabular-nums', toneClass(drawerTone))}>
          {drawerDelta >= 0n ? '+' : '-'}
          {formatMoney((drawerDelta < 0n ? -drawerDelta : drawerDelta).toString())}
        </div>
      </div>
    </Section>
  );
}
