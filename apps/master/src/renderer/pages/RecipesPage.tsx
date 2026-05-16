import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Loader2, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { menuApi, type MenuItem } from '@/api/menu';
import { recipesApi, type Recipe } from '@/api/recipes';
import { ingredientsApi, type Ingredient } from '@/api/ingredients';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DataTable, type DataTableColumn } from '@/components/data/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Row = {
  item: MenuItem;
  recipe: Recipe | null;
};

type EditorIngredientRow = {
  ingredientId: string;
  quantity: string;
};

function recipeStatus(recipe: Recipe | null): {
  label: string;
  variant: 'default' | 'outline' | 'secondary';
  className?: string;
} {
  if (!recipe) return { label: "Retsept yo'q", variant: 'outline' };
  if (!recipe.isComplete) return { label: 'Tayyor emas', variant: 'secondary' };
  return {
    label: 'Faol',
    variant: 'default',
    className: 'bg-success text-success-foreground hover:bg-success/90',
  };
}

export function RecipesPage() {
  usePageTitle('Retseptlar');
  const queryClient = useQueryClient();

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [rows, setRows] = useState<EditorIngredientRow[]>([]);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ['menu', 'items'],
    queryFn: () => menuApi.listItems(),
  });

  const { data: ingredients } = useQuery({
    queryKey: ['ingredients', { parentMenuItemId: editingItem?.id ?? null }],
    enabled: !!editingItem,
    queryFn: () => ingredientsApi.list({ isActive: true, parentMenuItemId: editingItem!.id }),
  });

  const ingredientById = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i.id, i] as const)),
    [ingredients],
  );

  const recipeQueries = useQuery({
    queryKey: ['recipes', 'by-menu-items', items?.map((i) => i.id).join(',') ?? ''],
    enabled: !!items && items.length > 0,
    queryFn: async () => {
      const map = new Map<string, Recipe | null>();
      // Sequential fetches are fine at our scale.
      for (const item of items ?? []) {
        const recipe = await recipesApi.getForMenuItem(item.id);
        map.set(item.id, recipe);
      }
      return map;
    },
  });

  const rowsForTable: Row[] = useMemo(
    () =>
      (items ?? [])
        .filter((item) => item.kind !== 'SERVICE')
        .map((item) => ({ item, recipe: recipeQueries.data?.get(item.id) ?? null })),
    [items, recipeQueries.data],
  );

  const upsertMutation = useMutation({
    mutationFn: ({ menuItemId, body }: { menuItemId: string; body: { ingredients: { ingredientId: string; quantity: number }[]; notes: string | null } }) =>
      recipesApi.upsertForMenuItem(menuItemId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Retsept saqlandi');
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  const completeMutation = useMutation({
    mutationFn: ({ menuItemId, isComplete }: { menuItemId: string; isComplete: boolean }) =>
      recipesApi.setComplete(menuItemId, isComplete),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Retsept holati yangilandi');
      setErrorMsg(null);
    },
    onError: (err: Error) => setErrorMsg(err.message),
  });

  // When the editing item changes, prime the editor rows from the existing recipe (if any).
  useEffect(() => {
    if (!editingItem) {
      setRows([]);
      setNotes('');
      setErrorMsg(null);
      return;
    }
    const existing = recipeQueries.data?.get(editingItem.id) ?? null;
    if (existing) {
      setRows(existing.ingredients.map((row) => ({ ingredientId: row.ingredientId, quantity: row.quantity })));
      setNotes(existing.notes ?? '');
    } else {
      setRows([]);
      setNotes('');
    }
    setErrorMsg(null);
  }, [editingItem, recipeQueries.data]);

  const editingRecipe = editingItem ? recipeQueries.data?.get(editingItem.id) ?? null : null;

  const blockingIngredientIds = useMemo(
    () =>
      new Set(
        rows
          .map((row) => ingredientById.get(row.ingredientId))
          .filter((ing): ing is Ingredient => !!ing && (Number(ing.weightedAvgCost) <= 0 || !ing.isActive))
          .map((ing) => ing.id),
      ),
    [rows, ingredientById],
  );

  const canActivate = rows.length > 0
    && rows.every((row) => Number(row.quantity) > 0 && !!row.ingredientId)
    && blockingIngredientIds.size === 0;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Taom',
      cell: (row) => <span className="font-medium">{row.item.name}</span>,
    },
    {
      key: 'ingredients',
      header: 'Mahsulot soni',
      align: 'right',
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.recipe?.ingredients.length ?? 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Holat',
      cell: (row) => {
        const status = recipeStatus(row.recipe);
        return (
          <Badge variant={status.variant} className={status.className}>
            {status.label}
          </Badge>
        );
      },
    },
  ];

  const addRow = () => setRows((prev) => [...prev, { ingredientId: '', quantity: '' }]);

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const setRowField = (idx: number, field: keyof EditorIngredientRow, value: string) =>
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));

  const onSave = async () => {
    if (!editingItem) return;
    setErrorMsg(null);
    const cleaned = rows
      .filter((row) => row.ingredientId && row.quantity)
      .map((row) => ({ ingredientId: row.ingredientId, quantity: Number(row.quantity) }));
    if (cleaned.length === 0) {
      setErrorMsg("Kamida bir mahsulot kerak");
      return;
    }
    if (cleaned.some((row) => !Number.isFinite(row.quantity) || row.quantity <= 0)) {
      setErrorMsg('Barcha miqdorlar 0 dan katta bo\'lishi kerak');
      return;
    }
    await upsertMutation.mutateAsync({
      menuItemId: editingItem.id,
      body: { ingredients: cleaned, notes: notes.trim() || null },
    });
  };

  const onToggleActive = async () => {
    if (!editingItem) return;
    setErrorMsg(null);
    await completeMutation.mutateAsync({
      menuItemId: editingItem.id,
      isComplete: !(editingRecipe?.isComplete ?? false),
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <PageContent>
        <PageHeader
          title="Retseptlar"
          description="Har bir taom uchun ishlatiladigan mahsulotlar miqdori. Retsept faollashganda buyurtmada hisoblanadi."
        />

        <DataTable
          columns={columns}
          data={rowsForTable}
          isLoading={itemsLoading || recipeQueries.isLoading}
          rowKey={(row) => row.item.id}
          onRowClick={(row) => setEditingItem(row.item)}
          emptyState={
            <EmptyState
              icon={BookOpen}
              title="Menyu bo'sh"
              hint="Avval menyu mahsulotini qo'shing, keyin retsept tuzasiz."
            />
          }
        />

        <Sheet open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
          <SheetContent className="sm:max-w-xl flex flex-col">
            <SheetHeader>
              <SheetTitle>{editingItem?.name}</SheetTitle>
              <SheetDescription>
                Bu taomni tayyorlash uchun nima ishlatiladi? Miqdorlar mahsulotning retsept birligida (g, ml, dona).
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-auto py-4 space-y-4">
              <div className="space-y-2">
                {rows.length === 0 && (
                  <p className="text-xs text-muted-foreground">Hozircha mahsulot qo'shilmagan.</p>
                )}
                {rows.map((row, idx) => {
                  const ingredient = ingredientById.get(row.ingredientId);
                  const blocking = blockingIngredientIds.has(row.ingredientId);
                  return (
                    <div key={idx} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`recipe-ing-${idx}`}>Mahsulot</Label>
                        <Select
                          value={row.ingredientId}
                          onValueChange={(value) => setRowField(idx, 'ingredientId', value)}
                        >
                          <SelectTrigger id={`recipe-ing-${idx}`}>
                            <SelectValue placeholder="Mahsulot tanlang" />
                          </SelectTrigger>
                          <SelectContent>
                            {(ingredients ?? []).map((i) => (
                              <SelectItem key={i.id} value={i.id}>
                                {i.name}{Number(i.weightedAvgCost) <= 0 ? ' (xarid yo\'q)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {blocking && (
                          <p className="text-xs text-warning-foreground/80">
                            Bu mahsulot uchun xarid yo'q yoki faol emas — faollashtirishga to'sqinlik qiladi.
                          </p>
                        )}
                      </div>
                      <div className="w-28 space-y-1.5">
                        <Label htmlFor={`recipe-qty-${idx}`}>
                          Miqdor {ingredient && <span className="text-muted-foreground">({ingredient.recipeUnit})</span>}
                        </Label>
                        <Input
                          id={`recipe-qty-${idx}`}
                          type="number"
                          step="0.001"
                          value={row.quantity}
                          onChange={(e) => setRowField(idx, 'quantity', e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(idx)}
                        title="Olib tashlash"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" onClick={addRow} className="mt-2">
                  <Plus className="h-4 w-4" />
                  Mahsulot qo'shish
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-notes">Eslatma (ixtiyoriy)</Label>
                <Textarea
                  id="recipe-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Tayyorlash bo'yicha eslatma"
                />
              </div>

              {errorMsg && (
                <Alert variant="destructive">
                  <AlertDescription>{errorMsg}</AlertDescription>
                </Alert>
              )}
            </div>

            <SheetFooter className="border-t pt-3 flex-col sm:flex-row gap-2">
              {editingRecipe && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant={editingRecipe.isComplete ? 'outline' : 'default'}
                        onClick={onToggleActive}
                        disabled={completeMutation.isPending || (!editingRecipe.isComplete && !canActivate)}
                        className="w-full sm:w-auto"
                      >
                        {completeMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                        {editingRecipe.isComplete ? "To'xtatish" : 'Faollashtirish'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!editingRecipe.isComplete && !canActivate && (
                    <TooltipContent>
                      <p className="max-w-xs text-xs">Bir nechta mahsulot uchun xarid yo'q yoki retsept bo'sh.</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setEditingItem(null)}>
                Yopish
              </Button>
              <Button onClick={onSave} disabled={upsertMutation.isPending}>
                {upsertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Saqlash
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </PageContent>
    </TooltipProvider>
  );
}
