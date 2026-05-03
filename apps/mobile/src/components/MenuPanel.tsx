import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { menuApi, MenuItem, Combo } from "../api/menu";
import { ordersApi } from "../api/orders";
import { useToastStore } from "../stores/toast.store";
import { formatUZS } from "../lib/format";

function stockLabel(item: MenuItem): string | null {
  if (!item.trackStock || item.todayCurrentCount === null) return null;
  if (item.todayCurrentCount <= 0) return "Tugagan";
  if (item.todayCurrentCount <= 5) return `${item.todayCurrentCount} ta qoldi`;
  return null;
}

function ItemCard({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const available = item.effectivelyAvailable;
  const label = stockLabel(item);
  return (
    <TouchableOpacity
      style={[styles.itemCard, !available && styles.itemCardUnavailable]}
      onPress={available ? onPress : undefined}
      activeOpacity={available ? 0.75 : 1}
    >
      <Text style={[styles.itemName, !available && styles.textMuted]}>
        {item.name}
      </Text>
      <Text style={[styles.itemPrice, !available && styles.textMuted]}>
        {formatUZS(item.price)} so'm
      </Text>
      {label && (
        <View style={[styles.stockBadge, !available && styles.stockBadgeOut]}>
          <Text
            style={[
              styles.stockBadgeText,
              !available && styles.stockBadgeTextOut,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
      {!available && (
        <View style={styles.soldOut}>
          <Text style={styles.soldOutText}>Mavjud emas</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ComboCard({ combo, onPress }: { combo: Combo; onPress: () => void }) {
  const total = combo.components.reduce(
    (s, c) => s + c.menuItem.price * c.quantity,
    0,
  );
  return (
    <TouchableOpacity
      style={styles.comboCard}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.comboRow}>
        <Text style={styles.comboName}>{combo.name}</Text>
        <Text style={styles.comboPrice}>{formatUZS(total)} so'm</Text>
      </View>
      <Text style={styles.comboItems} numberOfLines={1}>
        {combo.components
          .map((c) => `${c.menuItem.name} ×${c.quantity}`)
          .join("  ·  ")}
      </Text>
    </TouchableOpacity>
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
        <ActivityIndicator size="large" color="#2563eb" />
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

      {/* Items */}
      {showCombos ? (
        <FlatList
          key="combos"
          data={activeCombos}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.grid}
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
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <ItemCard item={item} onPress={() => openItem(item)} />
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Bu kategoriyada mahsulot yo'q</Text>
          }
        />
      )}

      {/* Add item modal */}
      <Modal visible={!!itemModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalName}>{itemModal?.name}</Text>
            <Text style={styles.modalPrice}>
              {formatUZS((itemModal?.price ?? 0) * quantity)} so'm
            </Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Text style={styles.qtyBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyVal}>{quantity}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setQuantity((q) => q + 1)}
              >
                <Text style={styles.qtyBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.noteInput}
              value={itemNote}
              onChangeText={setItemNote}
              placeholder="Eslatma (ixtiyoriy)"
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={dismissModal}
              >
                <Text style={styles.modalCancelText}>✕</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalAddBtn,
                  (addItemMutation.isPending || offline) && styles.btnDisabled,
                ]}
                onPress={() =>
                  itemModal &&
                  addItemMutation.mutate({
                    menuItemId: itemModal.id,
                    qty: quantity,
                    notes: itemNote,
                  })
                }
                disabled={addItemMutation.isPending || offline}
              >
                {addItemMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalAddText}>Qo'shish</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f6" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  errText: { fontSize: 16, fontWeight: "700", color: "#dc2626" },
  errSub: { fontSize: 13, color: "#9ca3af" },

  catBar: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexShrink: 0,
  },
  catBarContent: {
    paddingHorizontal: 8,
    alignItems: "stretch",
  },
  catTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  catTabActive: { borderBottomColor: "#2563eb" },
  catTabText: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  catTabTextActive: { color: "#2563eb" },

  grid: { padding: 10, paddingBottom: 16 },
  itemCard: {
    flex: 1,
    margin: 5,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  itemCardUnavailable: { opacity: 0.5 },
  itemName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 5,
  },
  itemPrice: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
  textMuted: { color: "#9ca3af" },
  stockBadge: {
    marginTop: 5,
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  stockBadgeOut: { backgroundColor: "#fee2e2" },
  stockBadgeText: { fontSize: 10, fontWeight: "700", color: "#15803d" },
  stockBadgeTextOut: { color: "#dc2626" },
  soldOut: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  soldOutText: { fontSize: 12, fontWeight: "700", color: "#dc2626" },

  comboCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: "#e9d5ff",
  },
  comboRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  comboName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  comboPrice: { fontSize: 14, fontWeight: "700", color: "#7c3aed" },
  comboItems: { fontSize: 12, color: "#6b7280" },

  emptyText: {
    textAlign: "center",
    color: "#9ca3af",
    marginTop: 40,
    fontSize: 14,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: { backgroundColor: "#fff", borderRadius: 18, padding: 22 },
  modalName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  modalPrice: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2563eb",
    marginBottom: 20,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    marginBottom: 18,
  },
  qtyBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: { fontSize: 28, color: "#111827", lineHeight: 34 },
  qtyVal: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    minWidth: 44,
    textAlign: "center",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 18,
    color: "#111827",
  },
  modalBtns: { flexDirection: "row", gap: 10 },
  modalCancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelText: { color: "#374151", fontWeight: "600", fontSize: 15 },
  modalAddBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 14,
    backgroundColor: "#16a34a",
    alignItems: "center",
  },
  modalAddText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { backgroundColor: "#9ca3af" },
});
