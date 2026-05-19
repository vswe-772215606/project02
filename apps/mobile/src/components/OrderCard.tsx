import { StyleSheet, Text, View } from 'react-native';
import { Order, STATUS_LABELS } from '../api/orders';
import { elapsed, formatUZS } from '../lib/format';
import { theme } from '../lib/theme';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

const STATUS_VARIANTS: Record<string, 'warning' | 'primary' | 'info' | 'slate'> = {
  DRAFT: 'warning',
  SENT: 'primary',
};

export function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const variant = STATUS_VARIANTS[order.status] || 'slate';

  const mealPreview = (() => {
    const names = activeLines.map((l) => l.nameSnapshot);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} … (+${names.length - 2})`;
  })();

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.table}>{tableLabel}</Text>
        <Text style={styles.time}>{elapsed(order.createdAt)}</Text>
      </View>

      {mealPreview ? (
        <Text style={styles.meals} numberOfLines={1}>{mealPreview}</Text>
      ) : (
        <Text style={styles.mealsEmpty}>Mahsulot yo'q</Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.amount}>{formatUZS(order.totalAmount)} so'm</Text>
        <Badge label={STATUS_LABELS[order.status]} variant={variant} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  table: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.slate[900],
  },
  time: {
    fontSize: 12,
    color: theme.colors.slate[500],
    fontVariant: ['tabular-nums'],
  },
  meals: {
    fontSize: 14,
    color: theme.colors.slate[700],
    marginBottom: theme.spacing.sm,
  },
  mealsEmpty: {
    fontSize: 14,
    color: theme.colors.slate[400],
    fontStyle: 'italic',
    marginBottom: theme.spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },
});
