import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { X } from 'lucide-react';

import { menuApi, type Category, type CreateItemPayload } from '@/api/menu';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategoryList } from '@/components/menu/CategoryList';
import { CategoryPanel } from '@/components/menu/CategoryPanel';
import { NewCategoryPanel } from '@/components/menu/NewCategoryPanel';
import { ItemList } from '@/components/menu/ItemList';
import { ItemPanel } from '@/components/menu/ItemPanel';
import { NewItemPanel } from '@/components/menu/NewItemPanel';
import { ComboList } from '@/components/menu/ComboList';
import { ComboPanel } from '@/components/menu/ComboPanel';
import { NewComboPanel } from '@/components/menu/NewComboPanel';

type View = 'items' | 'combos';

type ItemsMode =
  | { kind: 'category'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'newCategory' }
  | { kind: 'newItem' }
  | null;

type ComboMode = { kind: 'combo'; id: string } | { kind: 'newCombo' } | null;

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
      {message}
    </div>
  );
}

/**
 * Menyu — the catalog.
 *
 * Categories left, items for the selected category right, both real `Row`
 * lists rather than a `<table>`. Every action that used to be a raw icon
 * button — four of them only appeared on hover, undiscoverable on a
 * touchscreen — now lives in the panel for whatever is selected.
 */
