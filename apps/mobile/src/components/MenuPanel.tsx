import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { menuApi, MenuItem, Combo } from "../api/menu";
import { ordersApi } from "../api/orders";
import { useToastStore } from "../stores/toast.store";
import { formatUZS } from "../lib/format";
import { theme } from "../lib/theme";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";

function stockLabel(item: MenuItem): { label: string; variant: 'danger' | 'warning' } | null {
  if (!item.trackStock || item.todayCurrentCount === null) return null;
  if (item.todayCurrentCount <= 0) return { label: "Tugagan", variant: 'danger' };
  if (item.todayCurrentCount <= 5) return { label: `${item.todayCurrentCount} ta qoldi`, variant: 'warning' };
  return null;
}

function ItemCard({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const available = item.effectivelyAvailable;
  const stock = stockLabel(item);
  
  return (
    <Card
      style={[styles.itemCard, !available && styles.itemCardUnavailable]}
      onPress={available ? onPress : undefined}
      variant={available ? 'elevated' : 'outlined'}
    >
      <View style={styles.itemContent}>
        <Text style={[styles.itemName, !available && styles.textMuted]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.itemPrice, !available && styles.textMuted]}>
          {formatUZS(item.price)}
        </Text>
      </View>
      
      <View style={styles.itemFooter}>
        {stock && (
          <Badge label={stock.label} variant={stock.variant} style={styles.stockBadge} />
        )}
        {!available && !stock && (
          <Badge label="Mavjud emas" variant="slate" style={styles.stockBadge} />
        )}
      </View>
    </Card>
  );
}

function ComboCard({ combo, onPress }: { combo: Combo; onPress: () => void }) {
  const total = combo.components.reduce(
    (s, c) => s + c.menuItem.price * c.quantity,
    0,
  );
  return (
    <Card style={styles.comboCard} onPress={onPress}>
      <View style={styles.comboHeader}>
        <Text style={styles.comboName} numberOfLines={1}>{combo.name}</Text>
        <Badge label="SET" variant="info" />
      </View>
      
      <Text style={styles.comboItems} numberOfLines={2}>
        {combo.components
          .map((c) => `${c.menuItem.name} × ${c.quantity}`)
          .join("  ·  ")}
      </Text>
      
      <View style={styles.comboFooter}>
        <Text style={styles.comboPrice}>{formatUZS(total)} so'm</Text>
      </View>
    </Card>
  );
}

