import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BookOpen,
  Plus,
  ChevronUp,
  ChevronDown,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  RotateCcw,
  X,
  Search,
} from 'lucide-react';
import { menuApi, Category, MenuItem, Combo, CreateItemPayload } from '../api/menu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { MoneyCell } from '@/components/data/MoneyCell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const categorySchema = z.object({
  name: z.string().min(1, 'Nom kiritilishi shart'),
  displayOrder: z.number().int().default(0),
});

// Edit-mode keeps the lightweight shape (no mode switching on existing items —
// stock/recipe edits go through the dedicated pages).
const itemEditSchema = z.object({
  name: z.string().min(1, 'Nom kiritilishi shart'),
  categoryId: z.string().min(1, 'Kategoriya tanlanishi shart'),
  price: z.number().min(0, "Narx noto'g'ri"),
  description: z.string().optional(),
  displayOrder: z.number().int().default(0),
  isService: z.boolean().default(false),
});

type CategoryFormData = {
  name: string;
  displayOrder: number;
};

type ItemEditSubmit = {
  name: string;
  categoryId: string;
  price: number;
  description?: string;
  displayOrder: number;
  kind: 'FOOD' | 'SERVICE';
  costPrice: number | null;
  counted: boolean;
};

export function MenuPage() {
  usePageTitle('Menyu');
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [view, setView] = useState<'items' | 'combos'>('items');
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const { data: menuData } = useQuery({
    queryKey: ['menu', 'full', showInactive],
    queryFn: () => menuApi.getMenu(showInactive),
  });

  const categories = menuData?.categories || [];
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredCategories = isSearching
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(normalizedQuery) ||
        (c.items ?? []).some((it) => it.name.toLowerCase().includes(normalizedQuery)),
      )
    : categories;

  const activeCategory =
    filteredCategories.find((c) => c.id === selectedCategoryId) || filteredCategories[0];

  const items = activeCategory
    ? isSearching && !activeCategory.name.toLowerCase().includes(normalizedQuery)
      ? (activeCategory.items ?? []).filter((it) =>
          it.name.toLowerCase().includes(normalizedQuery),
        )
      : (activeCategory.items ?? [])
    : [];

  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos', showInactive],
    queryFn: () => menuApi.listCombos(showInactive),
  });

  // Category Mutations
  const createCategoryMutation = useMutation({
    mutationFn: (data: any) => menuApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setIsAddingCategory(false);
    }
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: any) => menuApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setEditCategory(null);
    }
  });

  // Item Mutations
  const createItemMutation = useMutation({
    mutationFn: (data: CreateItemPayload) => menuApi.createItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setIsAddingItem(false);
    }
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: any) => menuApi.updateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setEditItem(null);
    }
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ id, isAvailable }: any) => menuApi.toggleAvailability(id, isAvailable),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu'] })
  });

  const handleToggleCategoryActive = (category: Category) => {
    if (category.isActive) {
      setPendingConfirm({
        message: `"${category.name}" kategoriyasini faolsizlantirmoqchimisiz?`,
        onConfirm: () => updateCategoryMutation.mutate({ id: category.id, data: { isActive: false } }),
      });
    } else {
      setPendingConfirm({
        message: `"${category.name}" kategoriyasini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateCategoryMutation.mutate({ id: category.id, data: { isActive: true } }),
      });
    }
  };

  const handleToggleItemActive = (item: MenuItem) => {
    if (item.isActive) {
      setPendingConfirm({
        message: `"${item.name}" mahsulotini faolsizlantirmoqchimisiz?`,
        onConfirm: () => updateItemMutation.mutate({ id: item.id, data: { isActive: false } }),
      });
    } else {
      setPendingConfirm({
        message: `"${item.name}" mahsulotini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateItemMutation.mutate({ id: item.id, data: { isActive: true } }),
      });
    }
  };

  const reorderCategory = (category: Category, direction: 'up' | 'down') => {
    const index = categories.indexOf(category);
    const other = direction === 'up' ? categories[index - 1] : categories[index + 1];
    if (!other) return;
    
    updateCategoryMutation.mutate({ id: category.id, data: { displayOrder: other.displayOrder } });
    updateCategoryMutation.mutate({ id: other.id, data: { displayOrder: category.displayOrder } });
  };

  return (
    <PageContent>
      <PageHeader
        title="Menyu"
        description="Kategoriyalar, taomlar va kombolar."
        actions={
          <>
            <label className="flex items-center gap-2 cursor-pointer rounded-md border border-input bg-background px-3 h-9 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-xs text-muted-foreground">Faolsizlarni ko'rsatish</span>
            </label>
            <Tabs value={view} onValueChange={(v) => setView(v as 'items' | 'combos')}>
              <TabsList>
                <TabsTrigger value="items">Mahsulotlar</TabsTrigger>
                <TabsTrigger value="combos">Kombolar</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />

      {view === 'items' && (
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Mahsulot yoki kategoriya nomi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-muted-foreground hover:text-foreground"
              title="Tozalash"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {view === 'items' ? (
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* Categories Column */}
          <div className="col-span-12 md:col-span-4 lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="font-bold text-slate-500 text-xs uppercase tracking-widest">Kategoriyalar</h2>
              <button 
                onClick={() => setIsAddingCategory(true)}
                className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                title="Yangi kategoriya"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="divide-y divide-slate-100">
                {filteredCategories.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-slate-400 italic">
                    Topilmadi
                  </div>
                )}
                {filteredCategories.map((cat, idx) => (
                  <div 
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`group flex items-center justify-between p-3 cursor-pointer transition-colors ${
                      (selectedCategoryId === cat.id || (!selectedCategoryId && idx === 0))
                        ? 'bg-blue-50 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-transparent'
                    } ${!cat.isActive ? 'bg-slate-50/50' : ''}`}
                  >
                    <span className={`text-sm font-semibold truncate ${
                      (selectedCategoryId === cat.id || (!selectedCategoryId && idx === 0)) ? 'text-blue-700' : 'text-slate-700'
                    } ${!cat.isActive ? 'text-slate-400 italic line-through' : ''}`}>
                      {cat.name} {!cat.isActive && '(Nofaol)'}
                    </span>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); reorderCategory(cat, 'up'); }}
                        disabled={isSearching || categories.indexOf(cat) === 0}
                        className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); reorderCategory(cat, 'down'); }}
                        disabled={isSearching || categories.indexOf(cat) === categories.length - 1}
                        className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditCategory(cat); }}
                        className="p-1 text-slate-400 hover:text-blue-600"
                      >
                        <Pencil size={14} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleToggleCategoryActive(cat); }}
                        className={`p-1 transition-colors ${cat.isActive ? 'text-slate-400 hover:text-red-500' : 'text-green-500 hover:text-green-600'}`}
                      >
                        {cat.isActive ? <Trash2 size={14} /> : <RotateCcw size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Items Column */}
          <div className="col-span-12 md:col-span-8 lg:col-span-9 space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className={`font-bold text-slate-500 text-xs uppercase tracking-widest ${!activeCategory?.isActive ? 'italic line-through' : ''}`}>
                {activeCategory?.name || 'Mahsulotlar'} {!activeCategory?.isActive && '(Nofaol)'}
              </h2>
              <Button size="sm" onClick={() => setIsAddingItem(true)}>
                <Plus className="h-4 w-4" />
                Qo'shish
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                    <th className="px-6 py-3">Nomi</th>
                    <th className="px-6 py-3">Narxi</th>
                    <th className="px-6 py-3 text-center">Qoldiq</th>
                    <th className="px-6 py-3 text-center">Holati</th>
                    <th className="px-6 py-3 text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50/50 transition-colors ${!item.isActive ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-6 py-4">
                        <div className={`font-bold ${!item.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'}`}>{item.name}</div>
                        {item.description && <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{item.description}</div>}
                      </td>
                      <td className={cn('px-6 py-4 font-semibold tabular-nums', !item.isActive ? 'text-slate-400' : 'text-slate-700')}>
                        <MoneyCell value={item.price} className={!item.isActive ? 'text-slate-400' : undefined} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        {item.kind === 'SERVICE' || !item.counted ? (
                          <Badge variant="outline">Doim mavjud</Badge>
                        ) : item.stockCount === null ? (
                          <Badge variant="outline">Sanoq kiritilmagan</Badge>
                        ) : (
                          <span className="tabular-nums">{item.stockCount} dona</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button 
                          disabled={!item.isActive}
                          onClick={() => toggleAvailabilityMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })}
                          className={`p-1.5 rounded-full transition-colors ${
                            !item.isActive ? 'text-slate-300 cursor-not-allowed' :
                            item.isAvailable ? 'text-green-600 hover:bg-green-50' : 'text-red-400 hover:bg-red-50'
                          }`}
                          title={item.isAvailable ? "Mavjud" : "Mavjud emas"}
                        >
                          {item.isAvailable ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => setEditItem(item)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleToggleItemActive(item)}
                            className={`p-1.5 rounded transition-all ${item.isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'}`}
                          >
                            {item.isActive ? <Trash2 size={16} /> : <RotateCcw size={16} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                        {isSearching ? 'Topilmadi' : "Ushbu kategoriyada mahsulotlar yo'q"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <CombosSection combos={combos} categories={categories} showInactive={showInactive} />
      )}

      {/* Modals */}
      {(isAddingCategory || editCategory) && (
        <CategoryModal
          category={editCategory}
          onClose={() => { setIsAddingCategory(false); setEditCategory(null); }}
          onSave={(data: CategoryFormData) => editCategory
            ? updateCategoryMutation.mutate({ id: editCategory.id, data })
            : createCategoryMutation.mutate(data)
          }
        />
      )}

      {editItem && (
        <ItemEditModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSave={(data) => updateItemMutation.mutate({ id: editItem.id, data })}
        />
      )}

      {isAddingItem && (
        <ItemCreateModal
          categories={categories}
          initialCategoryId={activeCategory?.id}
          onClose={() => setIsAddingItem(false)}
          onSave={(data) => createItemMutation.mutate(data)}
          isPending={createItemMutation.isPending}
          errorMessage={createItemMutation.error instanceof Error ? createItemMutation.error.message : null}
        />
      )}

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          variant="danger"
          onConfirm={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </PageContent>
  );
}

