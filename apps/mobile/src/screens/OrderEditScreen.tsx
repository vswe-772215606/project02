import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal,
  TextInput, ActivityIndicator, FlatList,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ordersApi, Order, OrderLine, STATUS_LABELS, TICKET_LABELS, TicketStatus } from '../api/orders';
import { tablesApi } from '../api/tables';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { formatUZS } from '../lib/format';
import { MenuPanel } from '../components/MenuPanel';

type Nav = NativeStackNavigationProp<RootStackParamList, 'OrderEdit'>;
type Route = RouteProp<RootStackParamList, 'OrderEdit'>;

const TICKET_COLORS: Record<TicketStatus, string> = {
  PENDING: '#6b7280',
  IN_PROGRESS: '#d97706',
  READY: '#16a34a',
  CANCELED: '#dc2626',
};
const STATUS_BADGE_COLORS: Record<string, string> = {
  DRAFT: '#d97706',
  SENT: '#2563eb',
  BILL_REQUESTED: '#7c3aed',
  PENDING_PAYMENT: '#475569',
  CLOSED: '#15803d',
  WALKOUT: '#dc2626',
  CANCELED: '#9ca3af',
};

function LineRow({
  line, canEditNote, canCancelLine, onNote, onCancel,
}: {
  line: OrderLine; canEditNote: boolean; canCancelLine: boolean;
  onNote: () => void; onCancel: () => void;
}) {
  const ticketStatus = line.kitchenTicket?.status;

  if (line.isCanceled) {
    return (
      <View style={[styles.lineRow, styles.lineRowCanceled]}>
        <Text style={styles.lineCanceledText}>{line.name} × {line.quantity} — Bekor qilindi</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.lineRow}
      onPress={() => {
        Alert.alert(line.name, undefined, [
          { text: canEditNote ? 'Eslatma tahrirlash' : 'Eslatma (mumkin emas)', onPress: canEditNote ? onNote : undefined },
          { text: canCancelLine ? 'Qatorni bekor qilish' : 'Bekor qilish (mumkin emas)', style: 'destructive', onPress: canCancelLine ? onCancel : undefined },
          { text: '✕', style: 'cancel' },
        ]);
      }}
    >
      <View style={styles.lineMain}>
        <Text style={styles.lineName}>{line.name} × {line.quantity}</Text>
        {ticketStatus && (
          <View style={[styles.ticketBadge, { backgroundColor: TICKET_COLORS[ticketStatus] }]}>
            <Text style={styles.ticketBadgeText}>{TICKET_LABELS[ticketStatus]}</Text>
          </View>
        )}
      </View>
      <Text style={styles.linePrice}>
        {formatUZS(line.price)} × {line.quantity} = {formatUZS(line.price * line.quantity)} so'm
      </Text>
      {line.notes ? <Text style={styles.lineNote}>📝 {line.notes}</Text> : null}
      {line.comboNameSnapshot ? <Text style={styles.lineCombo}>Set: {line.comboNameSnapshot}</Text> : null}
    </TouchableOpacity>
  );
}

