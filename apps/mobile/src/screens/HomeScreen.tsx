import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl, Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/auth.store';
import { authApi } from '../api/auth';
import { ordersApi, ACTIVE_STATUSES, STATUS_LABELS, Order } from '../api/orders';
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
};

function WorkOrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
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
    </Card>
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

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.status));

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

      {/* Order list */}
      <FlatList
        data={activeOrders}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => (
          <WorkOrderCard order={item} onPress={() => nav.navigate('OrderEdit', { orderId: item.id })} />
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={theme.colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Faol buyurtma yo'q</Text>
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

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
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
  card: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.lg,
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

  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: theme.colors.slate[400], fontSize: 16 },
});
