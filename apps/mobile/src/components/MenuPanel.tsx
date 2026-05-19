import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { menuApi, MenuItem, Combo } from "../api/menu";
import { ordersApi, OrderLine } from "../api/orders";
import { useToastStore } from "../stores/toast.store";
import { formatUZS } from "../lib/format";
import { theme } from "../lib/theme";
import { Badge } from "../components/ui/Badge";
import { haptics } from "../lib/haptics";

type ItemRowProps = {
  item: MenuItem;
  currentQty: number;
  busy: boolean;
  onAdd: () => void;
  onMinus: () => void;
};

function ItemRow({ item, currentQty, busy, onAdd, onMinus }: ItemRowProps) {
  const available = item.effectivelyAvailable;
  const inOrder = currentQty > 0;

  return (
    <TouchableOpacity
      activeOpacity={available ? 0.85 : 1}
      onPress={available && !busy ? onAdd : undefined}
      style={[
        styles.itemRow,
        !available && styles.itemRowUnavailable,
        inOrder && styles.itemRowActive,
      ]}
    >
      <View style={styles.itemBody}>
        <Text
          style={[styles.itemName, !available && styles.textMuted]}
          numberOfLines={2}
        >
          {item.name}
        </Text>
        <View style={styles.itemMetaRow}>
          <Text style={[styles.itemPrice, !available && styles.textMuted]}>
            {formatUZS(item.price)} so'm
          </Text>
          {!available && (
            <Badge label="Mavjud emas" variant="slate" style={styles.stockBadge} />
          )}
        </View>
      </View>

      {available && (
        inOrder ? (
          <View style={styles.qtyControl}>
            <TouchableOpacity
              style={styles.qtyMinusBtn}
              onPress={onMinus}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons
                name={currentQty === 1 ? 'trash-can-outline' : 'minus'}
                size={24}
                color={theme.colors.danger}
              />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{currentQty}</Text>
            <TouchableOpacity
              style={styles.qtyPlusBtn}
              onPress={onAdd}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialCommunityIcons name="plus" size={24} color={theme.colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.addBtn}>
            <MaterialCommunityIcons name="plus" size={28} color={theme.colors.white} />
          </View>
        )
      )}
    </TouchableOpacity>
  );
}

function ComboRow({ combo, busy, onAdd }: { combo: Combo; busy: boolean; onAdd: () => void }) {
  const total = combo.components.reduce(
    (s, c) => s + c.menuItem.price * c.quantity,
    0,
  );
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={busy ? undefined : onAdd}
      style={styles.comboRow}
    >
      <View style={styles.comboBody}>
        <View style={styles.comboHeader}>
          <Text style={styles.comboName} numberOfLines={1}>{combo.name}</Text>
          <Badge label="SET" variant="info" />
        </View>
        <Text style={styles.comboItems} numberOfLines={2}>
          {combo.components
            .map((c) => `${c.menuItem.name} × ${c.quantity}`)
            .join("  ·  ")}
        </Text>
        <Text style={styles.comboPrice}>{formatUZS(total)} so'm</Text>
      </View>
      <View style={[styles.addBtn, styles.addBtnInfo]}>
        <MaterialCommunityIcons name="plus" size={28} color={theme.colors.white} />
      </View>
    </TouchableOpacity>
  );
}

type Props = {
  orderId: string;
  offline: boolean;
  currentLines: OrderLine[];
};