export function OrderEditScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { orderId } = route.params;
  const qc = useQueryClient();
  const offline = useConnectionStore((s) => s.status) !== 'online';

  const [tab, setTab] = useState<'order' | 'menu'>('order');
  const [noteModal, setNoteModal] = useState<{ lineId: string; current: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [cancelOrderModal, setCancelOrderModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [transferModal, setTransferModal] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.getById(orderId),
    refetchInterval: 15_000,
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

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['orders', orderId] });
  };

  const sendMutation = useMutation({
    mutationFn: () => ordersApi.send(orderId),
    onSuccess: invalidate,
    onError: (err: any) => Alert.alert('Xato', err.message || "Yuborib bo'lmadi"),
  });
  const billMutation = useMutation({
    mutationFn: () => ordersApi.requestBill(orderId),
    onSuccess: invalidate,
    onError: (err: any) => Alert.alert('Xato', err.message || "Hisob so'rab bo'lmadi"),
  });
  const cancelOrderMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.cancel(orderId, reason),
    onSuccess: () => { invalidate(); nav.goBack(); },
    onError: (err: any) => Alert.alert('Xato', err.message || "Bekor qilib bo'lmadi"),
  });
  const editNoteMutation = useMutation({
    mutationFn: ({ lineId, notes }: { lineId: string; notes: string }) =>
      ordersApi.editLineNote(orderId, lineId, notes),
    onSuccess: () => { invalidate(); setNoteModal(null); },
    onError: (err: any) => Alert.alert('Xato', err.message),
  });
  const cancelLineMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(orderId, lineId),
    onSuccess: invalidate,
    onError: (err: any) => Alert.alert('Xato', err.message),
  });
  const transferMutation = useMutation({
    mutationFn: (tableId: string) => ordersApi.transfer(orderId, tableId),
    onSuccess: () => { invalidate(); setTransferModal(false); },
    onError: (err: any) => Alert.alert('Xato', err.message),
  });

  if (isLoading || !order) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const activeLines = order.lines.filter((l) => !l.isCanceled);
  const subtotal = activeLines.reduce((s, l) => s + l.price * l.quantity, 0);
  const allTicketsPending = order.kitchenTickets.every((t) => t.status === 'PENDING');
  const canCancel = allTicketsPending && ['DRAFT', 'SENT', 'BILL_REQUESTED'].includes(order.status);
  const isEditable = ['DRAFT', 'SENT', 'BILL_REQUESTED'].includes(order.status);
  const tableLabel = order.orderType === 'TAKEAWAY' ? 'Olib ketish' : (order.table?.name ?? 'Stol');
  const badgeColor = STATUS_BADGE_COLORS[order.status] ?? '#475569';

  const openNoteModal = (line: OrderLine) => {
    setNoteText(line.notes ?? '');
    setNoteModal({ lineId: line.id, current: line.notes ?? '' });
  };
  const openCancelLine = (line: OrderLine) => {
    Alert.alert('Qatorni bekor qilish', `"${line.name}" ni bekor qilasizmi?`, [
      { text: "Yo'q", style: 'cancel' },
      { text: 'Ha', style: 'destructive', onPress: () => cancelLineMutation.mutate(line.id) },
    ]);
  };
  const showOrderMenu = () => {
    Alert.alert('Amallar', undefined, [
      order.orderType === 'DINE_IN' && isEditable
        ? { text: "Stolni o'zgartirish", onPress: () => setTransferModal(true) }
        : null,
      canCancel
        ? { text: 'Buyurtmani bekor qilish', style: 'destructive', onPress: () => setCancelOrderModal(true) }
        : null,
      { text: 'Yopish', style: 'cancel' },
    ].filter(Boolean) as any);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTable}>{tableLabel}</Text>
          <View style={[styles.statusBadge, { backgroundColor: badgeColor }]}>
            <Text style={styles.statusBadgeText}>{STATUS_LABELS[order.status]}</Text>
          </View>
        </View>
        {isEditable ? (
          <TouchableOpacity onPress={showOrderMenu} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>···</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* Tabs */}
      {isEditable && (
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'order' && styles.tabBtnActive]}
            onPress={() => setTab('order')}
          >
            <Text style={[styles.tabLabel, tab === 'order' && styles.tabLabelActive]}>
              Buyurtma
            </Text>
            {activeLines.length > 0 && (
              <View style={[styles.tabBadge, tab === 'order' && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === 'order' && styles.tabBadgeTextActive]}>
                  {activeLines.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'menu' && styles.tabBtnActive]}
            onPress={() => setTab('menu')}
          >
            <Text style={[styles.tabLabel, tab === 'menu' && styles.tabLabelActive]}>Menyu</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      {tab === 'menu' && isEditable ? (
        <MenuPanel orderId={orderId} offline={offline} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {order.lines.length === 0 ? (
            <View style={styles.emptyOrder}>
              <Text style={styles.emptyOrderText}>Mahsulot qo'shilmagan</Text>
              {isEditable && (
                <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setTab('menu')}>
                  <Text style={styles.emptyAddBtnText}>Menyudan tanlash →</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            order.lines.map((line) => {
              const canEditNote = !line.isCanceled &&
                (!line.kitchenTicket || line.kitchenTicket.status === 'PENDING');
              return (
                <LineRow
                  key={line.id}
                  line={line}
                  canEditNote={canEditNote && !offline}
                  canCancelLine={!line.isCanceled && allTicketsPending && !offline}
                  onNote={() => openNoteModal(line)}
                  onCancel={() => openCancelLine(line)}
                />
              );
            })
          )}
          {activeLines.length > 0 && (
            <View style={styles.subtotalRow}>
              <Text style={styles.subtotalLabel}>Jami:</Text>
              <Text style={styles.subtotalValue}>{formatUZS(subtotal)} so'm</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Action footer */}
      <View style={styles.footer}>
        {isEditable && tab === 'menu' && (
          <TouchableOpacity style={styles.footerOrderBtn} onPress={() => setTab('order')}>
            <Text style={styles.footerOrderBtnText}>
              Buyurtma{activeLines.length > 0 ? ` (${activeLines.length})` : ''}
            </Text>
          </TouchableOpacity>
        )}

        {order.status === 'DRAFT' && (
          <TouchableOpacity
            style={[styles.footerActionBtn, styles.sendBtn,
              (activeLines.length === 0 || offline || sendMutation.isPending) && styles.btnDisabled]}
            onPress={() => Alert.alert('Yuborish', 'Buyurtmani oshxonaga yuborasizmi?', [
              { text: "Yo'q", style: 'cancel' },
              { text: 'Ha', onPress: () => sendMutation.mutate() },
            ])}
            disabled={activeLines.length === 0 || offline || sendMutation.isPending}
          >
            {sendMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.footerActionText}>Yuborish</Text>}
          </TouchableOpacity>
        )}
        {order.status === 'SENT' && (
          <TouchableOpacity
            style={[styles.footerActionBtn, styles.billBtn, (offline || billMutation.isPending) && styles.btnDisabled]}
            onPress={() => Alert.alert("Hisob so'rash", "Tasdiqlaysizmi?", [
              { text: "Yo'q", style: 'cancel' },
              { text: 'Ha', onPress: () => billMutation.mutate() },
            ])}
            disabled={offline || billMutation.isPending}
          >
            {billMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.footerActionText}>Hisob so'rash</Text>}
          </TouchableOpacity>
        )}
        {order.status === 'BILL_REQUESTED' && (
          <View style={[styles.footerActionBtn, styles.waitingBtn]}>
            <Text style={styles.waitingText}>Kassir tasdiqlashi kutilmoqda</Text>
          </View>
        )}
        {!isEditable && (
          <View style={[styles.footerActionBtn, styles.waitingBtn]}>
            <Text style={styles.waitingText}>{STATUS_LABELS[order.status]}</Text>
          </View>
        )}
      </View>

      {/* Note modal */}
      <Modal visible={!!noteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Eslatma</Text>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Masalan: Tuz kam, achchiq emas..."
              multiline
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNoteModal(null)}>
                <Text style={styles.modalCancelText}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, editNoteMutation.isPending && styles.btnDisabled]}
                onPress={() => noteModal && editNoteMutation.mutate({ lineId: noteModal.lineId, notes: noteText })}
                disabled={editNoteMutation.isPending}
              >
                {editNoteMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Saqlash</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Cancel order modal */}
      <Modal visible={cancelOrderModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Buyurtmani bekor qilish</Text>
            <TextInput
              style={styles.noteInput}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Sabab (ixtiyoriy)"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setCancelOrderModal(false); setCancelReason(''); }}>
                <Text style={styles.modalCancelText}>Bekor</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDeleteBtn, cancelOrderMutation.isPending && styles.btnDisabled]}
                onPress={() => cancelOrderMutation.mutate(cancelReason || 'Sabab ko\'rsatilmadi')}
                disabled={cancelOrderMutation.isPending}
              >
                {cancelOrderMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Bekor qilish</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transfer table modal */}
      <Modal visible={transferModal} transparent animationType="slide">
        <View style={styles.transferOverlay}>
          <View style={styles.transferBox}>
            <View style={styles.transferHeader}>
              <Text style={styles.modalTitle}>Stol tanlang</Text>
              <TouchableOpacity onPress={() => setTransferModal(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={tables.filter((t) => t.isActive && t.id !== order.tableId)}
              keyExtractor={(t) => t.id}
              numColumns={3}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
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
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: '#2563eb' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTable: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  moreBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  moreBtnText: { fontSize: 22, color: '#374151', letterSpacing: 2 },

  offlineBanner: { backgroundColor: '#dc2626', paddingVertical: 6, alignItems: 'center' },
  offlineText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#f3f4f6',
  },
  tabBtnActive: { backgroundColor: '#2563eb' },
  tabLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  tabLabelActive: { color: '#fff' },
  tabBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#d1d5db',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4,
  },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#374151' },
  tabBadgeTextActive: { color: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 16 },

  emptyOrder: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyOrderText: { color: '#9ca3af', fontSize: 16 },
  emptyAddBtn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  lineRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb',
  },
  lineRowCanceled: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  lineMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  lineName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  lineCanceledText: { color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
  linePrice: { fontSize: 13, color: '#6b7280' },
  lineNote: { fontSize: 12, color: '#7c3aed', marginTop: 4, fontStyle: 'italic' },
  lineCombo: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  ticketBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 },
  ticketBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  subtotalRow: {
    flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4, gap: 8,
  },
  subtotalLabel: { fontSize: 15, color: '#374151', fontWeight: '600' },
  subtotalValue: { fontSize: 18, fontWeight: '800', color: '#111827' },

  footer: {
    flexDirection: 'row', padding: 12, gap: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  footerOrderBtn: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 10, backgroundColor: '#f3f4f6',
    borderWidth: 1, borderColor: '#d1d5db',
    justifyContent: 'center', alignItems: 'center',
  },
  footerOrderBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  footerActionBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  footerActionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sendBtn: { backgroundColor: '#16a34a' },
  billBtn: { backgroundColor: '#7c3aed' },
  waitingBtn: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#d1d5db' },
  waitingText: { color: '#6b7280', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  btnDisabled: { backgroundColor: '#9ca3af' },

  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', padding: 24,
  },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 14 },
  noteInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 12, fontSize: 15, minHeight: 80,
    textAlignVertical: 'top', marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    backgroundColor: '#f3f4f6', alignItems: 'center',
  },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalSaveBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    backgroundColor: '#2563eb', alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700' },
  modalDeleteBtn: {
    flex: 1, borderRadius: 8, paddingVertical: 12,
    backgroundColor: '#dc2626', alignItems: 'center',
  },

  transferOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  transferBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '80%',
  },
  transferHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
  },
  closeText: { fontSize: 20, color: '#6b7280', padding: 4 },
  tableCell: {
    flex: 1, margin: 5, aspectRatio: 1,
    backgroundColor: '#eff6ff', borderRadius: 12,
    borderWidth: 2, borderColor: '#2563eb',
    justifyContent: 'center', alignItems: 'center', maxWidth: '30%',
  },
  tableCellOccupied: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  tableCellName: { fontSize: 14, fontWeight: '700', color: '#1e40af' },
  tableCellMuted: { color: '#9ca3af' },
  tableCellStatus: { fontSize: 11, color: '#2563eb', marginTop: 2 },
});
