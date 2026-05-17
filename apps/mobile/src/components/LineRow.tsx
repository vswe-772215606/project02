import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OrderLine } from '../api/orders';
import { formatUZS } from '../lib/format';
import { theme } from '../lib/theme';

type Props = {
  line: OrderLine;
  canEditNote: boolean;
  canCancelLine: boolean;
  onNote: () => void;
  onCancel: () => void;
};

export function LineRow({ line, canEditNote, canCancelLine, onNote, onCancel }: Props) {
  if (line.isCanceled) {
    return (
      <View style={[styles.row, styles.canceled]}>
        <Text style={styles.canceledText}>
          {line.name} × {line.quantity} — Bekor qilindi
        </Text>
      </View>
    );
  }

  const isService = line.menuItemKind === 'SERVICE';

  return (
    <TouchableOpacity
      style={[styles.row, isService && styles.serviceRow]}
      onPress={() => {
        Alert.alert(line.name, undefined, [
          {
            text: canEditNote ? 'Eslatma tahrirlash' : 'Eslatma (mumkin emas)',
            onPress: canEditNote ? onNote : undefined,
          },
          {
            text: canCancelLine ? 'Qatorni bekor qilish' : 'Bekor qilish (mumkin emas)',
            style: 'destructive',
            onPress: canCancelLine ? onCancel : undefined,
          },
          { text: '✕', style: 'cancel' },
        ]);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.mainRow}>
        <View style={styles.left}>
          {isService && (
            <Text style={styles.serviceTag}>✨</Text>
          )}
          <Text style={styles.name}>{line.name}</Text>
          <Text style={styles.qty}>× {line.quantity}</Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceDetails}>
          {formatUZS(line.price)} × {line.quantity}
        </Text>
        <Text style={styles.total}>{formatUZS(line.price * line.quantity)} so'm</Text>
      </View>

      {line.notes ? (
        <View style={styles.noteContainer}>
          <MaterialCommunityIcons
            name="note-text-outline"
            size={16}
            color={theme.colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.note}>{line.notes}</Text>
        </View>
      ) : null}

      {line.comboNameSnapshot ? (
        <View style={styles.comboContainer}>
          <Text style={styles.combo}>Set: {line.comboNameSnapshot}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
  },
  serviceRow: {
    backgroundColor: theme.colors.successLight,
    borderColor: theme.colors.success + '40',
  },
  canceled: {
    backgroundColor: theme.colors.slate[50],
    borderColor: theme.colors.slate[200],
    opacity: 0.6,
  },
  canceledText: {
    fontSize: 14,
    color: theme.colors.slate[500],
    textDecorationLine: 'line-through',
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  serviceTag: {
    fontSize: 14,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.slate[900],
    flexShrink: 1,
  },
  qty: {
    fontSize: 14,
    color: theme.colors.slate[600],
    fontVariant: ['tabular-nums'],
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  priceDetails: {
    fontSize: 12,
    color: theme.colors.slate[500],
    fontVariant: ['tabular-nums'],
  },
  total: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  note: {
    fontSize: 13,
    color: theme.colors.primary,
    flexShrink: 1,
  },
  comboContainer: {
    marginTop: 4,
  },
  combo: {
    fontSize: 12,
    color: theme.colors.slate[500],
    fontStyle: 'italic',
  },
});
