import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { ordersApi, type ConfirmBody } from '@/api/orders';
import { usePageTitle } from '@/hooks/usePageTitle';
import { Screen } from '@/components/layout/Screen';
import { Chip } from '@/components/blocks';
import { QueueList } from '@/components/approval/QueueList';
import { OrderTicket } from '@/components/approval/OrderTicket';
import { printFailureNotice, type PrintFailureNotice } from '@/lib/confirm-result';

/**
 * The sale is closed and paid; only the slip is missing. The notice stays up
 * until the admin reprints or dismisses it, and a reprint that fails too shows
 * it again, in Uzbek, rather than the server's English message.
 */
function showPrintFailure(orderId: string, notice: PrintFailureNotice): void {
  toast.error(notice.title, {
    description: notice.description,
    duration: Infinity,
    // sonner draws its action at 24 px / 12 px; the till needs 48 px / 13 px.
    classNames: { actionButton: '!h-12 !px-4 !text-[13px]' },
    action: {
      label: 'Qayta chop etish',
      onClick: () => {
        ordersApi
          .reprintBill(orderId, 'Tasdiqlashda chop etilmadi')
          .then(() => toast.success('Chek chop etildi'))
          .catch((error: Error) => {
            showPrintFailure(
              orderId,
              printFailureNotice({ billPrinted: false, printError: error.message }) ?? notice,
            );
          });
      },
    },
  });
}

/**
 * The confirm loop: queue on the left, the order in hand on the right.
 *
 * The ticket is a panel rather than a modal, so its total and its confirm
 * button cannot be scrolled off the screen by a long order or by adding a
 * nasiya leg — the failure the layout audit rated worst.
 */
export function ApprovalQueuePage() {
  usePageTitle('Tasdiqlash');
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ['orders', 'sent'],
    queryFn: () => ordersApi.list({ status: 'SENT' }),
    refetchInterval: 15000,
  });

  // The queue is live: keep a selection only while its order is still in it.
  useEffect(() => {
    if (selectedId && !orders.some((order) => order.id === selectedId)) {
      setSelectedId(null);
    }
  }, [orders, selectedId]);

  const selectedSummary = orders.find((order) => order.id === selectedId) ?? null;

  // The list payload carries no lines; the ticket needs them.
  const { data: selected } = useQuery({
    queryKey: ['orders', selectedId],
    queryFn: () => ordersApi.getById(selectedId as string),
    enabled: !!selectedId,
  });

  const confirmMutation = useMutation({
    mutationFn: (body: ConfirmBody) => ordersApi.confirm(selectedId as string, body),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['finance'] });
      setSelectedId(null);
      const notice = printFailureNotice(result);
      if (!notice) {
        toast.success('Buyurtma tasdiqlandi');
        return;
      }
      showPrintFailure(result.id, notice);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ticketOrder = selected ?? selectedSummary;

  return (
    <>
      <Screen
        title="Tasdiqlash"
        status={<Chip tone={orders.length > 0 ? 'live' : 'inert'}>{orders.length} ta kutmoqda</Chip>}
        panel={
          ticketOrder ? (
            <OrderTicket
              key={ticketOrder.id}
              order={ticketOrder}
              submitting={confirmMutation.isPending}
              error={confirmMutation.error?.message ?? null}
              onConfirm={(body) => confirmMutation.mutate(body)}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center bg-field px-pad text-center text-[14px] text-muted-foreground">
              {orders.length > 0
                ? 'Tasdiqlash uchun buyurtmani tanlang'
                : 'Tasdiqlanishi kutilayotgan buyurtma yo\'q'}
            </div>
          )
        }
      >
        <QueueList orders={orders} selectedId={selectedId} onSelect={(order) => setSelectedId(order.id)} />
      </Screen>
    </>
  );
}