export function MenuPanel({ orderId, offline, currentLines }: Props) {
  const qc = useQueryClient();
  const showToast = useToastStore((s) => s.show);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  const { data: menuData, isLoading, isError } = useQuery({
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

  const itemQtyMap = useMemo(() => {
    const map = new Map<string, { qty: number; lineId: string }>();
    for (const l of currentLines) {
      if (l.isCanceled) continue;
      if (l.comboGroupId) continue;
      if (!l.menuItemId) continue;
      const cur = map.get(l.menuItemId);
      if (cur) {
        map.set(l.menuItemId, { qty: cur.qty + l.quantity, lineId: cur.lineId });
      } else {
        map.set(l.menuItemId, { qty: l.quantity, lineId: l.id });
      }
    }
    return map;
  }, [currentLines]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["orders", orderId] });
  };

  const addItemMutation = useMutation({
    mutationFn: ({ menuItemId }: { menuItemId: string }) =>
      ordersApi.addItem(orderId, { menuItemId, quantity: 1 }),
    onMutate: ({ menuItemId }) => setPendingItemId(menuItemId),
    onSettled: () => setPendingItemId(null),
    onSuccess: () => { haptics.tapLight(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
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
    },
  });

  const updateQtyMutation = useMutation({
    mutationFn: ({ lineId, quantity }: { lineId: string; quantity: number }) =>
      ordersApi.updateLineQuantity(orderId, lineId, quantity),
    onSuccess: () => { haptics.tapLight(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      showToast(err.message || "O'zgartirib bo'lmadi", "error");
    },
  });

  const cancelLineMutation = useMutation({
    mutationFn: (lineId: string) => ordersApi.cancelLine(orderId, lineId),
    onSuccess: () => { haptics.warning(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      showToast(err.message || "Bekor qilib bo'lmadi", "error");
    },
  });

  const addComboMutation = useMutation({
    mutationFn: (comboId: string) => ordersApi.addCombo(orderId, { comboId }),
    onSuccess: () => { haptics.success(); invalidate(); },
    onError: (err: any) => {
      haptics.error();
      showToast(err.message || "Set qo'shib bo'lmadi", "error");
    },
  });

  const handleAdd = (item: MenuItem) => {
    if (offline) { showToast("Aloqa yo'q", "error"); return; }
    if (!item.effectivelyAvailable) return;
    addItemMutation.mutate({ menuItemId: item.id });
  };

  const handleMinus = (item: MenuItem) => {
    if (offline) { showToast("Aloqa yo'q", "error"); return; }
    const entry = itemQtyMap.get(item.id);
    if (!entry) return;
    if (entry.qty <= 1) {
      cancelLineMutation.mutate(entry.lineId);
    } else {
      updateQtyMutation.mutate({ lineId: entry.lineId, quantity: entry.qty - 1 });
    }
  };

  const handleAddCombo = (combo: Combo) => {
    if (offline) { showToast("Aloqa yo'q", "error"); return; }
    addComboMutation.mutate(combo.id);
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
      {/* Category chips */}
      <View style={styles.catBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catBarContent}
        >
          {activeCombos.length > 0 && (
            <TouchableOpacity
              style={[styles.catChip, showCombos && styles.catChipActive]}
              onPress={() => setShowCombos(true)}
            >
              <MaterialCommunityIcons
                name="package-variant"
                size={16}
                color={showCombos ? theme.colors.white : theme.colors.slate[600]}
              />
              <Text style={[styles.catChipText, showCombos && styles.catChipTextActive]}>
                Set menyu
              </Text>
            </TouchableOpacity>
          )}
          {categories.map((cat) => {
            const active = !showCombos && currentCatId === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catChip, active && styles.catChipActive]}
                onPress={() => { setActiveCatId(cat.id); setShowCombos(false); }}
              >
                <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        {showCombos ? (
          <FlatList
            key="combos"
            data={activeCombos}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ComboRow
                combo={item}
                busy={addComboMutation.isPending}
                onAdd={() => handleAddCombo(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          />
        ) : (
          <FlatList
            key="items"
            data={currentCat?.items ?? []}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const entry = itemQtyMap.get(item.id);
              const qty = entry?.qty ?? 0;
              const busy =
                pendingItemId === item.id ||
                (updateQtyMutation.isPending && updateQtyMutation.variables?.lineId === entry?.lineId) ||
                (cancelLineMutation.isPending && cancelLineMutation.variables === entry?.lineId);
              return (
                <ItemRow
                  item={item}
                  currentQty={qty}
                  busy={busy}
                  onAdd={() => handleAdd(item)}
                  onMinus={() => handleMinus(item)}
                />
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="silverware-clean" size={48} color={theme.colors.slate[300]} />
                <Text style={styles.emptyText}>Bu kategoriyada mahsulot yo'q</Text>
              </View>
            }
          />
        )}
      </View>
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
    paddingVertical: 12,
  },
  catBarContent: { paddingHorizontal: theme.spacing.md, gap: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.slate[100],
  },
  catChipActive: { backgroundColor: theme.colors.primary },
  catChipText: { fontSize: 14, fontWeight: '700', color: theme.colors.slate[600] },
  catChipTextActive: { color: theme.colors.white },

  listContainer: { flex: 1 },
  list: { padding: theme.spacing.md, paddingBottom: 40 },

  // Single-column menu row
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 16,
    padding: 16,
    minHeight: 88,
    borderWidth: 1,
    borderColor: theme.colors.slate[200],
    ...theme.shadows.sm,
  },
  itemRowUnavailable: { opacity: 0.55, backgroundColor: theme.colors.slate[50] },
  itemRowActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 2,
  },
  itemBody: { flex: 1, marginRight: 12 },
  itemName: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.slate[900],
    marginBottom: 6,
    lineHeight: 22,
  },
  itemMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemPrice: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  textMuted: { color: theme.colors.slate[400] },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2 },

  // Big + button when item not in cart
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.md,
  },
  addBtnInfo: { backgroundColor: theme.colors.info },

  // Qty pill when item is in cart
  qtyControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    overflow: 'hidden',
    height: 48,
  },
  qtyMinusBtn: {
    width: 44,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.dangerLight,
  },
  qtyPlusBtn: {
    width: 44,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
  },
  qtyValue: {
    minWidth: 36,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: theme.colors.slate[900],
    fontVariant: ['tabular-nums'],
  },

  // Combo row
  comboRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.infoLight,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.info + '30',
    ...theme.shadows.sm,
  },
  comboBody: { flex: 1, marginRight: 12 },
  comboHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  comboName: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.slate[900],
    flex: 1,
  },
  comboItems: { fontSize: 13, color: theme.colors.slate[600], lineHeight: 18, marginBottom: 6 },
  comboPrice: { fontSize: 16, fontWeight: "900", color: theme.colors.info },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: theme.colors.slate[400], fontSize: 15 },
});