export function MenuPage() {
  usePageTitle('Menyu');
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>('items');
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [itemsMode, setItemsMode] = useState<ItemsMode>(null);
  const [comboMode, setComboMode] = useState<ComboMode>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['menu', 'categories', showInactive],
    queryFn: () => menuApi.listCategories(showInactive),
  });

  const { data: items = [] } = useQuery({
    queryKey: ['menu', 'items', showInactive],
    queryFn: () => menuApi.listItems(showInactive),
  });

  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos', showInactive],
    queryFn: () => menuApi.listCombos(showInactive),
  });

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
    return counts;
  }, [items]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const effectiveCategoryId = activeCategoryId ?? categories[0]?.id ?? null;
  const activeCategory = categories.find((c) => c.id === effectiveCategoryId) ?? null;

  // A dozen categories deep, "browse to the right category, then scan" stops
  // being glanceable well before the list ends — search finds the dish by
  // name (or its category's name) across every category at once, the same
  // combined match the old page made, just flattened into one result list
  // instead of a two-tier category-then-item filter.
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return items.filter((item) => {
      if (item.name.toLowerCase().includes(normalizedQuery)) return true;
      const categoryName = categoryNameById.get(item.categoryId);
      return categoryName ? categoryName.toLowerCase().includes(normalizedQuery) : false;
    });
  }, [items, isSearching, normalizedQuery, categoryNameById]);

  const visibleItems = useMemo(() => {
    if (isSearching) return searchResults;
    return effectiveCategoryId ? items.filter((item) => item.categoryId === effectiveCategoryId) : [];
  }, [items, effectiveCategoryId, isSearching, searchResults]);

  // Selections and toggles are independent state — the list they point at
  // can shrink out from under them (the showInactive toggle, or a socket
  // update elsewhere). Drop a selection the instant its target disappears
  // rather than showing a panel for something no longer in either list.
  useEffect(() => {
    if (activeCategoryId && !categories.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(null);
    }
  }, [categories, activeCategoryId]);

  useEffect(() => {
    if (itemsMode?.kind === 'category' && !categories.some((c) => c.id === itemsMode.id)) {
      setItemsMode(null);
    }
    if (itemsMode?.kind === 'item' && !items.some((item) => item.id === itemsMode.id)) {
      setItemsMode(null);
    }
  }, [categories, items, itemsMode]);

  useEffect(() => {
    if (comboMode?.kind === 'combo' && !combos.some((combo) => combo.id === comboMode.id)) {
      setComboMode(null);
    }
  }, [combos, comboMode]);

  const invalidateMenu = () => queryClient.invalidateQueries({ queryKey: ['menu'] });
  const onMutationError = (err: Error) => toast.error(err.message);

  const createCategoryMutation = useMutation({
    mutationFn: (data: Parameters<typeof menuApi.createCategory>[0]) => menuApi.createCategory(data),
    onSuccess: () => {
      invalidateMenu();
      toast.success('Kategoriya qo\'shildi');
      setItemsMode(null);
    },
    onError: onMutationError,
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof menuApi.updateCategory>[1] }) =>
      menuApi.updateCategory(id, data),
    onSuccess: invalidateMenu,
    onError: onMutationError,
  });

  const createItemMutation = useMutation({
    mutationFn: (data: CreateItemPayload) => menuApi.createItem(data),
    onSuccess: () => {
      invalidateMenu();
      toast.success('Mahsulot qo\'shildi');
      setItemsMode(null);
    },
    onError: onMutationError,
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof menuApi.updateItem>[1] }) =>
      menuApi.updateItem(id, data),
    onSuccess: invalidateMenu,
    onError: onMutationError,
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuApi.toggleAvailability(id, isAvailable),
    onSuccess: invalidateMenu,
    onError: onMutationError,
  });

  const createComboMutation = useMutation({
    mutationFn: (data: Parameters<typeof menuApi.createCombo>[0]) => menuApi.createCombo(data),
    onSuccess: () => {
      invalidateMenu();
      toast.success('Kombo qo\'shildi');
      setComboMode(null);
    },
    onError: onMutationError,
  });

  const updateComboMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof menuApi.updateCombo>[1] }) =>
      menuApi.updateCombo(id, data),
    onSuccess: invalidateMenu,
    onError: onMutationError,
  });

  const reorderCategory = (category: Category, direction: 'up' | 'down') => {
    const index = categories.indexOf(category);
    const other = direction === 'up' ? categories[index - 1] : categories[index + 1];
    if (!other) return;
    updateCategoryMutation.mutate({ id: category.id, data: { displayOrder: other.displayOrder } });
    updateCategoryMutation.mutate({ id: other.id, data: { displayOrder: category.displayOrder } });
  };

  let panel = <EmptyPanel message="Kategoriya yoki mahsulotni tanlang" />;

  if (view === 'items') {
    if (itemsMode?.kind === 'newCategory') {
      panel = (
        <NewCategoryPanel
          submitting={createCategoryMutation.isPending}
          error={createCategoryMutation.error instanceof Error ? createCategoryMutation.error.message : null}
          onCancel={() => setItemsMode(null)}
          onSave={(name) => createCategoryMutation.mutate({ name })}
        />
      );
    } else if (itemsMode?.kind === 'newItem') {
      panel = (
        <NewItemPanel
          categories={categories}
          initialCategoryId={effectiveCategoryId}
          submitting={createItemMutation.isPending}
          error={createItemMutation.error instanceof Error ? createItemMutation.error.message : null}
          onCancel={() => setItemsMode(null)}
          onSave={(data) => createItemMutation.mutate(data)}
        />
      );
    } else if (itemsMode?.kind === 'category') {
      const category = categories.find((c) => c.id === itemsMode.id);
      if (category) {
        const index = categories.indexOf(category);
        panel = (
          <CategoryPanel
            key={category.id}
            category={category}
            itemCount={itemCounts.get(category.id) ?? 0}
            canMoveUp={index > 0}
            canMoveDown={index >= 0 && index < categories.length - 1}
            submitting={updateCategoryMutation.isPending}
            error={updateCategoryMutation.error instanceof Error ? updateCategoryMutation.error.message : null}
            onSave={(name) =>
              updateCategoryMutation.mutate(
                { id: category.id, data: { name } },
                { onSuccess: () => toast.success('Saqlandi') },
              )
            }
            onReorder={(direction) => reorderCategory(category, direction)}
            onToggleActive={() =>
              updateCategoryMutation.mutate(
                { id: category.id, data: { isActive: !category.isActive } },
                { onSuccess: () => toast.success('Saqlandi') },
              )
            }
          />
        );
      }
    } else if (itemsMode?.kind === 'item') {
      const item = items.find((i) => i.id === itemsMode.id);
      if (item) {
        panel = (
          <ItemPanel
            key={item.id}
            item={item}
            categories={categories}
            submitting={updateItemMutation.isPending}
            availabilityPending={toggleAvailabilityMutation.isPending}
            error={updateItemMutation.error instanceof Error ? updateItemMutation.error.message : null}
            onSave={(data) =>
              updateItemMutation.mutate(
                // menuApi.updateItem declares costPrice as string|null (via
                // Partial<MenuItem>) even though the server also accepts a
                // number — match the client type at this boundary rather
                // than loosen it.
                { id: item.id, data: { ...data, costPrice: data.costPrice === null ? null : String(data.costPrice) } },
                { onSuccess: () => toast.success('Saqlandi') },
              )
            }
            onToggleAvailability={() =>
              toggleAvailabilityMutation.mutate(
                { id: item.id, isAvailable: !item.isAvailable },
                { onSuccess: () => toast.success('Saqlandi') },
              )
            }
            onToggleActive={() =>
              updateItemMutation.mutate(
                { id: item.id, data: { isActive: !item.isActive } },
                { onSuccess: () => toast.success('Saqlandi') },
              )
            }
          />
        );
      }
    }
  } else if (comboMode?.kind === 'newCombo') {
    panel = (
      <NewComboPanel
        items={items}
        submitting={createComboMutation.isPending}
        error={createComboMutation.error instanceof Error ? createComboMutation.error.message : null}
        onCancel={() => setComboMode(null)}
        onSave={(data) => createComboMutation.mutate(data)}
      />
    );
  } else if (comboMode?.kind === 'combo') {
    const combo = combos.find((c) => c.id === comboMode.id);
    panel = combo ? (
      <ComboPanel
        key={combo.id}
        combo={combo}
        submitting={updateComboMutation.isPending}
        error={updateComboMutation.error instanceof Error ? updateComboMutation.error.message : null}
        onToggleActive={() =>
          updateComboMutation.mutate(
            { id: combo.id, data: { isActive: !combo.isActive } },
            { onSuccess: () => toast.success('Saqlandi') },
          )
        }
      />
    ) : (
      <EmptyPanel message="Komboni tanlang" />
    );
  } else if (view === 'combos') {
    panel = <EmptyPanel message="Komboni tanlang" />;
  }

  return (
    <Screen
      title="Menyu"
      status={
        <>
          {view === 'items' ? (
            <>
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Mahsulot yoki kategoriya nomi"
                className="w-[220px]"
              />
              <Button
                variant="ghost"
                size="icon"
                disabled={!searchQuery}
                onClick={() => setSearchQuery('')}
                aria-label="Qidiruvni tozalash"
              >
                <X />
              </Button>
            </>
          ) : null}
          <Button size="sm" variant={view === 'items' ? 'default' : 'secondary'} onClick={() => setView('items')}>
            Mahsulotlar
          </Button>
          <Button size="sm" variant={view === 'combos' ? 'default' : 'secondary'} onClick={() => setView('combos')}>
            Kombolar
          </Button>
          <Button
            size="sm"
            variant={showInactive ? 'default' : 'secondary'}
            onClick={() => setShowInactive((v) => !v)}
          >
            Nofaollarni ko'rsatish
          </Button>
        </>
      }
      panel={panel}
    >
      {view === 'items' ? (
        <div className="flex h-full min-h-0 gap-seam">
          <div className="flex min-h-0 w-[280px] shrink-0 flex-col gap-seam">
            <Button
              variant="secondary"
              className="w-full shrink-0 justify-start"
              onClick={() => setItemsMode({ kind: 'newCategory' })}
            >
              + Yangi kategoriya
            </Button>
            <div className="min-h-0 flex-1 overflow-auto">
              <CategoryList
                categories={categories}
                itemCounts={itemCounts}
                selectedId={itemsMode?.kind === 'category' ? itemsMode.id : null}
                onSelect={(category) => {
                  // Picking a category is "take me there" — it wins over an
                  // in-progress search rather than leaving the right column
                  // stuck on results while the click appears to do nothing.
                  setSearchQuery('');
                  setActiveCategoryId(category.id);
                  setItemsMode({ kind: 'category', id: category.id });
                }}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-seam">
            <Button
              variant="secondary"
              className="w-full shrink-0 justify-start"
              onClick={() => setItemsMode({ kind: 'newItem' })}
            >
              + Yangi mahsulot
            </Button>
            <div className="min-h-0 flex-1 overflow-auto">
              <ItemList
                items={visibleItems}
                title={isSearching ? `${searchResults.length} ta natija` : (activeCategory?.name ?? 'Mahsulotlar')}
                categoryNameById={isSearching ? categoryNameById : undefined}
                emptyMessage={isSearching ? 'Topilmadi' : undefined}
                selectedId={itemsMode?.kind === 'item' ? itemsMode.id : null}
                onSelect={(item) => setItemsMode({ kind: 'item', id: item.id })}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-seam">
          <Button
            variant="secondary"
            className="w-full shrink-0 justify-start"
            onClick={() => setComboMode({ kind: 'newCombo' })}
          >
            + Yangi kombo
          </Button>
          <div className="min-h-0 flex-1 overflow-auto">
            <ComboList
              combos={combos}
              selectedId={comboMode?.kind === 'combo' ? comboMode.id : null}
              onSelect={(combo) => setComboMode({ kind: 'combo', id: combo.id })}
            />
          </div>
        </div>
      )}
    </Screen>
  );
}
