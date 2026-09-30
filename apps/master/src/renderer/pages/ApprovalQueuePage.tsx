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
 * until the admin reprints or closes it, and a reprint that fails too shows it
 * again, in Uzbek, rather than the server's English message.
 *
 * It sits at the top centre: the bottom-right corner is the ticket rail, whose
 * foot is the next bill's TASDIQLASH button, and a notice that stays up must
 * never cover that. The reprint's own progress toast sits there too.
 */
function showPrintFailure(orderId: string, notice: PrintFailureNotice): void {
  toast.error(notice.title, {
    description: notice.description,
    duration: Infinity,
    position: 'top-center',
    classNames: {
      // sonner lays a notice out in one row; two 48 px buttons beside the text
      // would leave it a 77 px column. Let the text take the row and the
      // buttons wrap under it, pressed to the right.
      toast: '!flex-wrap !gap-y-3',
      content: '!grow !basis-[calc(100%-2rem)]',
      // sonner draws its buttons at 24 px / 12 px; the till needs 48 px / 13 px, square.
      cancelButton: '!ml-auto !h-12 !px-4 !text-[13px] !rounded-none',
      actionButton: '!ml-0 !h-12 !px-4 !text-[13px] !rounded-none',
    },
    cancel: { label: 'Yopish', onClick: () => {} },
    action: {
      label: 'Qayta chop etish',
      onClick: () => {
        // A reprint can wait behind the print queue for seconds: show that it is
        // happening, so nobody taps twice.
        const printing = toast.loading('Chek chop etilmoqda…', { position: 'top-center' });
        ordersApi
          .reprintBill(orderId, 'Tasdiqlashda chop etilmadi')
          .then(() => toast.success('Chek chop etildi', { id: printing }))
          .catch((error: Error) => {
            toast.dismiss(printing);
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
      // order:closed reaches the screens before the bill prints, so the admin may
      // have picked another bill while this one printed: clear the selection only
      // if it is still the bill that was just confirmed.
      setSelectedId((current) => (current === result.id ? null : current));
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
