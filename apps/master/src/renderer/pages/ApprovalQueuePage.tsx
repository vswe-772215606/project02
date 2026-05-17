import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Armchair,
  CheckCircle2,
  ClipboardCheck,
  ReceiptText,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { Order, ordersApi } from '../api/orders';
import { formatDateTimeUZ, formatUZS } from '../utils/format';
import { ConfirmModal } from '../components/ConfirmModal';
import { Modal } from '../components/Modal';

function locationLabel(order: Order) {
  return (
    order.tableName ||
    (order.orderType === 'TAKEAWAY' ? 'Olib ketish' : 'Stol biriktirilmagan')
  );
}

function linePreview(order: Order): { previewLines: string[]; remaining: number } {
  const lines = (order.lines ?? []).filter((line) => !line.isCanceled);
  const previewLines = lines.slice(0, 3).map((line) => `${line.quantity}× ${line.nameSnapshot}`);
  const remaining = Math.max(0, lines.length - previewLines.length);
  return { previewLines, remaining };
}

export function ApprovalQueuePage() {
  const [confirmOrder, setConfirmOrder] = useState<Order | null>(null);
  const [walkoutOrder, setWalkoutOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', 'sent'],
    queryFn: () => ordersApi.list({ status: 'SENT' }),
    refetchInterval: 15000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="text-slate-400" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Tasdiqlash</h1>
            <p className="text-xs text-slate-500 mt-1">
              Yuborilgan buyurtmalar — tasdiqlash va to&apos;lovni qabul qilish
            </p>
          </div>
        </div>
        <div className="rounded-md bg-blue-50 px-4 py-2 border border-blue-100 flex items-center gap-2">
          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Faol</span>
          <span className="text-lg font-black text-blue-700 tabular-nums">{orders.length}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <CheckCircle2 className="mx-auto mb-3 opacity-20" size={48} />
          <p className="font-bold">Tasdiqlash kutayotgan buyurtmalar yo&apos;q</p>
        </div>
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

      {walkoutOrder && (
        <WalkoutOrderModal
          order={walkoutOrder}
          onClose={() => setWalkoutOrder(null)}
        />
      )}
    </div>
  );
}

function ApprovalCard({
  order,
  onConfirm,
  onWalkout,
}: {
  order: Order;
  onConfirm: () => void;
  onWalkout: () => void;
}) {
  const { previewLines, remaining } = linePreview(order);

  return (
    <div className="bg-white rounded-md border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/40">
        <div className="flex items-center gap-2 min-w-0">
          <ReceiptText size={14} className="text-slate-400 shrink-0" />
          <span className="text-sm font-black text-slate-900">#{order.orderNumber}</span>
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
          {formatDateTimeUZ(order.createdAt)}
        </span>
      </div>

      <div className="p-4 flex-1 space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Armchair size={14} className="text-slate-400" />
            <span className="text-sm font-black text-slate-900 truncate">{locationLabel(order)}</span>
          </div>
          <div className="flex items-center gap-2">
            <UserIcon size={12} className="text-slate-300" />
            <span className="text-xs font-bold text-slate-500 truncate">
              {order.waiter?.fullName ?? '—'}
            </span>
          </div>
        </div>

        <div className="rounded-md border border-slate-100 bg-slate-50/40 p-3 space-y-1">
          {previewLines.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Pozitsiyalar yo&apos;q</p>
          ) : (
            previewLines.map((line, idx) => (
              <p key={idx} className="text-xs font-bold text-slate-700 truncate">
                {line}
              </p>
            ))
          )}
          {remaining > 0 && (
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              +{remaining} ta yana
            </p>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Summa</span>
          <span className="text-lg font-black text-slate-900 tabular-nums">
            {formatUZS(order.totalSnapshot || order.totalAmount || 0)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 p-4 pt-0">
        <button
          onClick={onWalkout}
          className="col-span-1 flex items-center justify-center gap-1 rounded text-[10px] font-black text-orange-600 uppercase tracking-widest border border-orange-200 bg-white hover:bg-orange-50 transition-colors py-3"
        >
          <XCircle size={12} />
          Walkout
        </button>
        <button
          onClick={onConfirm}
          className="col-span-2 flex items-center justify-center gap-2 rounded bg-blue-600 hover:bg-blue-700 transition-colors text-white text-xs font-black uppercase tracking-widest py-3"
        >
          <CheckCircle2 size={14} />
          Tasdiqlash
        </button>
      </div>
    </div>
  );
}

function WalkoutOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => ordersApi.markWalkout(order.id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    },
    onError: (error: unknown) => {
      if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        setSubmitError(typeof message === 'string' ? message : "Saqlab bo'lmadi");
        return;
      }
      setSubmitError("Saqlab bo'lmadi");
    },
  });

  return (
    <Modal title="To'lovsiz ketish" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-6">
        <div className="bg-orange-50 p-4 border border-orange-100 rounded-xl flex items-start gap-3 shadow-inner">
          <AlertCircle className="text-orange-500 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-bold text-orange-800 mb-1">To&apos;lanmagan buyurtma</p>
            <p className="text-xs text-orange-700 font-medium leading-relaxed">
              Bu amal #{order.orderNumber} buyurtmani &quot;To&apos;lovsiz ketdi&quot; holatiga o&apos;tkazadi.
              U daromad statistikalarida hisobga olinmaydi.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
            IZOH / SABAB
          </label>
          <textarea
            placeholder="Masalan: Mijoz to'lamay chiqib ketdi..."
            className="w-full border border-slate-200 rounded-xl p-4 text-sm font-medium h-28 outline-none focus:ring-2 focus:ring-orange-500 transition-shadow bg-slate-50/30 resize-none"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </div>

        {submitError && (
          <p className="text-xs font-semibold text-red-600 rounded-md bg-red-50 px-3 py-2 border border-red-100">
            {submitError}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
          >
            Yopish
          </button>
          <button
            disabled={!reason.trim() || mutation.isPending}
            onClick={() => {
              setSubmitError(null);
              mutation.mutate();
            }}
            className="flex-[2] bg-orange-600 text-white py-3 rounded-xl text-sm font-black hover:bg-orange-700 shadow-lg shadow-orange-100 disabled:opacity-50 transition-all active:scale-95"
          >
            {mutation.isPending ? 'SAQLANMOQDA...' : 'TASDIQLASH'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
