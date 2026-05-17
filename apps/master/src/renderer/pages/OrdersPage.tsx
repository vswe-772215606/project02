import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Armchair,
  Ban,
  ChevronDown,
  History,
  Printer,
  ReceiptText,
  Search,
  User as UserIcon,
} from 'lucide-react';
import { Order, ordersApi } from '../api/orders';
import { formatDateTimeUZ, formatUZS } from '../utils/format';
import { OrderStatus, StatusBadge } from '../components/StatusBadge';
import { Modal } from '../components/Modal';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function locationLabel(order: Order) {
  return (
    order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')
  );
}

const TABS: { status: OrderStatus }[] = [
  { status: 'SENT' },
  { status: 'CLOSED' },
  { status: 'WALKOUT' },
  { status: 'CANCELED' },
];

const TAB_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'Qoralama',
  SENT: 'Yuborilgan',
  CLOSED: 'Yopilgan',
  WALKOUT: "To'lovsiz ketdi",
  CANCELED: 'Bekor qilingan',
};

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatus>('SENT');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', activeTab],
    queryFn: () =>
      ordersApi.list({
        status: activeTab,
        date: activeTab === 'CLOSED' ? localDateString() : undefined,
      }),
  });

  const { data: activeOrders = [] } = useQuery({
    queryKey: ['orders', 'active_counts'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const counts = activeOrders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredOrders = orders.filter(
    (o) =>
      (o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (o.tableName && o.tableName.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ReceiptText className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Buyurtmalar</h1>
        </div>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Buyurtma yoki stol..."
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 w-64 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl overflow-x-auto no-scrollbar">
        {TABS.map((tab) => {
          const count = counts[tab.status] ?? 0;
          return (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                activeTab === tab.status
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <span>{TAB_LABELS[tab.status]}</span>
              {(count > 0 || activeTab === tab.status) && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    activeTab === tab.status
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <History className="mx-auto mb-3 opacity-20" size={48} />
            <p>Hech qanday buyurtma topilmadi</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <OrderListItem
              key={order.id}
              order={order}
              isExpanded={expandedId === order.id}
              onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
              onCancel={() => setCancelOrder(order)}
            />
          ))
        )}
      </div>

      {cancelOrder && (
        <CancelOrderModal order={cancelOrder} onClose={() => setCancelOrder(null)} />
      )}
    </div>
  );
}

function OrderListItem({
  order,
  isExpanded,
  onToggle,
  onCancel,
}: {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
}) {
  const [reprintSuccess, setReprintSuccess] = useState(false);
  const reprintMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.reprintBill(order.id, reason),
    onSuccess: () => {
      setReprintSuccess(true);
      setTimeout(() => setReprintSuccess(false), 3000);
    },
  });

  return (
    <div
      className={`bg-white rounded-md border transition-all duration-200 ${
        isExpanded
          ? 'border-slate-800 shadow-md ring-1 ring-slate-800/5'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Grid Header */}
      <div
        className={`grid grid-cols-12 items-center cursor-pointer select-none ${
          isExpanded ? 'bg-slate-50' : ''
        }`}
        onClick={onToggle}
      >
        <div className="col-span-1 py-3 pl-4 border-r border-slate-100">
          <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">
            ID
          </div>
          <div className="text-sm font-black text-slate-900 leading-none">
            {order.orderNumber}
          </div>
        </div>

        <div className="col-span-5 py-3 px-4 border-r border-slate-100 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Armchair size={14} className="text-slate-400" />
            <span className="text-sm font-black text-slate-900 truncate">
              {locationLabel(order)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <UserIcon size={12} className="text-slate-300" />
            <span className="truncate">{order.waiter?.fullName}</span>
          </div>
        </div>

        <div className="col-span-2 py-3 px-4 border-r border-slate-100">
          <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">
            VAQT
          </div>
          <div className="text-[11px] font-bold text-slate-700">
            {formatDateTimeUZ(order.createdAt)}
          </div>
        </div>

        <div className="col-span-3 py-3 px-4 flex items-center justify-between min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">
              SUMMA
            </div>
            <div className="text-sm font-black text-slate-900 leading-none">
              {formatUZS(order.totalSnapshot || order.totalAmount || 0)}
            </div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="col-span-1 py-3 pr-4 flex justify-end">
          <div
            className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <ChevronDown size={18} className="text-slate-400" />
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-slate-200 animate-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-12">
            <div className="col-span-8 p-4 border-r border-slate-100">
              <div className="flex items-center justify-between mb-4 border-b border-slate-50 pb-2">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <ReceiptText size={14} className="text-slate-400" />
                  <span>Buyurtma tarkibi</span>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase">
                  {order.itemCount} pozitsiya
                </span>
              </div>

              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {order.lines?.map((line) => (
                  <div
                    key={line.id}
                    className={`grid grid-cols-12 gap-2 py-1.5 px-2 rounded ${
                      line.isCanceled ? 'bg-red-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="col-span-1 text-xs font-black text-slate-400">
                      {line.quantity}×
                    </div>
                    <div className="col-span-8">
                      <div
                        className={`text-xs font-bold ${
                          line.isCanceled ? 'text-slate-400 line-through' : 'text-slate-800'
                        }`}
                      >
                        {line.nameSnapshot}
                      </div>
                      {line.notes && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <AlertCircle size={10} className="text-blue-500" />
                          <span className="text-[10px] text-blue-600 font-medium">
                            {line.notes}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      className={`col-span-3 text-right text-xs font-black ${
                        line.isCanceled ? 'text-slate-300 line-through' : 'text-slate-700'
                      }`}
                    >
                      {formatUZS((line.price || 0) * line.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-4 bg-slate-50/30 p-4">
              <div className="space-y-6">
                <div className="bg-slate-900 rounded-md p-4 text-white shadow-inner">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 border-b border-slate-800 pb-2">
                    Moliyaviy jami
                  </div>
                  <div className="space-y-2 text-xs font-bold">
                    <div className="flex justify-between text-slate-400">
                      <span>JAMI</span>
                      <span>
                        {formatUZS(order.subtotalSnapshot || order.totalAmount || 0)}
                      </span>
                    </div>
                    {(order.discountAmountSnapshot || 0) > 0 && (
                      <div className="flex justify-between text-red-400">
                        <span>CHEGIRMA</span>
                        <span>-{formatUZS(order.discountAmountSnapshot || 0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-400">
                      <span>XIZMAT HAQI</span>
                      <span>{formatUZS(order.serviceChargeSnapshot || 0)}</span>
                    </div>
                    <div className="pt-3 mt-1 border-t border-slate-800 flex justify-between items-baseline">
                      <span className="text-[10px] text-slate-500">YAKUNIY SUMMA</span>
                      <span className="text-xl font-black text-blue-400 tracking-tighter">
                        {formatUZS(order.totalSnapshot || order.totalAmount || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                    Amallar
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.status === 'SENT' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCancel();
                        }}
                        className="bg-white text-red-600 border border-red-200 px-4 py-2 rounded text-[10px] font-black hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                      >
                        <Ban size={12} />
                        <span>BUYURTMANI BEKOR QILISH</span>
                      </button>
                    )}

                    {(order.status === 'CLOSED' || order.status === 'WALKOUT') &&
                      (reprintSuccess ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded text-[10px] font-black flex items-center gap-2">
                          <Printer size={12} />
                          <span>YUBORILDI</span>
                        </span>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            reprintMutation.mutate('Admin re-print');
                          }}
                          className="bg-white text-slate-600 border border-slate-200 px-4 py-2 rounded text-[10px] font-black hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
                        >
                          <Printer size={12} />
                          <span>CHEKNI QAYTA CHOP ETISH</span>
                        </button>
                      ))}
                  </div>
                </div>

                {order.status === 'CLOSED' && order.closedAt && (
                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-black uppercase">
                    <History size={12} />
                    <span>Yopildi: {formatDateTimeUZ(order.closedAt)}</span>
                  </div>
                )}
                {order.status === 'CANCELED' && order.cancelReason && (
                  <div className="p-2 bg-red-50 border border-red-100 rounded text-[10px] text-red-700 font-bold uppercase tracking-tighter">
                    Sabab: {order.cancelReason}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CancelOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => ordersApi.cancelOrder(order.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
  });

  return (
    <Modal title="Buyurtmani bekor qilish" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-6">
        <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-red-800 mb-1">
              Diqqat! Qaytarib bo&apos;lmaydi
            </p>
            <p className="text-xs text-red-600 font-medium leading-relaxed">
              #{order.orderNumber} buyurtma butunlay bekor qilinadi.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            BEKOR QILISH SABABI
          </label>
          <textarea
            placeholder="Masalan: Mijoz fikridan qaytdi, adashib ochilgan..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm font-medium h-28 outline-none focus:ring-2 focus:ring-red-500 transition-shadow bg-slate-50/30 resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Yopish
          </button>
          <button
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-[2] bg-red-600 text-white py-3 rounded-xl text-sm font-black hover:bg-red-700 shadow-lg shadow-red-200 disabled:opacity-50 transition-all active:scale-95"
          >
            {mutation.isPending ? 'BEKOR QILINMOQDA...' : "BEKOR QILISHNI TASDIQLASH"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
