import { api } from './client';

export type Table = {
  id: string;
  name: string;
  type: 'TABLE' | 'ROOM';
  displayOrder: number;
  isActive: boolean;
  /**
   * ID of the order OCCUPYING this table — set only for a SENT order.
   * An unsent DRAFT (even the current waiter's own) does NOT occupy a
   * table: such tables come back with `activeOrderId: null` and count as
   * free/selectable. To resume your own draft, use the "mine" order list
   * (GET /api/orders?mine=true), not this field.
   */
  activeOrderId: string | null;
};

export const tablesApi = {
  list: () => api.get<Table[]>('/api/tables'),
};
