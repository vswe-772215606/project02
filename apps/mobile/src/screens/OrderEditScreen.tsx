import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
  ActivityIndicator, FlatList, Platform, AppState,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ordersApi, OrderLine, STATUS_LABELS } from '../api/orders';
import { tablesApi } from '../api/tables';
import { useConnectionStore } from '../stores/connection.store';
import { useToastStore } from '../stores/toast.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatUZS } from '../lib/format';
import { MenuPanel } from '../components/MenuPanel';
import { LineRow } from '../components/LineRow';
import { theme } from '../lib/theme';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { haptics } from '../lib/haptics';

type Nav = NativeStackNavigationProp<RootStackParamList, 'OrderEdit'>;
type Route = RouteProp<RootStackParamList, 'OrderEdit'>;

const STATUS_VARIANTS: Record<string, 'warning' | 'primary' | 'info' | 'slate' | 'success' | 'danger'> = {
  DRAFT: 'warning',
  SENT: 'primary',
  CLOSED: 'success',
  WALKOUT: 'danger',
  CANCELED: 'slate',
};

export function OrderEditScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { orderId } = route.params;
  const qc = useQueryClient();
  const offline = useConnectionStore((s) => s.status) !== 'online';
  const showToast = useToastStore((s) => s.show);

  const [tab, setTab] = useState<'order' | 'menu'>('order');
  const [noteModal, setNoteModal] = useState<{ lineId: string; current: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [cancelOrderModal, setCancelOrderModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [transferModal, setTransferModal] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.getById(orderId),
    refetchInterval: 10_000,
  });
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.list,
    enabled: transferModal,
  });

  // Auto-open menu tab for fresh empty orders
  useEffect(() => {
    if (order && order.lines.length === 0 && order.status === 'DRAFT') {
      setTab('menu');
    }
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Empty-draft reaper -------------------------------------------------
  // An abandoned DRAFT with zero active lines keeps its table occupied while
  // being effectively invisible to the waiter. We reap such drafts on the
  // client events RN reliably delivers before the screen/process goes away.
  // We ONLY ever cancel a draft with no active (non-canceled) lines — a draft
  // that already has items is never auto-canceled.
  const reapedRef = useRef(false);

  const reapIfEmptyDraft = useCallback(() => {
    if (reapedRef.current || !order) return;
    const hasActiveLines = order.lines.some((l) => !l.isCanceled);
    if (order.status !== 'DRAFT' || hasActiveLines) return;
    reapedRef.current = true;
    // Fire-and-forget: we may be mid-navigation or about to be suspended.
    ordersApi.cancel(orderId, "Bo'sh qoralama").catch(() => {});
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['tables'] });
  }, [order, orderId, qc]);

  // (a) Reap when the waiter navigates back off this screen.
  useEffect(() => {
    const unsub = nav.addListener('beforeRemove', reapIfEmptyDraft);
    return unsub;
  }, [nav, reapIfEmptyDraft]);

  // (b) Reap when the app is backgrounded/inactivated while parked on an
  // empty draft — covers the waiter switching apps or locking the phone.
  // LIMITATION: a hard app kill (OS swipe-away or crash) fires no JS event,
  // so that case cannot be reaped from the client and needs a server-side
  // sweep. 'background'/'inactive' is the last hook RN delivers before the
  // process is suspended, so this is the best-effort client-side cover.
  // Returning to 'active' re-arms the reaper so a failed attempt (e.g. while
  // offline) can retry on the next background cycle.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        reapIfEmptyDraft();
      } else if (next === 'active') {
        reapedRef.current = false;
      }
    });
    return () => sub.remove();
  }, [reapIfEmptyDraft]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['orders', orderId] });
  };

  const sendMutation = useMutation({
    mutationFn: () => ordersApi.send(orderId),
    onSuccess: () => { haptics.success(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      // A 409 here means another waiter's draft for this table was sent
      // first (master: 'Bu stolda allaqachon yuborilgan buyurtma bor').
      // Surface the server message — never fail silently — and refresh
      // order/table state so occupancy reflects the new reality.
      invalidate();
      void qc.invalidateQueries({ queryKey: ['tables'] });
      Alert.alert('Xato', err?.message || "Yuborib bo'lmadi");
    },
  });
  const cancelOrderMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.cancel(orderId, reason),
    onSuccess: () => {
      haptics.warning();
      setCancelOrderModal(false);
      setCancelReason('');
      invalidate();
      nav.goBack();
    },
    onError: (err: any) => { haptics.error(); Alert.alert('Xato', err.message || "Bekor qilib bo'lmadi"); },
  });
  const editNoteMutation = useMutation({
    mutationFn: ({ lineId, notes }: { lineId: string; notes: string }) =>
      ordersApi.editLineNote(orderId, lineId, notes),
    onSuccess: () => { haptics.tapLight(); invalidate(); setNoteModal(null); },
    onError: (err: any) => { haptics.error(); Alert.alert('Xato', err.message); },
  });
  const cancelLineMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(orderId, lineId),
    onSuccess: () => { haptics.warning(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      showToast(err.message || "Bekor qilib bo'lmadi", 'error');
    },
  });
  const updateQtyMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(orderId, lineId, quantity),
    onSuccess: () => { haptics.tapLight(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      showToast(err.message || "O'zgartirib bo'lmadi", 'error');
    },
  });
  const transferMutation = useMutation({
    mutationFn: (tableId: string) => ordersApi.transfer(orderId, tableId),
    onSuccess: () => { haptics.success(); invalidate(); setTransferModal(false); },
    onError: (err: any) => { haptics.error(); Alert.alert('Xato', err.message); },
  });

  if (isLoading || !order) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const foodLines = activeLines.filter((l) => l.menuItemKind !== 'SERVICE');
  const serviceLines = activeLines.filter((l) => l.menuItemKind === 'SERVICE');
  const foodSubtotal = foodLines.reduce((s, l) => s + l.price * l.quantity, 0);
  const serviceTotal = serviceLines.reduce((s, l) => s + l.price * l.quantity, 0);
  const subtotal = foodSubtotal + serviceTotal;
  // SENT lines and orders are now editable from the waiter app — backend allows it.
  const isEditable = order.status === 'DRAFT' || order.status === 'SENT';
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const badgeVariant = STATUS_VARIANTS[order.status] || 'slate';

  const openNoteModal = (line: OrderLine) => {
    setNoteText(line.notes ?? '');
    setNoteModal({ lineId: line.id, current: line.notes ?? '' });
  };
  const confirmCancelLine = (line: OrderLine) => {
    Alert.alert('Qatorni bekor qilish', `"${line.nameSnapshot}" ni bekor qilasizmi?`, [
      { text: "Yo'q", style: 'cancel' },
      { text: 'Ha, bekor qil', style: 'destructive', onPress: () => cancelLineMutation.mutate(line.id) },
    ]);
  };
  const handleMinus = (line: OrderLine) => {
    if (offline) {
      showToast("Aloqa yo'q", 'error');
      return;
    }
    if (line.quantity <= 1) {
      confirmCancelLine(line);
    } else {
      updateQtyMutation.mutate({ lineId: line.id, quantity: line.quantity - 1 });
    }
  };
  const handlePlus = (line: OrderLine) => {
    if (offline) {
      showToast("Aloqa yo'q", 'error');
      return;
    }
    updateQtyMutation.mutate({ lineId: line.id, quantity: line.quantity + 1 });
  };
  const requestCancelOrder = () => {
    if (order.status === 'DRAFT') {
      Alert.alert('Qoralamani bekor qilish', "Bu qoralamani bekor qilasizmi?", [
        { text: "Yo'q", style: 'cancel' },
        { text: 'Ha, bekor qil', style: 'destructive', onPress: () => cancelOrderMutation.mutate('Qoralama bekor qilindi') },
      ]);
    } else {
      setCancelOrderModal(true);
    }
  };
  const showOrderMenu = () => {
    Alert.alert('Amallar', undefined, [
      order.orderType === 'DINE_IN' && isEditable
        ? { text: "Stolni o'zgartirish", onPress: () => setTransferModal(true) }
        : null,
      isEditable
        ? { text: 'Buyurtmani bekor qilish', style: 'destructive', onPress: requestCancelOrder }
        : null,
      { text: 'Yopish', style: 'cancel' },
    ].filter(Boolean) as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.headerIconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTable}>{tableLabel}</Text>
          <Badge label={STATUS_LABELS[order.status]} variant={badgeVariant} />
        </View>
        {isEditable ? (
          <TouchableOpacity onPress={showOrderMenu} style={styles.headerIconBtn}>
            <MaterialCommunityIcons name="dots-horizontal" size={24} color={theme.colors.slate[600]} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Tabs */}
      {isEditable && (
        <View style={styles.tabBarContainer}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'order' && styles.tabItemActive]}
              onPress={() => setTab('order')}
            >
              <MaterialCommunityIcons
                name="receipt"
                size={16}
                color={tab === 'order' ? theme.colors.primary : theme.colors.slate[500]}
              />
              <Text style={[styles.tabText, tab === 'order' && styles.tabTextActive]}>Buyurtma</Text>
              {activeLines.length > 0 && (
                <View style={[styles.tabBadge, tab === 'order' ? styles.tabBadgeActive : styles.tabBadgeInactive]}>
                  <Text style={[styles.tabBadgeText, tab === 'order' && styles.tabBadgeTextActive]}>
                    {activeLines.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabItem, tab === 'menu' && styles.tabItemActive]}
              onPress={() => setTab('menu')}
            >
              <MaterialCommunityIcons
                name="silverware-fork-knife"
                size={16}
                color={tab === 'menu' ? theme.colors.primary : theme.colors.slate[500]}
              />
              <Text style={[styles.tabText, tab === 'menu' && styles.tabTextActive]}>Menyu</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {tab === 'menu' && isEditable ? (
          <MenuPanel orderId={orderId} offline={offline} currentLines={order.lines} />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {order.lines.length === 0 ? (
              <View style={styles.emptyOrder}>
                <MaterialCommunityIcons name="cart-outline" size={48} color={theme.colors.slate[300]} />
                <Text style={styles.emptyOrderText}>Mahsulot qo'shilmagan</Text>
                {isEditable && (
                  <View style={styles.emptyActions}>
                    <Button
                      title="Menyudan tanlash"
                      variant="primary"
                      onPress={() => setTab('menu')}
                    />
                    {order.status === 'DRAFT' && (
                      <Button
                        title="Qoralamani bekor qilish"
                        variant="ghost"
                        onPress={requestCancelOrder}
                      />
                    )}
                  </View>
                )}
              </View>
            ) : (
              order.lines.map((line) => {
                const busy =
                  (updateQtyMutation.isPending && updateQtyMutation.variables?.lineId === line.id) ||
                  (cancelLineMutation.isPending && cancelLineMutation.variables === line.id);
                return (
                  <LineRow
                    key={line.id}
                    line={line}
                    canEdit={isEditable && !line.isCanceled && !offline}
                    busy={busy}
                    onPlus={() => handlePlus(line)}
                    onMinus={() => handleMinus(line)}
                    onNote={() => openNoteModal(line)}
                    onCancel={() => confirmCancelLine(line)}
                  />
                );
              })
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
        )}
      </View>

      {/* Bill summary */}
      {tab === 'order' && activeLines.length > 0 && (
        <View style={styles.billSummary}>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Ovqat</Text>
            <Text style={styles.billValue}>{formatUZS(foodSubtotal)} so'm</Text>
          </View>
          {serviceTotal > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, styles.serviceLabel]}>✨ Xizmat haqi</Text>
              <Text style={[styles.billValue, styles.serviceValue]}>{formatUZS(serviceTotal)} so'm</Text>
            </View>
          )}
          <View style={styles.billDivider} />
          <View style={styles.billRow}>
            <Text style={styles.billLabelTotal}>Jami</Text>
            <Text style={styles.billValueTotal}>{formatUZS(subtotal)} so'm</Text>
          </View>
        </View>
      )}

      {/* Footer actions */}
      <View style={styles.footer}>
        {isEditable && tab === 'menu' && (
          <TouchableOpacity
            onPress={() => setTab('order')}
            activeOpacity={0.85}
            style={[styles.cartPill, activeLines.length === 0 && styles.cartPillEmpty]}
          >
            <View style={styles.cartPillLeft}>
              <View style={styles.cartCountBadge}>
                <MaterialCommunityIcons name="receipt" size={18} color={theme.colors.white} />
                {activeLines.length > 0 && (
                  <View style={styles.cartCountDot}>
                    <Text style={styles.cartCountDotText}>{activeLines.length}</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.cartPillTitle}>
                  {activeLines.length === 0 ? 'Buyurtmani ko\'rish' : 'Buyurtmaga o\'tish'}
                </Text>
                <Text style={styles.cartPillSub}>
                  {activeLines.length === 0 ? 'Hech narsa qo\'shilmagan' : `${activeLines.length} ta · ${formatUZS(subtotal)} so'm`}
                </Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={28} color={theme.colors.white} />
          </TouchableOpacity>
        )}

        {order.status === 'DRAFT' && tab === 'order' && (
          <Button
            title="Oshxonaga yuborish"
            variant="primary"
            disabled={activeLines.length === 0 || offline}
            loading={sendMutation.isPending}
            onPress={() => Alert.alert('Yuborish', 'Buyurtmani oshxonaga yuborasizmi?', [
              { text: "Yo'q", style: 'cancel' },
              { text: 'Ha', onPress: () => sendMutation.mutate() },
            ])}
            style={styles.footerMainBtn}
          />
        )}

        {order.status === 'SENT' && tab === 'order' && (
          <View style={styles.sentFooter}>
            <View style={styles.sentInfo}>
              <MaterialCommunityIcons name="clock-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.sentInfoText}>Kassir tasdiqlashi kutilmoqda</Text>
            </View>
            <Button
              title="Yana qo'shish"
              variant="outline"
              onPress={() => setTab('menu')}
              style={styles.sentAddBtn}
            />
          </View>
        )}

        {!isEditable && tab === 'order' && (
          <View style={styles.waitingContainer}>
            <Badge label={STATUS_LABELS[order.status]} variant={badgeVariant} outline />
          </View>
        )}
      </View>

      {/* Note modal */}
      <Modal visible={!!noteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalBox}>
            <Text style={styles.modalTitle}>Eslatma qo'shish</Text>
            <Input
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Masalan: Tuz kam bo'lsin, achchiq emas..."
              multiline
              autoFocus
              inputStyle={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <View style={styles.modalBtns}>
              <Button
                title="Bekor"
                variant="secondary"
                onPress={() => setNoteModal(null)}
                style={styles.flex1}
              />
              <Button
                title="Saqlash"
                loading={editNoteMutation.isPending}
                onPress={() => noteModal && editNoteMutation.mutate({ lineId: noteModal.lineId, notes: noteText })}
                style={styles.flex1}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Cancel order modal */}
      <Modal visible={cancelOrderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalBox}>
            <Text style={styles.modalTitle}>Buyurtmani bekor qilish</Text>
            <Text style={styles.modalSubtitle}>
              {order.status === 'SENT'
                ? 'Buyurtma allaqachon yuborilgan. Bekor qilish sababi muhim.'
                : 'Bekor qilish sababini kiriting.'}
            </Text>
            <Input
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Bekor qilish sababi..."
              autoFocus
            />
            <View style={styles.modalBtns}>
              <Button
                title="Orqaga"
                variant="secondary"
                onPress={() => { setCancelOrderModal(false); setCancelReason(''); }}
                style={styles.flex1}
              />
              <Button
                title="Bekor qilish"
                variant="danger"
                loading={cancelOrderMutation.isPending}
                onPress={() => cancelOrderMutation.mutate(cancelReason || "Sabab ko'rsatilmadi")}
                style={styles.flex1}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Transfer table modal */}
      <Modal visible={transferModal} transparent animationType="slide">
        <View style={styles.transferOverlay}>
          <View style={styles.transferBox}>
            <View style={styles.transferHeader}>
              <Text style={styles.modalTitle}>Stolni o'zgartirish</Text>
              <TouchableOpacity onPress={() => setTransferModal(false)} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={24} color={theme.colors.slate[400]} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={tables.filter((t) => t.isActive && t.id !== order.tableId)}
              keyExtractor={(t) => t.id}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                // activeOrderId is SENT-only (master contract): a table held
                // by another waiter's unsent draft stays a valid transfer target.
                const occupied = !!item.activeOrderId;
                return (
                  <TouchableOpacity
                    style={[styles.tableCell, occupied && styles.tableCellOccupied]}
                    onPress={() => !occupied && transferMutation.mutate(item.id)}
                    disabled={occupied || transferMutation.isPending}
                    activeOpacity={occupied ? 1 : 0.7}
                  >
                    <Text style={[styles.tableCellName, occupied && styles.tableCellMuted]}>{item.name}</Text>
                    <Text style={[styles.tableCellStatus, occupied && styles.tableCellMuted]}>
                      {occupied ? 'Band' : "Bo'sh"}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.slate[50] },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg, paddingTop: Platform.OS === 'ios' ? 60 : 44, paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.white, borderBottomWidth: 1, borderBottomColor: theme.colors.slate[100],
  },
  headerIconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTable: { ...theme.typography.h3, color: theme.colors.slate[900] },

  tabBarContainer: {
    backgroundColor: theme.colors.white,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.slate[100],
    borderRadius: 12,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
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
    minWidth: 20, height: 20, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  tabBadgeInactive: { backgroundColor: theme.colors.slate[200] },
  tabBadgeActive: { backgroundColor: theme.colors.primary },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: theme.colors.slate[600] },
  tabBadgeTextActive: { color: theme.colors.white },

  content: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: 32 },

  emptyOrder: { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyOrderText: { ...theme.typography.body, color: theme.colors.slate[400] },
  emptyActions: { gap: 8, width: '100%', maxWidth: 280 },

  billSummary: {
    backgroundColor: theme.colors.white,
    borderTopWidth: 1,
    borderTopColor: theme.colors.slate[100],
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: 6,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: { fontSize: 14, color: theme.colors.slate[600] },
  billValue: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.slate[800],
    fontVariant: ['tabular-nums'],
  },
  serviceLabel: { color: theme.colors.success, fontWeight: '600' },
  serviceValue: { color: theme.colors.success },
  billDivider: {
    height: 1,
    backgroundColor: theme.colors.slate[200],
    marginVertical: 2,
  },
  billLabelTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.slate[900],
  },
  billValueTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },

  footer: {
    flexDirection: 'row', padding: theme.spacing.lg, gap: 12,
    backgroundColor: theme.colors.white, borderTopWidth: 1, borderTopColor: theme.colors.slate[100],
    paddingBottom: Platform.OS === 'ios' ? 34 : theme.spacing.lg,
  },
  footerSecondaryBtn: { flex: 1 },
  footerMainBtn: { flex: 1 },

  cartPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    ...theme.shadows.md,
  },
  cartPillEmpty: { backgroundColor: theme.colors.slate[400] },
  cartPillLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  cartCountBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartCountDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.warning,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  cartCountDotText: { fontSize: 11, fontWeight: '900', color: theme.colors.white },
  cartPillTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.white },
  cartPillSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2, fontVariant: ['tabular-nums'] },

  sentFooter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryLight,
  },
  sentInfoText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
  sentAddBtn: { flex: 0.7 },

  waitingContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 12, backgroundColor: theme.colors.slate[50],
    borderWidth: 1, borderColor: theme.colors.slate[100],
  },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.slate[900],
    justifyContent: 'center', padding: 24,
  },
  modalBox: { padding: 24 },
  modalTitle: { ...theme.typography.h3, color: theme.colors.slate[900], marginBottom: 12 },
  modalSubtitle: { fontSize: 13, color: theme.colors.slate[500], marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 16 },
  flex1: { flex: 1 },

  transferOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.slate[900], justifyContent: 'flex-end',
  },
  transferBox: {
    backgroundColor: theme.colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  transferHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  closeBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22, backgroundColor: theme.colors.slate[50] },
  tableCell: {
    flex: 1, margin: 6, aspectRatio: 1,
    backgroundColor: theme.colors.primaryLight, borderRadius: 16,
    borderWidth: 2, borderColor: theme.colors.primary,
    justifyContent: 'center', alignItems: 'center', maxWidth: '30%',
  },
  tableCellOccupied: { backgroundColor: theme.colors.slate[50], borderColor: theme.colors.slate[200] },
  tableCellName: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  tableCellMuted: { color: theme.colors.slate[300] },
  tableCellStatus: { fontSize: 12, color: theme.colors.primary, marginTop: 4, fontWeight: '600' },
});
