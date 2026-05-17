import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { menuApi } from '@/api/menu';
import { formatMoney } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function MenuPage() {
  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['menu'],
    queryFn: menuApi.list,
    staleTime: 30_000,
  });
  const { data: combos = [] } = useQuery({
    queryKey: ['menu', 'combos'],
    queryFn: menuApi.combos,
    staleTime: 30_000,
  });

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const activeCombos = combos.filter((c) => c.isActive);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showCombos, setShowCombos] = useState(false);
  const currentId = activeId ?? categories[0]?.id ?? null;
  const currentCat = categories.find((c) => c.id === currentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return <div className="text-center py-16 text-destructive">Menyu yuklab bo&apos;lmadi</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">Menyu</h2>
        <p className="text-sm text-muted-foreground">Faqat ko&apos;rish</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {activeCombos.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCombos(true)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              showCombos
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-accent',
            )}
          >
            Set menyu
          </button>
        )}
        {categories.map((cat) => {
          const active = !showCombos && currentId === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveId(cat.id);
                setShowCombos(false);
              }}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground hover:bg-accent',
              )}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {showCombos ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {activeCombos.map((combo) => {
            const total = combo.components.reduce(
              (sum, c) => sum + c.menuItem.price * c.quantity,
              0,
            );
            return (
              <Card key={combo.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{combo.name}</div>
                  <Badge variant="default">SET</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {combo.components.map((c) => `${c.menuItem.name} × ${c.quantity}`).join('  ·  ')}
                </div>
                <div className="text-right text-sm font-bold tabular-nums">
                  {formatMoney(total)} so&apos;m
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {(currentCat?.items ?? []).map((item) => {
            const available = item.effectivelyAvailable;
            return (
              <Card
                key={item.id}
                className={cn('p-3 flex flex-col gap-2', !available && 'opacity-50 bg-muted/40')}
              >
                <div className="text-sm font-semibold line-clamp-2">{item.name}</div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-primary tabular-nums">
                    {formatMoney(item.price)}
                  </div>
                  {!available && (
                    <Badge variant="secondary" className="text-[10px]">Yo&apos;q</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
