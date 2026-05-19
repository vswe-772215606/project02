import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { OrderLine } from '../api/orders';
import { formatUZS } from '../lib/format';
import { theme } from '../lib/theme';

type Props = {
  line: OrderLine;
  canEdit: boolean;
  busy?: boolean;
  onPlus: () => void;
  onMinus: () => void;
  onNote: () => void;
  onCancel: () => void;
};

export function LineRow({ line, canEdit, busy, onPlus, onMinus, onNote, onCancel }: Props) {
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
  const isCombo = !!line.comboGroupId;
  // Service & combo lines can't have their qty changed individually here.
  const showQtyControls = canEdit && !isService && !isCombo;

  return (
    <View style={[styles.row, isService && styles.serviceRow]}>
      <View style={styles.mainRow}>
        <View style={styles.left}>
          {isService && <Text style={styles.serviceTag}>✨</Text>}
          <Text style={styles.name} numberOfLines={2}>{line.name}</Text>
        </View>
        <Text style={styles.total}>{formatUZS(line.price * line.quantity)} so'm</Text>
      </View>

      <View style={styles.controlsRow}>
        <Text style={styles.priceDetails}>
          {formatUZS(line.price)} so'm × {line.quantity}
        </Text>

        {showQtyControls ? (
          <View style={styles.qtyControl}>
            <TouchableOpacity
              style={styles.qtyMinusBtn}
              onPress={onMinus}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name={line.quantity === 1 ? 'trash-can-outline' : 'minus'}
                size={20}
                color={theme.colors.danger}
              />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{line.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyPlusBtn}
              onPress={onPlus}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.qtyStatic}>× {line.quantity}</Text>
        )}
      </View>

      {line.notes ? (
        <View style={styles.noteContainer}>
          <MaterialCommunityIcons
            name="note-text-outline"
            size={14}
            color={theme.colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.note} numberOfLines={2}>{line.notes}</Text>
        </View>
      ) : null}

      {isCombo && line.comboNameSnapshot ? (
        <View style={styles.comboContainer}>
          <Text style={styles.combo}>Set: {line.comboNameSnapshot}</Text>
        </View>
      ) : null}

      {canEdit && (
        <View style={styles.actionRow}>
          <TouchableOpacity onPress={onNote} style={styles.actionBtn} disabled={busy}>
            <MaterialCommunityIcons
              name={line.notes ? 'note-edit-outline' : 'note-plus-outline'}
              size={16}
              color={theme.colors.slate[600]}
            />
            <Text style={styles.actionText}>{line.notes ? 'Eslatmani tahrirlash' : "Eslatma qo'shish"}</Text>
          </TouchableOpacity>
          {!isService && (
            <TouchableOpacity onPress={onCancel} style={styles.actionBtn} disabled={busy}>
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={theme.colors.danger} />
              <Text style={[styles.actionText, { color: theme.colors.danger }]}>Bekor qilish</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
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
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 12,
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
    fontWeight: '700',
    color: theme.colors.slate[900],
    flexShrink: 1,
  },
  total: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  priceDetails: {
    fontSize: 12,
    color: theme.colors.slate[500],
    fontVariant: ['tabular-nums'],
  },
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    height: 44,
  },
  qtyMinusBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dangerLight,
  },
  qtyPlusBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
  },
  qtyValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '900',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },
  qtyStatic: {
    fontSize: 14,
    color: theme.colors.slate[600],
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  noteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 6,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: 6,
  },
  note: {
    fontSize: 13,
    color: theme.colors.primary,
    flexShrink: 1,
    fontStyle: 'italic',
  },
  comboContainer: {
    marginTop: 4,
  },
  combo: {
    fontSize: 12,
    color: theme.colors.slate[500],
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.slate[100],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.slate[600],
  },
});
