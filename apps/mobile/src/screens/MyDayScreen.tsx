import { useCallback, useState } from 'react';
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
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'MyDay'>;

function todayLabel(): string {
  const d = new Date();
  const months = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function MyDayScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);

  const { data, refetch } = useQuery({
    queryKey: ['me', 'today-stats'],
    queryFn: () => meApi.todayStats(),
    refetchInterval: 30_000,
  });

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.slate[700]} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Mening kunim</Text>
          <Text style={styles.subtitle}>{todayLabel()}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <Text style={styles.greeting}>
          Assalomu alaykum, {user?.fullName ?? 'mehmon'}!
        </Text>

        {/* Headline: service charge earned today */}
        <StatTile
          label="Bugungi xizmat haqi (kishi boshi)"
          value={`${formatUZS(Number(data?.serviceEarned ?? 0))} so'm`}
          hint={Number(data?.serviceEarned ?? 0) > 0 ? 'Yorug‘ kun bo‘lib o‘tdi 👏' : 'Hozircha — yangi smena boshlandi'}
          tone="success"
          size="lg"
          style={styles.headlineTile}
        />

        <View style={styles.row}>
          <StatTile
            label="Yopilgan buyurtmalar"
            value={`${data?.ordersClosed ?? 0}`}
            hint={`${data?.ordersCanceled ?? 0} bekor · ${data?.ordersWalkout ?? 0} to'lamagan`}
            tone="primary"
            style={styles.halfTile}
          />
          <StatTile
            label="Ovqat savdosi"
            value={`${formatUZS(Number(data?.foodRevenue ?? 0))}`}
            hint="so'm (chegirmadan keyin)"
            style={styles.halfTile}
          />
        </View>

        <StatTile
          label="Yakuniy chek summasi"
          value={`${formatUZS(Number(data?.totalBilled ?? 0))} so'm`}
          hint="Ovqat + xizmat haqi"
        />

        <View style={styles.infoCard}>
          <MaterialCommunityIcons
            name="information-outline"
            size={20}
            color={theme.colors.primary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.infoText}>
            Xizmat haqi (✨) — har mijozdan olinadigan ulush. Buyurtma boshqaruvchi
            tomonidan tasdiqlangach, summa shu hisobotga qo'shiladi.
          </Text>
        </View>
      </ScrollView>
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
