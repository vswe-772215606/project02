import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { tablesApi } from '../api/tables';
import { ordersApi } from '../api/orders';
import { useConnectionStore } from '../stores/connection.store';
import { RootStackParamList } from '../navigation/AppNavigator';
import { theme } from '../lib/theme';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { haptics } from '../lib/haptics';

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
      haptics.success();
      nav.replace('OrderEdit', { orderId: order.id });
    },
    onError: (err: any) => {
      haptics.error();
      Alert.alert('Xato', err.message || "Buyurtma yaratib bo'lmadi");
    },
  });

  const handleTakeaway = () => {
    haptics.tapMedium();
    createMutation.mutate({ orderType: 'TAKEAWAY' });
  };

  const handleTableSelect = (tableId: string) => {
    haptics.tapMedium();
    createMutation.mutate({ orderType: 'DINE_IN', tableId });
  };

  const activeTables = tables.filter((t) => t.isActive);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (step === 'table' ? setStep('type') : nav.goBack())} style={styles.headerIconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'type' ? 'Yangi buyurtma' : 'Stol tanlang'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {createMutation.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {step === 'type' ? (
        <View style={styles.typeContainer}>
          <Card
            style={[styles.typeBtn, actionsDisabled && styles.btnDisabled]}
            onPress={() => setStep('table')}
          >
            <MaterialCommunityIcons name="silverware-fork-knife" size={48} color={theme.colors.primary} style={styles.typeIcon} />
            <Text style={styles.typeBtnText}>Zalda</Text>
            <Text style={styles.typeBtnSub}>Stolda</Text>
          </Card>

          <Card
            style={[styles.typeBtn, actionsDisabled && styles.btnDisabled]}
            onPress={handleTakeaway}
          >
            <MaterialCommunityIcons name="shopping-outline" size={48} color={theme.colors.primary} style={styles.typeIcon} />
            <Text style={styles.typeBtnText}>Olib ketish</Text>
            <Text style={styles.typeBtnSub}>Tashqariga</Text>
          </Card>
        </View>
      ) : (
        <View style={styles.tableContainer}>
          {loadingTables ? (
            <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={activeTables}
              keyExtractor={(t) => t.id}
              numColumns={3}
              contentContainerStyle={styles.tableGrid}
              renderItem={({ item }) => {
                // activeOrderId is SENT-only (master contract): a table held
                // by another waiter's unsent draft stays free/selectable.
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
  container: { flex: 1, backgroundColor: theme.colors.slate[50] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
  },
  headerIconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerIconText: { fontSize: 24, color: theme.colors.primary },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.slate[900] },
  
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
    gap: 20,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeBtn: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    maxWidth: 160,
    height: 180,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  typeIcon: { marginBottom: 12 },
  typeBtnText: { fontSize: 18, fontWeight: '800', color: theme.colors.slate[900], marginBottom: 4 },
  typeBtnSub: { fontSize: 13, color: theme.colors.slate[400] },
  tableContainer: { flex: 1 },
  tableGrid: { padding: 16, gap: 10 },
  tableCell: {
    flex: 1,
    margin: 6,
    aspectRatio: 1,
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    maxWidth: '30%',
    ...theme.shadows.sm,
  },
  tableCellOccupied: { backgroundColor: theme.colors.slate[50], borderColor: theme.colors.slate[200], elevation: 0, shadowOpacity: 0 },
  tableName: { fontSize: 16, fontWeight: '800', color: theme.colors.primary },
  tableNameOccupied: { color: theme.colors.slate[300] },
  tableStatus: { fontSize: 12, color: theme.colors.primary, marginTop: 4, fontWeight: '600' },
  tableStatusOccupied: { color: theme.colors.slate[300] },
});
