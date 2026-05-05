import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Pressable,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/auth.store';
import { authApi } from '../api/auth';
import { ordersApi, WORK_STATUSES, BILL_STATUSES, STATUS_LABELS, Order } from '../api/orders';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { elapsed, formatUZS } from '../lib/format';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const WORK_COLORS: Record<string, string> = {
  DRAFT: '#d97706',
  SENT: '#2563eb',
};
const BILL_COLORS: Record<string, string> = {
  BILL_REQUESTED: '#7c3aed',
  PENDING_PAYMENT: '#475569',
};

function WorkOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const hasReady = order.kitchenTickets.some((t) => t.status === 'READY');
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const color = WORK_COLORS[order.status] ?? '#475569';

  const mealPreview = (() => {
    const names = activeLines.map((l) => l.name);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} ... (+${names.length - 2})`;
  })();

  return (
    <TouchableOpacity
      style={[styles.workCard, hasReady && styles.workCardReady]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTable}>{tableLabel}</Text>
        <Text style={styles.cardTime}>{elapsed(order.createdAt)}</Text>
      </View>
      {mealPreview ? (
        <Text style={styles.cardMeals} numberOfLines={1}>{mealPreview}</Text>
      ) : (
        <Text style={styles.cardMealsEmpty}>Mahsulot yo'q</Text>
      )}
      <View style={styles.cardBottomRow}>
        <Text style={styles.cardAmount}>{formatUZS(order.totalAmount)} so'm</Text>
        <View style={[styles.statusBadge, { backgroundColor: color }]}>
          <Text style={styles.statusBadgeText}>{STATUS_LABELS[order.status]}</Text>
        </View>
      </View>
      {hasReady && (
        <View style={styles.readyBanner}>
          <Text style={styles.readyBannerText}>✓ TAYYOR — OLIB KELING!</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function BillOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const color = BILL_COLORS[order.status] ?? '#475569';

  const mealPreview = (() => {
    const names = activeLines.map((l) => l.name);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} ... (+${names.length - 2})`;
  })();

  return (
    <TouchableOpacity style={styles.billCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTable}>{tableLabel}</Text>
        <View style={[styles.statusBadge, { backgroundColor: color }]}>
          <Text style={styles.statusBadgeText}>{STATUS_LABELS[order.status]}</Text>
        </View>
      </View>
      {mealPreview && (
        <Text style={styles.cardMeals} numberOfLines={1}>{mealPreview}</Text>
      )}
      <View style={styles.billAmountRow}>
        <Text style={styles.billAmount}>{formatUZS(order.totalAmount)} so'm</Text>
        <Text style={styles.cardTime}>{elapsed(order.createdAt)}</Text>
      </View>
    </TouchableOpacity>
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
    refetchInterval: 20_000,
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
          <Pressable onPress={() => nav.navigate('Settings')} style={styles.iconBtn} hitSlop={8}>
            <Text style={styles.iconBtnText}>⚙</Text>
          </Pressable>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Chiqish</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'work' && styles.tabBtnActive, hasReadyAny && tab !== 'work' && styles.tabBtnAlert]}
          onPress={() => setTab('work')}
        >
          <Text style={[styles.tabLabel, tab === 'work' && styles.tabLabelActive]}>
            Faol
          </Text>
          {workOrders.length > 0 && (
            <View style={[styles.tabCount, tab === 'work' && styles.tabCountActive, hasReadyAny && styles.tabCountReady]}>
              <Text style={[styles.tabCountText, tab === 'work' && styles.tabCountTextActive]}>
                {workOrders.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === 'bill' && styles.tabBtnActive]}
          onPress={() => setTab('bill')}
        >
          <Text style={[styles.tabLabel, tab === 'bill' && styles.tabLabelActive]}>
            Hisob
          </Text>
          {billOrders.length > 0 && (
            <View style={[styles.tabCount, tab === 'bill' && styles.tabCountActive]}>
              <Text style={[styles.tabCountText, tab === 'bill' && styles.tabCountTextActive]}>
                {billOrders.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.newOrderBtn, actionsDisabled && styles.btnDisabled]}
          onPress={() => nav.navigate('NewOrder')}
          disabled={actionsDisabled}
        >
          <Text style={styles.newOrderText}>+ Yangi</Text>
        </TouchableOpacity>
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
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
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
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 8 },
  iconBtnText: { fontSize: 20, color: '#6b7280' },
  logoutBtn: { padding: 8 },
  logoutText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  offlineBanner: { backgroundColor: '#dc2626', paddingVertical: 6, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    gap: 6,
  },
  tabBtnActive: { backgroundColor: '#2563eb' },
  tabBtnAlert: { backgroundColor: '#fef9c3' },
  tabLabel: { fontSize: 15, fontWeight: '700', color: '#374151' },
  tabLabelActive: { color: '#fff' },
  tabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabCountReady: { backgroundColor: '#16a34a' },
  tabCountText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  tabCountTextActive: { color: '#fff' },
  newOrderBtn: {
    marginLeft: 'auto',
    backgroundColor: '#2563eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnDisabled: { backgroundColor: '#9ca3af' },
  newOrderText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  list: { padding: 12, paddingBottom: 24 },

  workCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
  },
  workCardReady: { borderColor: '#16a34a', borderWidth: 2.5, backgroundColor: '#f0fdf4' },
  billCard: {
    backgroundColor: '#faf5ff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#e9d5ff',
  },

  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  cardTable: { fontSize: 19, fontWeight: '800', color: '#111827' },
  cardTime: { fontSize: 13, color: '#9ca3af' },
  cardMeals: { fontSize: 13, color: '#374151', marginBottom: 8 },
  cardMealsEmpty: { fontSize: 13, color: '#d1d5db', fontStyle: 'italic', marginBottom: 8 },
  cardBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardAmount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  readyBanner: {
    marginTop: 10,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  readyBannerText: { color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.5 },

  billAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  billAmount: { fontSize: 20, fontWeight: '800', color: '#7c3aed' },

  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
});
