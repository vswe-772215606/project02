import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { tablesApi, type Table as TableModel } from '@/api/tables';
import { ordersApi } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/blocks';
import { Button } from '@/components/ui/button';
import { TableGrid } from '@/components/tables/TableGrid';
import { TablePanel, type TableEditPayload } from '@/components/tables/TablePanel';
import { NewTablePanel } from '@/components/tables/NewTablePanel';

/**
 * Stollar — the floor.
 *
 * A grid of Tiles stands in for the room: fill carries occupancy, the panel
 * on the right carries everything you can do about it. Renaming and
 * activating/deactivating used to be icons 4px apart on a card; both now live
 * in the panel, where there is room to label them.
 */
export function TablesPage() {
  usePageTitle('Stollar');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showInactive, setShowInactive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', showInactive],
    queryFn: () => tablesApi.list(showInactive),
  });

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => a.displayOrder - b.displayOrder),
    [tables],
  );

  const activeTables = useMemo(() => tables.filter((t) => t.isActive), [tables]);
  const occupiedCount = activeTables.filter((t) => t.activeOrderId).length;
  const freeCount = activeTables.length - occupiedCount;

  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const { data: order = null } = useQuery({
    queryKey: ['orders', selected?.activeOrderId],
    queryFn: () => ordersApi.getById(selected?.activeOrderId as string),
    enabled: !!selected?.activeOrderId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof tablesApi.create>[0]) => tablesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      toast.success('Stol qo\'shildi');
      setCreating(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TableModel> }) => tablesApi.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tables'] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSelect = (table: TableModel) => {
    setCreating(false);
    setSelectedId(table.id);
  };

  const handleSave = (data: TableEditPayload) => {
    if (!selected) return;
    updateMutation.mutate(
      { id: selected.id, data },
      { onSuccess: () => toast.success('Saqlandi') },
    );
  };

  const handleToggleActive = () => {
    if (!selected) return;
    updateMutation.mutate(
      { id: selected.id, data: { isActive: !selected.isActive } },
      { onSuccess: () => toast.success('Saqlandi') },
    );
  };

  return (
    <Screen
      title="Stollar"
      status={
        <>
          <Chip tone="live">Band {occupiedCount}</Chip>
          <Chip tone="inert">Bo'sh {freeCount}</Chip>
          <Button
            size="sm"
            variant={showInactive ? 'default' : 'secondary'}
            onClick={() => setShowInactive((v) => !v)}
          >
            Nofaollarni ko'rsatish
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
            }}
          >
            + Yangi stol
          </Button>
        </>
      }
      panel={
        creating ? (
          <NewTablePanel
            submitting={createMutation.isPending}
            error={createMutation.error instanceof Error ? createMutation.error.message : null}
            onCancel={() => setCreating(false)}
            onSave={(data) => createMutation.mutate(data)}
          />
        ) : selected ? (
          <TablePanel
            key={selected.id}
            table={selected}
            order={order}
            submitting={updateMutation.isPending}
            error={updateMutation.error instanceof Error ? updateMutation.error.message : null}
            onSave={handleSave}
            onToggleActive={handleToggleActive}
            onGoToApproval={() => navigate('/approval-queue')}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
            Stolni tanlang
          </div>
        )
      }
    >
      <TableGrid tables={sortedTables} selectedId={selectedId} onSelect={handleSelect} />
    </Screen>
  );
}
