import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ClipboardCheck, 
  Clock, 
  User as UserIcon, 
  Hash, 
  Armchair, 
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Ban
} from 'lucide-react';
import { ordersApi, Order } from '../api/orders';
import { discountsApi, Discount } from '../api/discounts';
import { settingsApi } from '../api/settings';
import { formatUZS, formatMinutesElapsed } from '../utils/format';
import { Modal } from '../components/Modal';
import { KitchenStatusBadge } from '../components/StatusBadge';

export function ApprovalQueuePage() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data: ordersData = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['orders', 'BILL_REQUESTED'],
    queryFn: () => ordersApi.list({ status: 'BILL_REQUESTED' }),
    refetchInterval: 30000, // Fallback to 30s refetch if socket misses
  });

  const orders = [...ordersData].sort((a, b) => 
    new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3">
        <ClipboardCheck className="text-slate-400" size={28} />
        <h1 className="text-2xl font-bold text-slate-800">Tasdiqlash navbati</h1>
      </div>

      {ordersLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <CheckCircle2 className="mx-auto text-slate-300 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-slate-600">Hozircha hech qanday so'rov yo'q</h2>
          <p className="text-slate-400 mt-2">Barcha buyurtmalar tasdiqlangan yoki faol holatda.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <OrderRow 
              key={order.id} 
              order={order} 
              onClick={() => setSelectedOrder(order)} 
            />
          ))}
        </div>
      )}

      {selectedOrder && (
        <ApprovalModal 
          orderId={selectedOrder.id} 
          onClose={() => setSelectedOrder(null)} 
        />
      )}
    </div>
  );
}

function OrderRow({ order, onClick }: { order: Order; onClick: () => void }) {
  // Force re-render for time elapsed
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div 
      onClick={onClick}
      className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer flex items-center justify-between group"
    >
      <div className="flex items-center space-x-6">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
          <Hash size={20} />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-lg text-slate-800">#{order.orderNumber}</span>
            <span className="text-sm px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
              {order.itemCount} ta mahsulot
            </span>
          </div>
          <div className="flex items-center space-x-4 mt-1 text-sm text-slate-500">
            <div className="flex items-center space-x-1">
              <Armchair size={14} />
              <span>{order.tableId ? 'Stol: ' + order.tableId : 'Olib ketish'}</span>
            </div>
            <div className="flex items-center space-x-1">
              <UserIcon size={14} />
              <span>{order.waiter?.fullName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-8">
        <div className="text-right">
          <div className="text-lg font-bold text-slate-900">{formatUZS(order.totalAmount)}</div>
          <div className="flex items-center justify-end space-x-1 text-xs text-amber-600 font-medium">
            <Clock size={12} />
            <span>{formatMinutesElapsed(order.updatedAt)} kutilmoqda</span>
          </div>
        </div>
        <ChevronRight size={24} className="text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
      </div>
    </div>
  );
}

function ApprovalModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [waiveService, setWaiveService] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCanceling, setIsCanceling] = useState(false);

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['orders', orderId],
    queryFn: () => ordersApi.getById(orderId),
  });

  const { data: discounts = [] } = useQuery({
    queryKey: ['discounts'],
    queryFn: () => discountsApi.list(),
  });

  const { data: settings = {} } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get(),
  });

  const approveMutation = useMutation({
    mutationFn: () => ordersApi.approve(orderId, { discountId: discountId || undefined, serviceChargeWaived: waiveService }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => ordersApi.cancelOrder(orderId, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
  });

  if (orderLoading || !order) {
    return (
      <Modal title="Buyurtma tafsilotlari" onClose={onClose}>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </Modal>
    );
  }

  // Preview calculations
  const subtotal = order.totalAmount; // This is the sum of items from server
  const selectedDiscount = discounts.find(d => d.id === discountId);
  let discountAmount = 0;
  if (selectedDiscount) {
    if (selectedDiscount.type === 'PERCENT') {
      discountAmount = Math.round((subtotal * selectedDiscount.value) / 100);
    } else {
      discountAmount = Math.min(selectedDiscount.value, subtotal);
    }
  }

  const serviceCharge = waiveService ? 0 : Number(settings.service_charge_amount || 0);
  const finalTotal = subtotal - discountAmount + serviceCharge;

  return (
    <Modal title={`Buyurtma #${order.orderNumber}ni tasdiqlash`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-6">
        {/* Items List */}
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg overflow-hidden border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase text-xs font-bold tracking-wider">
                  <th className="px-4 py-2">Mahsulot</th>
                  <th className="px-4 py-2 text-center">Soni</th>
                  <th className="px-4 py-2 text-right">Narxi</th>
                  <th className="px-4 py-2 text-right">Jami</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {order.lines?.map((line) => (
                  <tr key={line.id} className={line.isCanceled ? 'text-slate-400 bg-slate-50/50 italic' : 'text-slate-700'}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{line.name}</div>
                      {line.notes && <div className="text-xs text-slate-500 mt-0.5">Qayd: {line.notes}</div>}
                      {line.isCanceled && <div className="text-xs text-red-400 font-bold uppercase tracking-widest">Bekor qilingan</div>}
                    </td>
                    <td className="px-4 py-2 text-center">{line.quantity}</td>
                    <td className="px-4 py-2 text-right">{formatUZS(line.price)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatUZS(line.price * line.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {order.kitchenTickets && order.kitchenTickets.length > 0 && (
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-wrap gap-4">
              <div className="w-full text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Oshxona holati</div>
              {order.kitchenTickets.map((ticket, idx) => (
                <div key={ticket.id} className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-md border border-slate-200 shadow-sm">
                  <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                  <KitchenStatusBadge status={ticket.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Adjustments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Chegirma tanlash</label>
              <select 
                className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                value={discountId || ''}
                onChange={(e) => setDiscountId(e.target.value || null)}
              >
                <option value="">Chegirma yo'q</option>
                {discounts.filter(d => d.isActive).map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type === 'PERCENT' ? `${d.value}%` : formatUZS(d.value)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <input 
                type="checkbox" 
                id="waive-service"
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                checked={waiveService}
                onChange={(e) => setWaiveService(e.target.checked)}
              />
              <label htmlFor="waive-service" className="text-sm font-medium text-slate-700">
                Xizmat haqini bekor qilish
              </label>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between text-sm text-slate-600">
              <span>Oraliq jami:</span>
              <span>{formatUZS(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-red-600 font-medium">
                <span>Chegirma:</span>
                <span>-{formatUZS(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm text-slate-600">
              <span>Xizmat haqi:</span>
              <span>{formatUZS(serviceCharge)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <span className="font-bold text-slate-800">Umumiy jami:</span>
              <span className="text-xl font-black text-blue-600">{formatUZS(finalTotal)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            {!isCanceling ? (
              <button 
                onClick={() => setIsCanceling(true)}
                className="text-red-600 hover:text-red-700 font-medium text-sm flex items-center space-x-1 py-2 px-3 rounded hover:bg-red-50"
              >
                <Ban size={16} />
                <span>Buyurtmani bekor qilish</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                <input 
                  type="text" 
                  placeholder="Sababi..."
                  className="border border-red-200 rounded px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-500 w-48"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
                <button 
                  disabled={!cancelReason || cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                  className="bg-red-600 text-white text-xs font-bold py-2 px-3 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  TASDIQLASH
                </button>
                <button 
                  onClick={() => { setIsCanceling(false); setCancelReason(''); }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <AlertCircle size={18} />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button 
              onClick={onClose}
              className="px-6 py-2.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Yopish
            </button>
            <button 
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-blue-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all flex items-center space-x-2 disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              <span>TASDIQLASH VA CHOP ETISH</span>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
