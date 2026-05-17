import { Receipt, ShoppingBag, Banknote, HandCoins, Sparkles } from 'lucide-react';
import type { DailyReport } from '@/api/reports';
import { formatMoney } from '@/lib/format';
import { StatTile } from './report-helpers';

export function SalesSummary({ report }: { report: DailyReport }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Yopilgan buyurtmalar"
        value={report.sales.closedOrders}
        hint={
          report.sales.canceledOrders + report.sales.walkoutOrders > 0
            ? `${report.sales.canceledOrders} bekor · ${report.sales.walkoutOrders} to'lamagan`
            : 'Bekor yoki to\'lamagan yo\'q'
        }
        icon={ShoppingBag}
      />
      <StatTile
        label="Brutto savdo"
        value={formatMoney(report.sales.grossSales)}
        hint={`Chegirma: ${formatMoney(report.sales.discounts)}`}
        icon={Receipt}
      />
      <StatTile
        label="Sof savdo"
        value={formatMoney(report.sales.netSales)}
        hint="Taom savdosi (xizmat haqisiz)"
        icon={Banknote}
      />
      <StatTile
        label="Xizmat haqi"
        value={formatMoney(report.sales.serviceCharge)}
        hint="Ofitsiantlar uchun (kishi boshi)"
        icon={Sparkles}
        tone={Number(report.sales.serviceCharge) > 0 ? 'good' : 'neutral'}
      />
      <StatTile
        label="Qarzga sotildi"
        value={formatMoney(report.sales.debtSales)}
        hint={`Yakuniy chek: ${formatMoney(report.checks.salesVsPayments.billedTotal)}`}
        icon={HandCoins}
        tone={Number(report.sales.debtSales) > 0 ? 'warning' : 'neutral'}
      />
    </div>
  );
}
