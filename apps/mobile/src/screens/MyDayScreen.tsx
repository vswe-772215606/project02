import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import { meApi } from '../api/me';
import { theme } from '../lib/theme';
import { formatUZS } from '../lib/format';
import { StatTile } from '../components/StatTile';
import { CalendarPicker } from '../components/CalendarPicker';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MyDay'>;

const UZ_MONTHS_FULL = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
] as const;

const UZ_WEEKDAYS_FULL = [
  'Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba',
  'Payshanba', 'Juma', 'Shanba',
] as const;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayLocalKey(): string {
  return dayKey(new Date());
}

function parseKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function prettyDate(key: string, todayKey: string): string {
  const d = parseKey(key);
  const today = parseKey(todayKey);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  const base = `${d.getDate()} ${UZ_MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
  if (diff === 0) return `Bugun · ${base}`;
  if (diff === 1) return `Kecha · ${base}`;
  return `${UZ_WEEKDAYS_FULL[d.getDay()]} · ${base}`;
}

function addDays(key: string, delta: number): string {
  const d = parseKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

function monthStartKey(key: string): string {
  const d = parseKey(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

function monthEndKey(key: string): string {
  const d = parseKey(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function MyDayScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);

  const todayKey = todayLocalKey();
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [monthCursor, setMonthCursor] = useState<string>(todayKey);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isFutureSelected = selectedDate > todayKey;

  const { data: dayStats, refetch: refetchDay } = useQuery({
    queryKey: ['me', 'today-stats', selectedDate],
    queryFn: () => meApi.todayStats(selectedDate),
    refetchInterval: selectedDate === todayKey ? 30_000 : false,
    enabled: !isFutureSelected,
  });

  // Range for the displayed month — caps at today (no future days fetched).
  const rangeFrom = monthStartKey(monthCursor);
  const rangeTo = useMemo(() => {
    const end = monthEndKey(monthCursor);
    return end > todayKey ? todayKey : end;
  }, [monthCursor, todayKey]);

  const { data: rangeData, refetch: refetchRange } = useQuery({
    queryKey: ['me', 'range-stats', rangeFrom, rangeTo],
    queryFn: () => meApi.rangeStats(rangeFrom, rangeTo),
    enabled: rangeFrom <= rangeTo,
  });

  const monthTotalsLabel = useMemo(() => {
    if (!rangeData) return null;
    return {
      orders: rangeData.totalOrders,
      service: Number(rangeData.totalServiceEarned),
    };
  }, [rangeData]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchDay(), refetchRange()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchDay, refetchRange]);

  const serviceEarned = Number(dayStats?.serviceEarned ?? 0);
  const ordersClosed = dayStats?.ordersClosed ?? 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.slate[700]} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Mening kunim</Text>
          <Text style={styles.subtitle}>{prettyDate(selectedDate, todayKey)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setMonthCursor(selectedDate); setPickerOpen(true); }}
          style={styles.calendarBtn}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="calendar-month" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Day-navigation strip */}
      <View style={styles.dayNav}>
        <TouchableOpacity
          style={styles.dayNavBtn}
          onPress={() => setSelectedDate((d) => addDays(d, -1))}
          hitSlop={8}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={theme.colors.slate[700]} />
          <Text style={styles.dayNavText}>Oldingi kun</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dayNavBtn, styles.dayNavBtnRight]}
          onPress={() => {
            const next = addDays(selectedDate, 1);
            if (next <= todayKey) setSelectedDate(next);
          }}
          disabled={selectedDate >= todayKey}
          hitSlop={8}
        >
          <Text style={[styles.dayNavText, selectedDate >= todayKey && styles.dayNavTextMuted]}>
            Keyingi kun
          </Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={selectedDate >= todayKey ? theme.colors.slate[300] : theme.colors.slate[700]}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {selectedDate === todayKey && (
          <Text style={styles.greeting}>
            Assalomu alaykum, {user?.fullName ?? 'mehmon'}!
          </Text>
        )}

        {/* Headline: service charge earned on the selected day */}
        <StatTile
          label="Xizmat haqi"
          value={`${formatUZS(serviceEarned)} so'm`}
          hint={
            serviceEarned > 0
              ? (selectedDate === todayKey ? 'Yorug‘ kun bo‘lib o‘tdi 👏' : 'Shu kunlik daromad')
              : 'Bu kunda xizmat haqi yo‘q'
          }
          tone="success"
          size="lg"
          style={styles.headlineTile}
        />

        <View style={styles.row}>
          <StatTile
            label="Yopilgan buyurtmalar"
            value={`${ordersClosed}`}
            hint={`${dayStats?.ordersCanceled ?? 0} bekor · ${dayStats?.ordersWalkout ?? 0} to'lamagan`}
            tone="primary"
            style={styles.halfTile}
          />
          <StatTile
            label="Ovqat savdosi"
            value={`${formatUZS(Number(dayStats?.foodRevenue ?? 0))}`}
            hint="so'm (chegirmadan keyin)"
            style={styles.halfTile}
          />
        </View>

        <StatTile
          label="Yakuniy chek summasi"
          value={`${formatUZS(Number(dayStats?.totalBilled ?? 0))} so'm`}
          hint="Ovqat + xizmat haqi"
        />

        {monthTotalsLabel && (
          <View style={styles.monthSummary}>
            <View>
              <Text style={styles.monthSummaryLabel}>
                {UZ_MONTHS_FULL[parseKey(monthCursor).getMonth()]} {parseKey(monthCursor).getFullYear()}
              </Text>
              <Text style={styles.monthSummaryHint}>Oylik jami</Text>
            </View>
            <View style={styles.monthSummaryRight}>
              <Text style={styles.monthSummaryService}>
                {formatUZS(monthTotalsLabel.service)} so'm
              </Text>
              <Text style={styles.monthSummaryOrders}>
                {monthTotalsLabel.orders} buyurtma
              </Text>
            </View>
          </View>
        )}

        <View style={styles.infoCard}>
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={theme.colors.primary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.infoText}>
            Xizmat haqi (✨) — har mijozdan olinadigan ulush. Buyurtma boshqaruvchi
            tomonidan tasdiqlangach, summa shu hisobotga qo'shiladi. Kalendar
            tugmasini bosib o‘tgan kunlarni ko‘rishingiz mumkin.
          </Text>
        </View>
      </ScrollView>

      <CalendarPicker
        visible={pickerOpen}
        selectedDate={selectedDate}
        monthCursor={monthCursor}
        todayKey={todayKey}
        days={rangeData?.days}
        onChangeMonth={setMonthCursor}
        onSelect={(d) => {
          setSelectedDate(d);
          setMonthCursor(d);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.slate[50],
  },
  header: {
    backgroundColor: theme.colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 56,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[200],
    gap: theme.spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
    marginLeft: -8,
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.slate[900],
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.slate[500],
    marginTop: 2,
  },
  calendarBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primaryLight,
  },

  dayNav: {
    flexDirection: 'row',
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
  },
  dayNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  dayNavBtnRight: {
    justifyContent: 'flex-end',
  },
  dayNavText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.slate[700],
  },
  dayNavTextMuted: {
    color: theme.colors.slate[300],
  },

  body: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  greeting: {
    fontSize: 15,
    color: theme.colors.slate[600],
    marginBottom: theme.spacing.xs,
  },
  headlineTile: {
    paddingVertical: theme.spacing.xl,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  halfTile: {
    flex: 1,
  },

  monthSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.white,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
  },
  monthSummaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.slate[700],
    textTransform: 'capitalize',
  },
  monthSummaryHint: {
    fontSize: 11,
    color: theme.colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  monthSummaryRight: {
    alignItems: 'flex-end',
  },
  monthSummaryService: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.success,
    fontVariant: ['tabular-nums'],
  },
  monthSummaryOrders: {
    fontSize: 12,
    color: theme.colors.slate[500],
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },

  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.slate[700],
    lineHeight: 18,
  },
});
