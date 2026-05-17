import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tablesApi } from '@/api/tables';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function TablesPage() {
  const nav = useNavigate();
  const {
    data: tables = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.list,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return <div className="text-center py-16 text-destructive">Stollarni yuklab bo&apos;lmadi</div>;
  }

  const active = tables.filter((t) => t.isActive);
  const occupied = active.filter((t) => !!t.activeOrderId).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Stollar</h2>
        <p className="text-sm text-muted-foreground">
          Jami {active.length} ta — {occupied} ta band
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
        {active.map((t) => {
          const isOccupied = !!t.activeOrderId;
          return (
            <Card
              key={t.id}
              className={cn(
                'aspect-square flex flex-col items-center justify-center gap-1 transition-colors',
                isOccupied
                  ? 'bg-warning/10 border-warning/40 cursor-pointer hover:border-warning'
                  : 'border-primary/40',
              )}
              onClick={
                isOccupied
                  ? () => t.activeOrderId && nav(`/orders/${t.activeOrderId}`)
                  : undefined
              }
            >
              <div className="text-base font-bold">{t.name}</div>
              <div
                className={cn(
                  'text-[11px] font-medium',
                  isOccupied ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                {isOccupied ? 'Band' : "Bo'sh"}
              </div>
              <div className="text-[10px] text-muted-foreground">{t.type === 'ROOM' ? 'Xona' : 'Stol'}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