function CategoryModal({ category, onClose, onSave }: any) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues: category || { name: '', displayOrder: 0 }
  });

  return (
    <Modal title={category ? "Kategoriyani tahrirlash" : "Yangi kategoriya"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nomi</label>
          <input 
            {...register('name')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tartib raqami</label>
          <input 
            type="number"
            {...register('displayOrder', { valueAsNumber: true })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex space-x-3 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Bekor qilish</button>
          <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700">Saqlash</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Edit existing item ──────────────────────────────────────────────────────
// Cost edits happen here, inline, for non-SERVICE items. Stock counts are
// managed on the Ombor page — toggling `counted` here resets the count to
// NULL server-side, so the admin re-enters it there. Mode itself (whether an
// item is SERVICE vs counted/uncounted FOOD) is not switchable post-creation.
function ItemEditModal({
  item,
  categories,
  onClose,
  onSave,
}: {
  item: MenuItem;
  categories: Category[];
  onClose: () => void;
  onSave: (data: ItemEditSubmit) => void;
}) {
  const isService = item.kind === 'SERVICE';
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(itemEditSchema),
    defaultValues: {
      name: item.name,
      categoryId: item.categoryId,
      price: item.price,
      description: item.description ?? '',
      displayOrder: item.displayOrder,
      isService,
    },
  });

  const [costPrice, setCostPrice] = useState(item.costPrice ?? '');
  const [counted, setCounted] = useState(item.counted);

  const submit = handleSubmit((data: any) => {
    const { isService: _isService, ...rest } = data;
    onSave({
      ...rest,
      kind: isService ? 'SERVICE' : 'FOOD',
      costPrice: costPrice.trim() ? Number(costPrice) : null,
      counted,
    });
  });

  return (
    <Modal title="Mahsulotni tahrirlash" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Nomi</label>
            <input
              {...register('name')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kategoriya</label>
            <select
              {...register('categoryId')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tanlang...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sotuv narxi (UZS)</label>
            <input
              type="number"
              {...register('price', { valueAsNumber: true })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Tavsif (ixtiyoriy)</label>
            <textarea
              {...register('description')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 h-20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tartib raqami</label>
            <input
              type="number"
              {...register('displayOrder', { valueAsNumber: true })}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {!isService && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cost">Tan narx (so'm)</Label>
              <Input id="edit-cost" type="number" step="1" min={1} value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
            </div>
            <div className="flex items-start gap-3 rounded-md border border-input bg-muted/30 p-3">
              <Checkbox id="edit-counted" checked={counted} onCheckedChange={(v) => setCounted(v === true)} />
              <div className="space-y-0.5">
                <Label htmlFor="edit-counted" className="cursor-pointer">Sanaladigan</Label>
                <p className="text-xs text-muted-foreground">
                  Yoqilsa qoldiq NULL bo'ladi — Ombor sahifasida sanoq kiritilguncha sotilmaydi.
                </p>
              </div>
            </div>
          </>
        )}

        <div className="flex space-x-3 pt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Bekor qilish</button>
          <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700">Saqlash</button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Create new item: three-mode form ────────────────────────────────────────
type Mode = 'COUNTED' | 'UNCOUNTED' | 'SERVICE';

function ItemCreateModal({
  categories,
  initialCategoryId,
  onClose,
  onSave,
  isPending,
  errorMessage,
}: {
  categories: Category[];
  initialCategoryId?: string;
  onClose: () => void;
  onSave: (data: CreateItemPayload) => void;
  isPending?: boolean;
  errorMessage?: string | null;
}) {
  const [mode, setMode] = useState<Mode>('COUNTED');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState(initialCategoryId || '');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');

  // COUNTED / UNCOUNTED fields
  const [costPrice, setCostPrice] = useState('');
  const [initialCount, setInitialCount] = useState('');

  const [formError, setFormError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedName = name.trim();
    if (!trimmedName) return setFormError('Nomini kiriting');
    if (!categoryId) return setFormError('Kategoriyani tanlang');
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return setFormError('Sotuv narxi noto\'g\'ri');

    const base = {
      categoryId,
      name: trimmedName,
      price: priceNum,
      description: description.trim() || undefined,
    };

    if (mode === 'SERVICE') {
      onSave({ ...base, mode: 'SERVICE' });
      return;
    }

    onSave({
      ...base,
      mode,
      costPrice: costPrice.trim() ? Number(costPrice) : null,
      initialCount: mode === 'COUNTED' && initialCount.trim() ? Number(initialCount) : null,
    });
  };

  return (
    <Modal title="Yangi mahsulot" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        {/* Mode picker — three radio cards */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'COUNTED', label: 'Sanaladigan', hint: "Qoldiq soni yuritiladi (plov, Pepsi, somsa)" },
            { id: 'UNCOUNTED', label: 'Sanoqsiz (doim mavjud)', hint: 'Qoldiq sanalmaydi, doim sotuvda (choy)' },
            { id: 'SERVICE', label: 'Xizmat haqi', hint: "Ovqat emas — hisobga xizmat qatori" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMode(opt.id)}
              className={`text-left rounded-lg border px-3 py-2.5 transition ${
                mode === opt.id
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{opt.hint}</div>
            </button>
          ))}
        </div>

        {/* Common fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Nomi</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Kategoriya</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tanlang...</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sotuv narxi (so'm)</label>
            <input
              type="number"
              step="100"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Tavsif (ixtiyoriy)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 h-16"
            />
          </div>
        </div>

        {mode !== 'SERVICE' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-cost">Tan narx (so'm, ixtiyoriy)</Label>
              <Input
                id="item-cost"
                type="number"
                step="1"
                min={1}
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Kiritilmasa foyda hisobotida bu taom uchun xarajat 0 bo'ladi.
              </p>
            </div>
            {mode === 'COUNTED' && (
              <div className="space-y-1.5">
                <Label htmlFor="item-initial-count">Boshlang'ich sanoq (ixtiyoriy)</Label>
                <Input
                  id="item-initial-count"
                  type="number"
                  step="1"
                  min={0}
                  value={initialCount}
                  onChange={(e) => setInitialCount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Kiritilmasa taom sanoq kiritilguncha sotilmaydi.
                </p>
              </div>
            )}
          </div>
        )}

        {/* SERVICE block */}
        {mode === 'SERVICE' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">
            Xizmat haqi mahsuloti — oshxonaga bormaydi, retsept talab qilmaydi, zaxira hisoblanmaydi.
            Ofitsiant buyurtmaga qatori sifatida qo'shadi (masalan, kishi soniga qarab).
          </div>
        )}

        {(formError || errorMessage) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError || errorMessage}
          </div>
        )}

        <div className="flex space-x-3 pt-1">
          <button type="button" onClick={onClose} disabled={isPending} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Bekor qilish</button>
          <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-60">
            {isPending ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CombosSection({ combos, categories, showInactive }: any) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<any[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: any) => menuApi.createCombo(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setIsAdding(false);
      setSelectedComponents([]);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => menuApi.updateCombo(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu'] })
  });

  const handleToggleComboActive = (combo: Combo) => {
    if (combo.isActive) {
      setPendingConfirm({
        message: `"${combo.name}" kombosini faolsizlantirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: combo.id, data: { isActive: false } }),
      });
    } else {
      setPendingConfirm({
        message: `"${combo.name}" kombosini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: combo.id, data: { isActive: true } }),
      });
    }
  };

  const allItems = categories.flatMap((c: any) => c.items || []);

  const handleAddComponent = (itemId: string) => {
    if (selectedComponents.find(c => c.menuItemId === itemId)) return;
    const item = allItems.find((i: any) => i.id === itemId);
    setSelectedComponents([...selectedComponents, { menuItemId: itemId, name: item.name, quantity: 1 }]);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (e.target as any).name.value;
    createMutation.mutate({ 
      name, 
      components: selectedComponents.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity })) 
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="font-bold text-slate-500 text-xs uppercase tracking-widest">Kombolar ro'yxati</h2>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center space-x-1"
        >
          <Plus size={16} />
          <span>Yangi kombo</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {combos.map((combo: Combo) => (
          <div key={combo.id} className={`bg-white rounded-xl border p-5 shadow-sm space-y-4 relative ${!combo.isActive ? 'bg-slate-50/50 border-dashed border-slate-300' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-bold ${!combo.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'}`}>{combo.name}</h3>
              <div className="flex items-center space-x-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${combo.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                  {combo.isActive ? 'FAOL' : 'NOFAOL'}
                </span>
                <button 
                  onClick={() => handleToggleComboActive(combo)}
                  className={`p-1 rounded transition-all ${combo.isActive ? 'text-slate-400 hover:text-red-500' : 'text-green-500 hover:text-green-600'}`}
                >
                  {combo.isActive ? <Trash2 size={16} /> : <RotateCcw size={16} />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tarkibi:</div>
              {combo.components.map(comp => (
                <div key={comp.id} className="flex justify-between text-sm text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
                  <span className={!combo.isActive ? 'text-slate-400' : ''}>{comp.menuItem?.name || 'Noma\'lum'}</span>
                  <span className={`font-bold ${!combo.isActive ? 'text-slate-400' : ''}`}>x{comp.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {combos.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400 italic bg-white rounded-xl border border-slate-200">
            Hozircha kombolar yaratilmagan
          </div>
        )}
      </div>

      {isAdding && (
        <Modal title="Yangi kombo yaratish" onClose={() => setIsAdding(false)} maxWidth="max-w-2xl">
          <form onSubmit={handleCreate} className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kombo nomi</label>
                  <input name="name" required className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mahsulot qo'shish</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                    onChange={(e) => handleAddComponent(e.target.value)}
                    value=""
                  >
                    <option value="">Tanlang...</option>
                    {allItems.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700">Tarkibi:</label>
                <div className="bg-slate-50 rounded-lg border border-slate-200 min-h-[120px] p-3 space-y-2">
                  {selectedComponents.map((c, idx) => (
                    <div key={c.menuItemId} className="flex items-center justify-between bg-white p-2 rounded shadow-sm">
                      <span className="text-sm font-medium text-slate-700 truncate mr-2">{c.name}</span>
                      <div className="flex items-center space-x-2 shrink-0">
                        <input 
                          type="number" 
                          min="1" 
                          className="w-12 border border-slate-200 rounded px-1 text-center text-sm"
                          value={c.quantity}
                          onChange={(e) => {
                            const next = [...selectedComponents];
                            next[idx].quantity = Number(e.target.value);
                            setSelectedComponents(next);
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => setSelectedComponents(selectedComponents.filter(sc => sc.menuItemId !== c.menuItemId))}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {selectedComponents.length === 0 && <div className="text-center text-slate-300 text-xs mt-8">Mahsulotlar qo'shilmagan</div>}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button type="button" onClick={() => setIsAdding(false)} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Bekor qilish</button>
              <button type="submit" disabled={selectedComponents.length === 0 || createMutation.isPending} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">Yaratish</button>
            </div>
          </form>
        </Modal>
      )}

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          variant="danger"
          onConfirm={() => { pendingConfirm.onConfirm(); setPendingConfirm(null); }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </div>
  );
}
