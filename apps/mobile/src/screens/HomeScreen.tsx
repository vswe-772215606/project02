import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import { authApi } from '../api/auth';
import { ordersApi, ACTIVE_STATUSES } from '../api/orders';
import { meApi } from '../api/me';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatUZS } from '../lib/format';
import { theme } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { OrderCard } from '../components/OrderCard';
import { ConnectionPill } from '../components/ConnectionPill';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={[styles.skLine, { width: '40%' }]} />
      <View style={[styles.skLine, { width: '80%', marginTop: 8 }]} />
      <View style={styles.skFooter}>
        <View style={[styles.skLine, { width: 90 }]} />
        <View style={[styles.skLine, { width: 70 }]} />
      </View>
    </View>
  );
}

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);
  const actionsDisabled = status !== 'online';

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => ordersApi.list({ mine: true }),
    refetchInterval: 15_000,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['me', 'today-stats'],
    queryFn: () => meApi.todayStats(),
    refetchInterval: 30_000,
  });

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));
  const serviceEarned = Number(stats?.serviceEarned ?? 0);

  // Manual refresh state — keeps the spinner off during 15s/30s background
  // polling, only shows when the user actually pulls down.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), refetchStats()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, refetchStats]);

  const handleLogout = () => {
    Alert.alert('Chiqish', "Chiqishni xohlaysizmi?", [
      { text: "Yo'q", style: 'cancel' },
      {
        text: 'Ha', onPress: async () => {
          try { await authApi.logout(); } catch { /* ignore */ }
          await clearAuth();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Buyurtmalar</Text>
            <ConnectionPill />
          </View>
          <Text style={styles.subtitle}>{user?.fullName}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.headerIconBtn}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={theme.colors.slate[600]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <MaterialCommunityIcons name="logout" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Today stat strip — tappable, opens MyDayScreen */}
      <TouchableOpacity
        style={styles.statStrip}
        onPress={() => nav.navigate('MyDay')}
        activeOpacity={0.7}
      >
        <View style={styles.statLeft}>
          <Text style={styles.statHello}>Bugun</Text>
          <Text style={styles.statValue}>
            {stats?.ordersClosed ?? 0} buyurtma
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statRight}>
          <Text style={styles.statHello}>Xizmat haqi</Text>
          <Text style={[
            styles.statValue,
            serviceEarned > 0 && styles.statValueAccent,
          ]}>
            {formatUZS(Number(stats?.serviceEarned ?? 0))} so'm
          </Text>
        </View>
        <MaterialCommunityIcons
          name="chevron-right"
          size={22}
          color={theme.colors.slate[400]}
        />
      </TouchableOpacity>

      {/* Section header with counter + new-order action */}
      <View style={styles.sectionBar}>
        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>Faol</Text>
          {activeOrders.length > 0 && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{activeOrders.length}</Text>
            </View>
          )}
        </View>

        <Button
          title="+ Yangi"
          size="sm"
          onPress={() => nav.navigate('NewOrder')}
          disabled={actionsDisabled}
          style={styles.newBtn}
        />
      </View>

      {/* Order list (or skeleton on first load) */}
      {isLoading && orders.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={activeOrders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => nav.navigate('OrderEdit', { orderId: item.id })} />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Faol buyurtma yo'q</Text>
              <Text style={styles.emptyHint}>Yangi buyurtma yaratish uchun "+ Yangi" tugmasini bosing.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.slate[50] },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
    gap: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 32,
  },
  title: { ...theme.typography.h2, color: theme.colors.slate[900] },
  subtitle: { ...theme.typography.small, color: theme.colors.slate[500], marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.slate[50],
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  statLeft: { flex: 1 },
  statRight: { flex: 1, alignItems: 'flex-start' },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.slate[200],
  },
  statHello: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.slate[900],
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  statValueAccent: {
    color: theme.colors.success,
  },

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.slate[50],
  },
  sectionLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.slate[900],
  },
  sectionBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.white,
  },
  newBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  list: { padding: theme.spacing.lg, paddingBottom: 40 },

  skeleton: {
    backgroundColor: theme.colors.white,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
  },
  skLine: {
    height: 12,
    backgroundColor: theme.colors.slate[200],
    borderRadius: 4,
  },
  skFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },

  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: theme.spacing.lg },
  emptyText: { color: theme.colors.slate[500], fontSize: 16, fontWeight: '600' },
  emptyHint: { color: theme.colors.slate[400], fontSize: 13, marginTop: 6, textAlign: 'center' },
});
