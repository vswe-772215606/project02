import { Wallet } from 'lucide-react';
import type { DailyReport } from '@/api/reports';
import { FieldLabel } from '@/components/blocks';
import { formatMoney } from '@/lib/format';
import { Row, Section, toneClass } from './report-helpers';
import { cn } from '@/lib/utils';

export function CashflowSection({ report }: { report: DailyReport }) {
  // Canonical drawer movement = realCashIn − cashOut (cashOut excludes cross-day
  // reversals). Using report.expenses.net (gross − ALL reversals) here was the
  // bug that inflated the drawer. See docs/MOLIYA_KASSA_HISOBLASH_XATOSI.md.
  const drawerDelta = BigInt(report.results.cashflowBasedNet || '0');
  const drawerTone = drawerDelta > 0n ? 'good' : drawerDelta < 0n ? 'danger' : 'neutral';

  return (
    <Section title="Pul oqimi">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
        <div>
          <FieldLabel className="mb-1">Kirim</FieldLabel>
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
          {Number(report.cashflow.expenseReturns) > 0 && (
            <Row
              label="Avans qaytimi"
              value={formatMoney(report.cashflow.expenseReturns)}
              tone="good"
            />
          )}
          <Row
            label="Jami kelgan pul"
            value={formatMoney(report.cashflow.realCashIn)}
            bold
          />
        </div>
        <div>
          <FieldLabel className="mb-1">Chiqim</FieldLabel>
          <Row label="Kiritilgan chiqim" value={formatMoney(report.checks.expenses.recordedExpense)} />
          <Row
            label="Bekor qilingan (shu kun)"
            value={formatMoney(report.checks.expenses.sameDayReversalAmount)}
            tone={Number(report.checks.expenses.sameDayReversalAmount) > 0 ? 'warning' : 'muted'}
            hint="Faqat shu kuni kiritilib, shu kuni bekor qilingan chiqimlar kassadan ayriladi"
          />
          <Row label="Jami ketgan pul" value={formatMoney(report.cashflow.cashOut)} bold />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between bg-field-raised px-4 py-3">
        <FieldLabel className="flex items-center gap-2">
          <Wallet className="h-3.5 w-3.5" />
          Kassa o&apos;zgarishi
        </FieldLabel>
        <div className={cn('text-lg font-semibold tabular-nums', toneClass(drawerTone))}>
          {drawerDelta >= 0n ? '+' : '-'}
          {formatMoney((drawerDelta < 0n ? -drawerDelta : drawerDelta).toString())}
        </div>
      </div>
    </Section>
  );
}