export function MenuPanel({
  orderId,
  offline,
}: {
  orderId: string;
  offline: boolean;
}) {
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [itemModal, setItemModal] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [itemNote, setItemNote] = useState("");

  const {
    data: menuData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["menu"],
    queryFn: menuApi.list,
    staleTime: 30_000,
  });
  const { data: combos = [] } = useQuery({
    queryKey: ["combos"],
    queryFn: menuApi.combos,
    staleTime: 30_000,
  });
  const categories = menuData?.categories ?? [];
  const activeCombos = combos.filter((c) => c.isActive);
  const currentCatId = activeCatId ?? categories[0]?.id ?? null;
  const currentCat = categories.find((c) => c.id === currentCatId);

  const dismissModal = () => {
    setItemModal(null);
    setQuantity(1);
    setItemNote("");
  };

  const addItemMutation = useMutation({
    mutationFn: ({
      menuItemId,
      qty,
      notes,
    }: {
      menuItemId: string;
      qty: number;
      notes: string;
    }) =>
      ordersApi.addItem(orderId, {
        menuItemId,
        quantity: qty,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orders", orderId] });
      dismissModal();
    },
    onError: (err: any) => {
      const code = err.code ?? err.message;
      if (code === "OUT_OF_STOCK") {
        showToast("Bu mahsulot tugagan", "error");
        void qc.invalidateQueries({ queryKey: ["menu"] });
      } else if (code === "ITEM_UNAVAILABLE") {
        showToast("Bu mahsulot mavjud emas", "error");
        void qc.invalidateQueries({ queryKey: ["menu"] });
      } else {
        showToast(err.message || "Qo'shib bo'lmadi", "error");
      }
      dismissModal();
    },
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["orders", orderId] }),
    onError: (err: any) =>
      showToast(err.message || "Set qo'shib bo'lmadi", "error"),
  });

  const openItem = (item: MenuItem) => {
    if (offline) return;
    setItemModal(item);
    setQuantity(1);
    setItemNote("");
  };

  const handleAddCombo = (combo: Combo) => {
    if (offline) return;
    Alert.alert(
      combo.name,
      combo.components
        .map((c) => `${c.menuItem.name} × ${c.quantity}`)
        .join("\n"),
      [
        { text: "Bekor", style: "cancel" },
        { text: "Qo'shish", onPress: () => addComboMutation.mutate(combo.id) },
      ],
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Menyu yuklab bo'lmadi</Text>
        <Text style={styles.errSub}>Server bilan aloqani tekshiring</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Category tabs */}
      <View style={styles.catBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catBar}
          contentContainerStyle={styles.catBarContent}
        >
          {activeCombos.length > 0 && (
            <TouchableOpacity
              style={[styles.catTab, showCombos && styles.catTabActive]}
              onPress={() => setShowCombos(true)}
            >
              <Text
                style={[styles.catTabText, showCombos && styles.catTabTextActive]}
              >
                Set menyu
              </Text>
            </TouchableOpacity>
          )}
          {categories.map((cat) => {
            const active = !showCombos && currentCatId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catTab, active && styles.catTabActive]}
                onPress={() => {
                  setActiveCatId(cat.id);
                  setShowCombos(false);
                }}
              >
                <Text
                  style={[styles.catTabText, active && styles.catTabTextActive]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Items Grid */}
      <View style={styles.gridContainer}>
        {showCombos ? (
          <FlatList
            key="combos"
            data={activeCombos}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ComboCard combo={item} onPress={() => handleAddCombo(item)} />
            )}
          />
        ) : (
          <FlatList
            key="items"
            data={currentCat?.items ?? []}
            keyExtractor={(i) => i.id}
            numColumns={2}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ItemCard item={item} onPress={() => openItem(item)} />
            )}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Bu kategoriyada mahsulot yo'q</Text>
              </View>
            }
          />
        )}
      </View>

      {/* Add item modal */}
      <Modal visible={!!itemModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <Card style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalName}>{itemModal?.name}</Text>
              <Text style={styles.modalPrice}>
                {formatUZS((itemModal?.price ?? 0) * quantity)} so'm
              </Text>
            </View>

            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <MaterialCommunityIcons name="minus" size={32} color={theme.colors.slate[800]} />
              </TouchableOpacity>
              <View style={styles.qtyValContainer}>
                <Text style={styles.qtyVal}>{quantity}</Text>
              </View>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => q + 1)}
              >
                <MaterialCommunityIcons name="plus" size={32} color={theme.colors.slate[800]} />
              </TouchableOpacity>
            </View>

            <Input
              value={itemNote}
              onChangeText={setItemNote}
              placeholder="Eslatma (masalan: piyozsiz)"
              containerStyle={styles.noteInput}
            />

            <View style={styles.modalBtns}>
              <Button
                title="Bekor"
                variant="secondary"
                onPress={dismissModal}
                style={styles.flex1}
              />
              <Button
                title="Qo'shish"
                variant="primary"
                loading={addItemMutation.isPending}
                onPress={() =>
                  itemModal &&
                  addItemMutation.mutate({
                    menuItemId: itemModal.id,
                    qty: quantity,
                    notes: itemNote,
                  })
                }
                style={styles.flex2}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.slate[50] },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  errText: { ...theme.typography.h3, color: theme.colors.danger },
  errSub: { ...theme.typography.caption, marginTop: 4 },

  catBarContainer: {
    backgroundColor: theme.colors.white,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.slate[100],
  },
  catBar: { flexShrink: 0 },
  catBarContent: { paddingHorizontal: theme.spacing.md },
  catTab: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  catTabActive: { borderBottomColor: theme.colors.primary },
  catTabText: { fontSize: 14, fontWeight: "700", color: theme.colors.slate[500] },
  catTabTextActive: { color: theme.colors.primary },

  gridContainer: { flex: 1 },
  list: { padding: theme.spacing.md, paddingBottom: 40 },
  
  itemCard: {
    flex: 1,
    margin: 6,
    padding: theme.spacing.md,
    height: 120,
    justifyContent: 'space-between',
  },
  itemCardUnavailable: { opacity: 0.5, backgroundColor: theme.colors.slate[50] },
  itemContent: { flex: 1 },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.slate[900],
    marginBottom: 4,
  },
  itemPrice: { fontSize: 14, fontWeight: "800", color: theme.colors.primary },
  textMuted: { color: theme.colors.slate[400] },
  itemFooter: { height: 24, justifyContent: 'flex-end' },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2 },

  comboCard: {
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderColor: theme.colors.info + '40',
    borderWidth: 1,
  },
  comboHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  comboName: {
    ...theme.typography.bodyBold,
    color: theme.colors.slate[900],
    flex: 1,
    marginRight: 12,
  },
  comboItems: { fontSize: 13, color: theme.colors.slate[500], lineHeight: 18 },
  comboFooter: { marginTop: 12, alignItems: 'flex-end' },
  comboPrice: { fontSize: 16, fontWeight: "900", color: theme.colors.info },

  empty: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyText: { color: theme.colors.slate[400], fontSize: 15 },

  overlay: {
    flex: 1,
    backgroundColor: theme.colors.slate[900],
    justifyContent: "center",
    padding: 24,
  },
  modalBox: { padding: 24 },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalName: {
    ...theme.typography.h2,
    color: theme.colors.slate[900],
    textAlign: 'center',
    marginBottom: 8,
  },
  modalPrice: {
    ...theme.typography.h3,
    color: theme.colors.primary,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 24,
  },
  qtyBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.slate[100],
    justifyContent: "center",
    alignItems: "center",
  },
  qtyValContainer: { minWidth: 60, alignItems: 'center' },
  qtyVal: {
    fontSize: 36,
    fontWeight: "900",
    color: theme.colors.slate[900],
  },
  noteInput: { marginBottom: 24 },
  modalBtns: { flexDirection: "row", gap: 12 },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
