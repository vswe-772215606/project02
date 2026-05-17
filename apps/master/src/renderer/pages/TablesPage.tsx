import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Armchair, Plus, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { tablesApi, type Table as TableModel } from '../api/tables';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageHeader } from '@/components/feedback/PageHeader';
import { PageContent } from '@/components/feedback/PageContent';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { cn } from '@/lib/utils';

const tableSchema = z.object({
  name: z.string().min(1, "Nom kiritilishi shart"),
  type: z.enum(['TABLE', 'ROOM']),
  displayOrder: z.number().int(),
});

type TableForm = z.infer<typeof tableSchema>;

export function TablesPage() {
  usePageTitle('Stollar');
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editTable, setEditTable] = useState<TableModel | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables', showInactive],
    queryFn: () => tablesApi.list(showInactive),
  });

  const sortedTables = useMemo(() => {
    const sorted = [...tables].sort((a, b) => a.displayOrder - b.displayOrder);
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.name.toLowerCase().includes(q));
  }, [tables, search]);

  const createMutation = useMutation({
    mutationFn: (data: TableForm) => tablesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsAdding(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TableModel> }) => tablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setEditTable(null);
    },
  });

  const handleToggleActive = (table: TableModel) => {
    if (table.isActive) {
      setPendingConfirm({
        message: `"${table.name}" stolini faolsizlantirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: table.id, data: { isActive: false } }),
      });
    } else {
      setPendingConfirm({
        message: `"${table.name}" stolini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => updateMutation.mutate({ id: table.id, data: { isActive: true } }),
      });
    }
  };

  const dialogOpen = isAdding || !!editTable;

  return (
    <PageContent>
      <PageHeader
        title="Stollar"
        description="Stollar va xonalar — ofitsiantlar buyurtmani shu yerga biriktiradi."
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
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4" />
              Yangi stol
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 h-9 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Nom bo'yicha qidirish (Stol 1, Xona 2)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-muted-foreground hover:text-foreground"
            title="Tozalash"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Card key={idx}>
              <CardContent className="p-5 space-y-3">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedTables.length === 0 ? (
        <EmptyState
          icon={Armchair}
          title={search.trim() ? 'Hech narsa topilmadi' : "Stollar yo'q"}
          hint={
            search.trim()
              ? 'Boshqa nom bilan qidirib ko\'ring.'
              : "Yangi stol yoki xona qo'shing — ofitsiant buyurtmani shu yerga biriktiradi."
          }
          action={
            !search.trim() ? (
              <Button onClick={() => setIsAdding(true)}>
                <Plus className="h-4 w-4" />
                Yangi stol
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sortedTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onEdit={() => setEditTable(table)}
              onToggleActive={() => handleToggleActive(table)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditTable(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <TableFormDialog
            key={editTable?.id ?? 'new'}
            table={editTable}
            onClose={() => {
              setIsAdding(false);
              setEditTable(null);
            }}
            onSave={(data) =>
              editTable
                ? updateMutation.mutate({ id: editTable.id, data })
                : createMutation.mutate(data)
            }
            isPending={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {pendingConfirm && (
        <ConfirmDialog
          message={pendingConfirm.message}
          variant="danger"
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}
    </PageContent>
  );
}

function TableCard({
  table,
  onEdit,
  onToggleActive,
}: {
  table: TableModel;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  const busy = !!table.activeOrderId;
  return (
    <Card className={cn(!table.isActive && 'border-dashed bg-muted/30')}>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'p-2.5 rounded-md border',
              !table.isActive
                ? 'bg-muted text-muted-foreground border-border'
                : busy
                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                  : 'bg-success/10 text-success border-success/20',
            )}
          >
            <Armchair className="h-5 w-5" />
          </div>
          {table.isActive ? (
            <Badge
              variant="outline"
              className={cn(
                'font-medium gap-1.5',
                busy
                  ? 'bg-destructive/10 text-destructive border-destructive/20'
                  : 'bg-success/10 text-success border-success/20',
              )}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  busy ? 'bg-destructive animate-pulse' : 'bg-success',
                )}
              />
              {busy ? 'Band' : "Bo'sh"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Nofaol</Badge>
          )}
        </div>

        <div>
          <h3
            className={cn(
              'text-lg font-semibold truncate',
              !table.isActive && 'text-muted-foreground line-through',
            )}
          >
            {table.name}
          </h3>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
            {table.type === 'ROOM' ? 'Xona' : 'Stol'}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span className="tabular-nums">#{table.displayOrder}</span>
          </p>
        </div>

        <div className="flex items-center justify-end gap-1 pt-2 border-t border-border/60">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Tahrirlash">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleActive}
            title={table.isActive ? 'Faolsizlantirish' : 'Faollashtirish'}
            className={table.isActive ? 'text-muted-foreground hover:text-destructive' : 'text-success hover:text-success'}
          >
            {table.isActive ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TableFormDialog({
  table,
  onClose,
  onSave,
  isPending,
}: {
  table: TableModel | null;
  onClose: () => void;
  onSave: (data: TableForm) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TableForm>({
    resolver: zodResolver(tableSchema),
    defaultValues: table
      ? { name: table.name, type: table.type, displayOrder: table.displayOrder }
      : { name: '', type: 'TABLE', displayOrder: 0 },
  });

  const type = watch('type');

  return (
    <>
      <DialogHeader>
        <DialogTitle>{table ? 'Stolni tahrirlash' : 'Yangi stol'}</DialogTitle>
        <DialogDescription>
          Stol yoki xonaning nomi va tartib raqami.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="table-name">Stol nomi / raqami</Label>
          <Input
            id="table-name"
            autoFocus
            placeholder="Masalan: Stol 1 yoki VIP 1"
            {...register('name')}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="table-type">Turi</Label>
            <Select value={type} onValueChange={(v) => setValue('type', v as 'TABLE' | 'ROOM')}>
              <SelectTrigger id="table-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TABLE">Oddiy stol</SelectItem>
                <SelectItem value="ROOM">Xona</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="table-order">Tartib raqami</Label>
            <Input
              id="table-order"
              type="number"
              className="tabular-nums"
              {...register('displayOrder', { valueAsNumber: true })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={isPending}>
            Saqlash
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
