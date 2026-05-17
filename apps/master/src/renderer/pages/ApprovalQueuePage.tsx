import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { ordersApi, type Order } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { PageContent } from '@/components/feedback/PageContent';
import { PageHeader } from '@/components/feedback/PageHeader';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { ApprovalCard } from '@/components/approval/ApprovalCard';
import { WalkoutOrderDialog } from '@/components/approval/WalkoutOrderDialog';

function ApprovalCardSkeleton() {
  return (
    <Card className="flex flex-col">
      <CardHeader className="space-y-2 pb-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent className="flex-1 space-y-3 pb-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-5 w-full" />
      </CardContent>
      <CardFooter className="gap-2 pt-0">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 flex-[2]" />
      </CardFooter>
    </Card>
  );
}

export function ApprovalQueuePage() {
  usePageTitle('Tasdiqlash');
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
  const [walkoutOrder, setWalkoutOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'sent'],
    queryFn: () => ordersApi.list({ status: 'SENT' }),
    refetchInterval: 15000,
  });

  return (
    <PageContent>
      <PageHeader
        title="Tasdiqlash"
        description="Yuborilgan buyurtmalar — tasdiqlash va to'lovni qabul qilish"
        actions={
          <Badge variant="outline" className="bg-info/10 text-info border-info/30 tabular-nums">
            Faol: {orders.length}
          </Badge>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <ApprovalCardSkeleton key={idx} />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Tasdiqlanishi kutilayotgan buyurtmalar yo'q"
            hint="Ofitsiantlar yangi buyurtma yuborganda, ular shu yerda paydo bo'ladi."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order) => (
            <ApprovalCard
              key={order.id}
              order={order}
              onConfirm={() => setConfirmOrder(order)}
              onWalkout={() => setWalkoutOrder(order)}
            />
          ))}
        </div>
      )}

      {confirmOrder && (
        <ConfirmModal
          order={confirmOrder}
          open
          onClose={() => setConfirmOrder(null)}
        />
      )}

      <WalkoutOrderDialog
        order={walkoutOrder}
        open={!!walkoutOrder}
        onClose={() => setWalkoutOrder(null)}
      />
    </PageContent>
  );
}
