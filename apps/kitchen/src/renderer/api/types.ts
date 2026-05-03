export type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'CANCELED';

export type TicketLine = {
  id: string;
  nameSnapshot: string;
  quantity: number;
  notes: string | null;
  comboGroupId: string | null;
  comboNameSnapshot: string | null;
  isCanceled: boolean;
};

export type Ticket = {
  id: string;
  orderId: string;
  status: TicketStatus;
  startedAt: string | null;
  readyAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderType: 'DINE_IN' | 'TAKEAWAY';
    table: { id: string; name: string } | null;
    waiter: { id: string; fullName: string };
    status: string; // Order status to detect if order is canceled
  };
  lines: TicketLine[];
};
