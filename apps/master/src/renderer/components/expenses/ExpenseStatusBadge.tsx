import type { ExpenseItem, ExpenseRepayStatus } from '@/api/expenses';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const REPAY_LABEL: Record<ExpenseRepayStatus, string> = {
  NOT_REPAYABLE: '',
  PENDING: 'Kutilmoqda',
  PARTIAL: 'Qisman',
  RETURNED: 'Qaytarildi',
  WRITTEN_OFF: "Yo'qotildi",
};

const REPAY_TONE: Record<ExpenseRepayStatus, string> = {
  NOT_REPAYABLE: '',
  PENDING: 'bg-warning/15 text-warning border-warning/30',
  PARTIAL: 'bg-info/15 text-info border-info/30',
  RETURNED: 'bg-success/15 text-success border-success/30',
  WRITTEN_OFF: 'bg-destructive/15 text-destructive border-destructive/30',
};

const STATUS_LABEL: Record<ExpenseItem['status'], string> = {
  ACTIVE: 'Faol',
  REVERSED: 'Bekor qilingan',
  REVERSAL: 'Qaytarilish',
};

const STATUS_TONE: Record<ExpenseItem['status'], string> = {
  ACTIVE: 'bg-success/15 text-success border-success/30',
  REVERSED: 'bg-destructive/15 text-destructive border-destructive/30',
  REVERSAL: 'bg-muted text-muted-foreground border-border',
};

export function ExpenseStatusCell({ item }: { item: ExpenseItem }) {
  // Repayable items show the repay status as the primary indicator.
  if (item.repayable && item.repayStatus !== 'NOT_REPAYABLE') {
    return (
      <Badge
        variant="outline"
        className={cn('font-medium', REPAY_TONE[item.repayStatus])}
        title={item.repayStatus === 'WRITTEN_OFF' ? (item.writtenOffReason ?? '') : undefined}
      >
        {REPAY_LABEL[item.repayStatus]}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_TONE[item.status])}>
      {STATUS_LABEL[item.status]}
    </Badge>
  );
}
