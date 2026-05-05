import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { tablesApi } from '../api/tables';
import { ordersApi } from '../api/orders';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList, 'NewOrder'>;

export function NewOrderScreen() {
  const nav = useNavigation<Nav>();
  const status = useConnectionStore((s) => s.status);
  const actionsDisabled = status !== 'online';
  const [step, setStep] = useState<'type' | 'table'>('type');

  const { data: tables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.list,
    enabled: step === 'table',
  });

  const createMutation = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: (order) => {
      nav.replace('OrderEdit', { orderId: order.id });
    },
    onError: (err: any) => {
      Alert.alert('Xato', err.message || "Buyurtma yaratib bo'lmadi");
    },
  });

  const handleTakeaway = () => {
    createMutation.mutate({ orderType: 'TAKEAWAY' });
  };

  const handleTableSelect = (tableId: string) => {
    createMutation.mutate({ orderType: 'DINE_IN', tableId });
  };

  const activeTables = tables.filter((t) => t.isActive);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 'table' ? setStep('type') : nav.goBack())} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'type' ? 'Yangi buyurtma' : 'Stol tanlang'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {createMutation.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      )}

      {step === 'type' ? (
        <View style={styles.typeContainer}>
          <TouchableOpacity
            style={[styles.typeBtn, actionsDisabled && styles.btnDisabled]}
            onPress={() => setStep('table')}
            disabled={actionsDisabled}
          >
            <Text style={styles.typeBtnIcon}>🍽</Text>
            <Text style={styles.typeBtnText}>Zalda</Text>
            <Text style={styles.typeBtnSub}>Dine-in</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeBtn, actionsDisabled && styles.btnDisabled]}
            onPress={handleTakeaway}
            disabled={actionsDisabled || createMutation.isPending}
          >
            <Text style={styles.typeBtnIcon}>🛍</Text>
            <Text style={styles.typeBtnText}>Olib ketish</Text>
            <Text style={styles.typeBtnSub}>Takeaway</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.tableContainer}>
          {loadingTables ? (
            <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={activeTables}
              keyExtractor={(t) => t.id}
              numColumns={3}
              contentContainerStyle={styles.tableGrid}
              renderItem={({ item }) => {
                const occupied = !!item.activeOrderId;
                return (
                  <TouchableOpacity
                    style={[styles.tableCell, occupied && styles.tableCellOccupied]}
                    onPress={() => !occupied && handleTableSelect(item.id)}
                    disabled={occupied || createMutation.isPending}
                    activeOpacity={occupied ? 1 : 0.7}
                  >
                    <Text style={[styles.tableName, occupied && styles.tableNameOccupied]}>
                      {item.name}
                    </Text>
                    <Text style={[styles.tableStatus, occupied && styles.tableStatusOccupied]}>
                      {occupied ? 'Band' : "Bo'sh"}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backText: { fontSize: 22, color: '#2563eb' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  offlineBanner: { backgroundColor: '#dc2626', paddingVertical: 6, alignItems: 'center' },
  offlineText: { color: '#fff', fontWeight: '600' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  typeContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    maxWidth: 160,
  },
  btnDisabled: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  typeBtnIcon: { fontSize: 40, marginBottom: 10 },
  typeBtnText: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 4 },
  typeBtnSub: { fontSize: 13, color: '#6b7280' },
  tableContainer: { flex: 1 },
  tableGrid: { padding: 16, gap: 10 },
  tableCell: {
    flex: 1,
    margin: 5,
    aspectRatio: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '30%',
  },
  tableCellOccupied: { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' },
  tableName: { fontSize: 15, fontWeight: '700', color: '#1e40af' },
  tableNameOccupied: { color: '#9ca3af' },
  tableStatus: { fontSize: 12, color: '#2563eb', marginTop: 4 },
  tableStatusOccupied: { color: '#9ca3af' },
});
