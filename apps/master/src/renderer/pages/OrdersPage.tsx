import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ReceiptText, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  Printer, 
  Ban, 
  CreditCard,
  User as UserIcon,
  Armchair,
  History,
  AlertCircle
} from 'lucide-react';
import { ordersApi, Order } from '../api/orders';
import { formatUZS, formatDateTimeUZ } from '../utils/format';
import { StatusBadge, OrderStatus, KitchenStatusBadge } from '../components/StatusBadge';
import { PaymentModal } from '../components/PaymentModal';
import { Modal } from '../components/Modal';
import { summarizeOrderLines } from '../utils/order-line-summary';

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function locationLabel(order: Order) {
  return order.tableName || (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan');
}

const TABS: { label: string; status: OrderStatus }[] = [
  { label: 'BILL_REQUESTED', status: 'BILL_REQUESTED' },
  { label: 'PENDING_PAYMENT', status: 'PENDING_PAYMENT' },
  { label: 'SENT', status: 'SENT' },
  { label: 'CLOSED', status: 'CLOSED' },
  { label: 'WALKOUT', status: 'WALKOUT' },
  { label: 'CANCELED', status: 'CANCELED' },
];

const TAB_LABELS: Record<OrderStatus, string> = {
  SENT: 'Yuborilgan',
  BILL_REQUESTED: 'Hisob kutilmoqda',
  PENDING_PAYMENT: 'To\'lov kutilmoqda',
  CLOSED: 'Yopilgan',
  WALKOUT: 'To\'lanmagan',
  CANCELED: 'Bekor qilingan',
  DRAFT: 'Qoralama'
};

export function OrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatus>('BILL_REQUESTED');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [walkoutOrder, setWalkoutOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', activeTab],
    queryFn: () => ordersApi.list({ status: activeTab, date: activeTab === 'CLOSED' ? localDateString() : undefined }),
  });

  // Fetch counts for tabs
  // In a real app, I'd have a specific endpoint for counts. 
  // For now, I'll just rely on the current active query or fetch all active ones.
  const { data: activeOrders = [] } = useQuery({
    queryKey: ['orders', 'active_counts'],
    queryFn: () => ordersApi.list(),
    refetchInterval: 10000,
  });

  const counts = activeOrders.reduce((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredOrders = orders.filter(o => 
    (o.orderNumber?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
    (o.tableName && o.tableName.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ReceiptText className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Buyurtmalar</h1>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
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
        {TABS.map((tab) => (
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
            {(counts[tab.status] > 0 || activeTab === tab.status) && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.status ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'
              }`}>
                {counts[tab.status] || 0}
              </span>
            )}
          </button>
        ))}
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
              onPay={() => setPaymentOrder(order)}
              onCancel={() => setCancelOrder(order)}
              onWalkout={() => setWalkoutOrder(order)}
            />
          ))
        )}
      </div>

      {paymentOrder && <PaymentModal order={paymentOrder} onClose={() => setPaymentOrder(null)} />}
      
      {cancelOrder && (
        <CancelOrderModal 
          order={cancelOrder} 
          onClose={() => setCancelOrder(null)} 
        />
      )}

      {walkoutOrder && (
        <WalkoutOrderModal 
          order={walkoutOrder} 
          onClose={() => setWalkoutOrder(null)} 
        />
      )}
    </div>
  );
}

function OrderListItem({ 
  order, 
  isExpanded, 
  onToggle, 
  onPay, 
  onCancel, 
  onWalkout 
}: { 
  order: Order; 
  isExpanded: boolean; 
  onToggle: () => void;
  onPay: () => void;
  onCancel: () => void;
  onWalkout: () => void;
}) {
  const queryClient = useQueryClient();
  const mealSummary = summarizeOrderLines(order.lines);
  const reprintMutation = useMutation({
    mutationFn: (reason: string) => ordersApi.reprintBill(order.id, reason),
    onSuccess: () => alert('Chek qayta chop etishga yuborildi')
  });

  return (
    <div className={`bg-white rounded-xl border transition-all ${isExpanded ? 'border-blue-400 shadow-md ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}>
      <div 
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center space-x-6">
          <div className="flex flex-col">
            <span className="text-lg font-bold text-slate-800">#{order.orderNumber}</span>
            <span className="text-xs text-slate-400 font-medium">{formatDateTimeUZ(order.createdAt)}</span>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-1.5 text-slate-600 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                <Armchair size={14} />
                <span className="text-sm font-semibold">{locationLabel(order)}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-600 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                <UserIcon size={14} />
                <span className="text-sm font-semibold">{order.waiter?.fullName}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-600 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                <span className="text-xs font-bold uppercase tracking-wide">{order.orderType === 'DINE_IN' ? 'Ichkarida' : 'Olib ketish'}</span>
              </div>
            </div>
            {mealSummary && (
              <p
                className="max-w-xl text-sm text-slate-500"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {mealSummary}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <div className="text-lg font-black text-slate-900">
              {formatUZS(order.totalSnapshot || order.totalAmount || 0)}
            </div>
            <StatusBadge status={order.status} />
          </div>
          {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-4 animate-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Joy</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{locationLabel(order)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Ofitsiant</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{order.waiter?.fullName || '—'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Holat</div>
                  <div className="mt-1"><StatusBadge status={order.status} /></div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Mahsulotlar</h4>
                <div className="space-y-2">
                  {order.lines?.map(line => (
                    <div key={line.id} className={`flex justify-between text-sm ${line.isCanceled ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                      <span>{line.quantity}x {line.nameSnapshot}</span>
                      <span className="font-medium">{formatUZS((line.price || 0) * line.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {order.kitchenTickets && order.kitchenTickets.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Oshxona buyurtmalari</h4>
                  <div className="space-y-2">
                    {order.kitchenTickets.map((ticket, idx) => (
                      <div key={ticket.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="text-xs font-bold text-slate-600">Chek #{idx + 1}</span>
                        <KitchenStatusBadge status={ticket.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amallar</h4>
                <div className="flex flex-wrap gap-2">
                  {order.status === 'BILL_REQUESTED' && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onPay(); }}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center space-x-2"
                    >
                      <CreditCard size={16} />
                      <span>HISOBNI YAKUNLASH</span>
                    </button>
                  )}
                  {order.status === 'PENDING_PAYMENT' && (
                    <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onPay(); }}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-700 flex items-center space-x-2"
                      >
                        <CreditCard size={16} />
                        <span>TO'LANDI</span>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onWalkout(); }}
                        className="bg-orange-50 text-orange-600 border border-orange-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-100 flex items-center space-x-2"
                      >
                        <AlertCircle size={16} />
                        <span>TO'LOVSIZ KETDI</span>
                      </button>
                    </>
                  )}
                  
                  {(order.status === 'SENT' || order.status === 'BILL_REQUESTED') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onCancel(); }}
                      className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center space-x-2"
                    >
                      <Ban size={16} />
                      <span>BEKOR QILISH</span>
                    </button>
                  )}

                  {(order.status === 'CLOSED' || order.status === 'WALKOUT') && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); reprintMutation.mutate('Admin re-print'); }}
                      className="bg-slate-100 text-slate-600 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 flex items-center space-x-2"
                    >
                      <Printer size={16} />
                      <span>CHEKNI QAYTA CHOP ETISH</span>
                    </button>
                  )}
                </div>
              </div>

              {order.status === 'CLOSED' && order.closedAt && (
                <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700 font-medium">
                  Yopilgan vaqti: {formatDateTimeUZ(order.closedAt)}
                </div>
              )}
              {order.status === 'PENDING_PAYMENT' && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Oraliq jami</span>
                    <span>{formatUZS(order.subtotalSnapshot || order.totalAmount || 0)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-slate-600">
                    <span>Chegirma</span>
                    <span>-{formatUZS(order.discountAmountSnapshot || 0)}</span>
                  </div>
                  <div className="mt-2 flex justify-between text-slate-600">
                    <span>Xizmat haqi</span>
                    <span>{formatUZS(order.serviceChargeSnapshot || 0)}</span>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-blue-100 pt-3 font-bold text-slate-900">
                    <span>Yakuniy summa</span>
                    <span>{formatUZS(order.totalSnapshot || order.totalAmount || 0)}</span>
                  </div>
                </div>
              )}
              {order.status === 'CANCELED' && order.cancelReason && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 font-medium">
                  Bekor qilish sababi: {order.cancelReason}
                </div>
              )}
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
    }
  });

  return (
    <Modal title="Buyurtmani bekor qilish" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-slate-600 text-sm">
          #{order.orderNumber} buyurtmani bekor qilmoqchimisiz? Bu amalni ortga qaytarib bo'lmaydi.
        </p>
        <textarea 
          placeholder="Bekor qilish sababini kiriting..."
          className="w-full border border-slate-300 rounded-lg p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-red-500"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex space-x-3">
          <button onClick={onClose} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Yopish</button>
          <button 
            disabled={!reason || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 bg-red-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-red-700 disabled:opacity-50"
          >
            BEKOR QILISH
          </button>
        </div>
      </div>
    </Modal>
  );
}

function WalkoutOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const mutation = useMutation({
    mutationFn: () => ordersApi.markWalkout(order.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    }
  });

  return (
    <Modal title="To'lovsiz ketishni qayd etish" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="bg-orange-50 p-4 border border-orange-200 rounded-lg flex items-start space-x-3">
          <AlertCircle className="text-orange-500 shrink-0" size={20} />
          <p className="text-orange-700 text-sm font-medium">
            Diqqat! Ushbu buyurtma to'lanmagan deb belgilanadi va daromadga kirmaydi.
          </p>
        </div>
        <textarea 
          placeholder="Sababini kiriting (masalan: mijoz qochib ketdi, adashib ochilgan)..."
          className="w-full border border-slate-300 rounded-lg p-3 text-sm h-24 outline-none focus:ring-2 focus:ring-orange-500"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex space-x-3">
          <button onClick={onClose} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600">Yopish</button>
          <button 
            disabled={!reason || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 bg-orange-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-orange-700 disabled:opacity-50"
          >
            TASDIQLASH
          </button>
        </div>
      </div>
    </Modal>
  );
}
