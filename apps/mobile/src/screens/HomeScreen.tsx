import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import { authApi } from '../api/auth';
import { ordersApi, WORK_STATUSES, BILL_STATUSES, STATUS_LABELS, Order } from '../api/orders';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { elapsed, formatUZS } from '../lib/format';
import { theme } from '../lib/theme';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const STATUS_VARIANTS: Record<string, 'warning' | 'primary' | 'info' | 'slate'> = {
  DRAFT: 'warning',
  SENT: 'primary',
  BILL_REQUESTED: 'info',
  PENDING_PAYMENT: 'slate',
};

function WorkOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const hasReady = order.kitchenTickets.some((t) => t.status === 'READY');
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const variant = STATUS_VARIANTS[order.status] || 'slate';

  const mealPreview = (() => {
    const names = activeLines.map((l) => l.name);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} ... (+${names.length - 2})`;
  })();

  return (
    <Card
      style={[styles.card, hasReady && styles.cardReady]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTable}>{tableLabel}</Text>
        <Text style={styles.cardTime}>{elapsed(order.createdAt)}</Text>
      </View>
      
      {mealPreview ? (
        <Text style={styles.cardMeals} numberOfLines={1}>{mealPreview}</Text>
      ) : (
        <Text style={styles.cardMealsEmpty}>Mahsulot yo'q</Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.cardAmount}>{formatUZS(order.totalAmount)} so'm</Text>
        <Badge label={STATUS_LABELS[order.status]} variant={variant} />
      </View>

      {hasReady && (
        <View style={styles.readyBanner}>
          <MaterialCommunityIcons name="check-bold" size={16} color={theme.colors.white} style={{ marginRight: 6 }} />
          <Text style={styles.readyBannerText}>TAYYOR — OLIB KELING!</Text>
        </View>
      )}
    </Card>
  );
}

function BillOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const variant = STATUS_VARIANTS[order.status] || 'slate';

  const mealPreview = (() => {
    const names = activeLines.map((l) => l.name);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} ... (+${names.length - 2})`;
  })();

  return (
    <Card style={styles.card} onPress={onPress}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTable}>{tableLabel}</Text>
        <Badge label={STATUS_LABELS[order.status]} variant={variant} />
      </View>

      {mealPreview && (
        <Text style={styles.cardMeals} numberOfLines={1}>{mealPreview}</Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={[styles.cardAmount, styles.billAmount]}>{formatUZS(order.totalAmount)} so'm</Text>
        <Text style={styles.cardTime}>{elapsed(order.createdAt)}</Text>
      </View>
    </Card>
  );
}

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const status = useConnectionStore((s) => s.status);
  const actionsDisabled = status !== 'online';
  const [tab, setTab] = useState<'work' | 'bill'>('work');

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ['orders', 'mine'],
    queryFn: () => ordersApi.list({ mine: true }),
    refetchInterval: 15_000,
  });

  const workOrders = orders.filter((o) => WORK_STATUSES.includes(o.status));
  const billOrders = orders.filter((o) => BILL_STATUSES.includes(o.status));
  const hasReadyAny = workOrders.some((o) => o.kitchenTickets.some((t) => t.status === 'READY'));

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

  const listData = tab === 'work' ? workOrders : billOrders;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Buyurtmalar</Text>
          <Text style={styles.subtitle}>{user?.fullName}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => nav.navigate('Settings')} style={styles.headerIconBtn}>
            <MaterialCommunityIcons name="cog-outline" size={24} color={theme.colors.slate[600]} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <MaterialCommunityIcons name="logout" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Modern Tab Bar */}
      <View style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, tab === 'work' && styles.tabItemActive]}
            onPress={() => setTab('work')}
          >
            <Text style={[styles.tabText, tab === 'work' && styles.tabTextActive]}>Faol</Text>
            {workOrders.length > 0 && (
              <View style={[
                styles.tabBadge,
                tab === 'work' ? styles.tabBadgeActive : styles.tabBadgeInactive,
                hasReadyAny && styles.tabBadgeReady
              ]}>
                <Text style={[styles.tabBadgeText, tab === 'work' && styles.tabBadgeTextActive]}>
                  {workOrders.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, tab === 'bill' && styles.tabItemActive]}
            onPress={() => setTab('bill')}
          >
            <Text style={[styles.tabText, tab === 'bill' && styles.tabTextActive]}>Hisob</Text>
            {billOrders.length > 0 && (
              <View style={[styles.tabBadge, tab === 'bill' ? styles.tabBadgeActive : styles.tabBadgeInactive]}>
                <Text style={[styles.tabBadgeText, tab === 'bill' && styles.tabBadgeTextActive]}>
                  {billOrders.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <Button
          title="+ Yangi"
          size="sm"
          onPress={() => nav.navigate('NewOrder')}
          disabled={actionsDisabled}
          style={styles.newBtn}
        />
      </View>

      {/* Order list */}
      <FlatList
        data={listData}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) =>
          tab === 'work'
            ? <WorkOrderCard order={item} onPress={() => nav.navigate('OrderEdit', { orderId: item.id })} />
            : <BillOrderCard order={item} onPress={() => nav.navigate('OrderEdit', { orderId: item.id })} />
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {tab === 'work' ? 'Faol buyurtma yo\'q' : 'Hisob kutilmaydi'}
            </Text>
          </View>
        }
      />
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

  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.slate[100],
    borderRadius: 12,
    padding: 4,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  tabItemActive: {
    backgroundColor: theme.colors.white,
    ...theme.shadows.sm,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.slate[500],
  },
  tabTextActive: {
    color: theme.colors.primary,
  },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeInactive: {
    backgroundColor: theme.colors.slate[200],
  },
  tabBadgeActive: {
    backgroundColor: theme.colors.primary,
  },
  tabBadgeReady: {
    backgroundColor: theme.colors.success,
  },
  tabBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.slate[600],
  },
  tabBadgeTextActive: {
    color: theme.colors.white,
  },
  newBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },

  list: { padding: theme.spacing.lg, paddingBottom: 40 },
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  cardReady: {
    borderColor: theme.colors.success,
    borderWidth: 2,
    backgroundColor: theme.colors.successLight,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  cardTable: {
    ...theme.typography.h3,
    color: theme.colors.slate[900],
  },
  cardTime: {
    ...theme.typography.small,
  },
  cardMeals: {
    fontSize: 14,
    color: theme.colors.slate[600],
    marginBottom: theme.spacing.md,
  },
  cardMealsEmpty: {
    fontSize: 14,
    color: theme.colors.slate[300],
    fontStyle: 'italic',
    marginBottom: theme.spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.slate[900],
  },
  billAmount: {
    color: theme.colors.info,
    fontSize: 18,
  },
  readyBanner: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.success,
    borderRadius: 8,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyBannerText: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: 13,
  },

  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: theme.colors.slate[400], fontSize: 16 },
});
