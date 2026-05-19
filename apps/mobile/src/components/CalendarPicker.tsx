import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../lib/theme';
import type { DayStat } from '../api/me';

type Props = {
  visible: boolean;
  selectedDate: string; // YYYY-MM-DD
  monthCursor: string; // YYYY-MM-DD (any date in the displayed month)
  todayKey: string;
  days?: DayStat[];
  onChangeMonth: (next: string) => void;
  onSelect: (date: string) => void;
  onClose: () => void;
};

const UZ_WEEKDAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'] as const;
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
] as const;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns a 6x7 grid of dates: leading days from prev month, current month, trailing from next month.
function buildMonthGrid(cursorIso: string) {
  const cursor = new Date(`${cursorIso}T00:00:00`);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  // Convert Sun=0 → Mon=0 ordering
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({ date: d, key: dayKey(d), inMonth: d.getMonth() === month });
  }
  return { cells, year, month };
}

export function CalendarPicker({
  visible,
  selectedDate,
  monthCursor,
  todayKey,
  days,
  onChangeMonth,
  onSelect,
  onClose,
}: Props) {
  const { cells, year, month } = useMemo(() => buildMonthGrid(monthCursor), [monthCursor]);

  const activityMap = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const d of days ?? []) m.set(d.date, d);
    return m;
  }, [days]);

  const goPrev = () => {
    const d = new Date(year, month - 1, 1);
    onChangeMonth(dayKey(d));
  };
  const goNext = () => {
    const d = new Date(year, month + 1, 1);
    onChangeMonth(dayKey(d));
  };
  const isFutureMonth = (() => {
    const today = new Date(`${todayKey}T00:00:00`);
    return year > today.getFullYear() || (year === today.getFullYear() && month >= today.getMonth());
  })();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={goPrev} style={styles.navBtn} hitSlop={8}>
              <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.slate[700]} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {UZ_MONTHS[month]} {year}
            </Text>
            <TouchableOpacity
              onPress={goNext}
              disabled={isFutureMonth}
              style={[styles.navBtn, isFutureMonth && styles.navBtnDisabled]}
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={isFutureMonth ? theme.colors.slate[300] : theme.colors.slate[700]}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {UZ_WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((c) => {
              const isFuture = c.key > todayKey;
              const isSelected = c.key === selectedDate;
              const isToday = c.key === todayKey;
              const activity = activityMap.get(c.key);
              const hasActivity = !!activity && activity.ordersClosed > 0;

              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.cell,
                    !c.inMonth && styles.cellOutside,
                    isSelected && styles.cellSelected,
                  ]}
                  disabled={isFuture}
                  activeOpacity={0.7}
                  onPress={() => onSelect(c.key)}
                >
                  <Text
                    style={[
                      styles.cellText,
                      !c.inMonth && styles.cellTextOutside,
                      isFuture && styles.cellTextFuture,
                      isToday && !isSelected && styles.cellTextToday,
                      isSelected && styles.cellTextSelected,
                    ]}
                  >
                    {c.date.getDate()}
                  </Text>
                  {hasActivity && (
                    <View style={[styles.dot, isSelected && styles.dotSelected]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => { onSelect(todayKey); }} style={styles.todayBtn}>
              <Text style={styles.todayBtnText}>Bugun</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Yopish</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  sheet: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.slate[900],
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.slate[50],
  },
  navBtnDisabled: {
    backgroundColor: theme.colors.slate[50],
    opacity: 0.5,
  },
  weekdayRow: {
    flexDirection: 'row',
    paddingHorizontal: 2,
    paddingBottom: theme.spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
  },
  cellOutside: {
    opacity: 0.35,
  },
  cellSelected: {
    backgroundColor: theme.colors.primary,
  },
  cellText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.slate[800],
    fontVariant: ['tabular-nums'],
  },
  cellTextOutside: {
    color: theme.colors.slate[400],
  },
  cellTextFuture: {
    color: theme.colors.slate[300],
  },
  cellTextToday: {
    color: theme.colors.primary,
    fontWeight: '800',
  },
  cellTextSelected: {
    color: theme.colors.white,
    fontWeight: '800',
  },
  dot: {
    position: 'absolute',
    bottom: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.success,
  },
  dotSelected: {
    backgroundColor: theme.colors.white,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  todayBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
  },
  todayBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.slate[100],
    alignItems: 'center',
  },
  closeBtnText: {
    color: theme.colors.slate[700],
    fontWeight: '700',
    fontSize: 14,
  },
});
