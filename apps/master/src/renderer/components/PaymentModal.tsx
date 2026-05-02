import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { ordersApi, Order } from '../api/orders';
import { formatUZS } from '../utils/format';

interface PaymentLine {
  id: string;
  method: 'CASH' | 'CARD';
  amount: number;
}

export function PaymentModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const queryClient = useQueryClient();
  const totalNeeded = order.totalSnapshot || order.totalAmount;
  
  const [payments, setPayments] = useState<PaymentLine[]>([
    { id: '1', method: 'CASH', amount: totalNeeded }
  ]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const isBalanced = Math.abs(totalPaid - totalNeeded) < 1;

  const mutation = useMutation({
    mutationFn: () => ordersApi.markPaid(order.id, {
      payments: payments.map(p => ({
        method: p.method,
        amount: p.amount
      }))
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      onClose();
    }
  });

  const addPayment = () => {
    const remaining = Math.max(0, totalNeeded - totalPaid);
    setPayments([...payments, { id: Math.random().toString(), method: 'CARD', amount: remaining }]);
  };

  const removePayment = (id: string) => {
    if (payments.length > 1) {
      setPayments(payments.filter(p => p.id !== id));
    }
  };

  const updatePayment = (id: string, updates: Partial<PaymentLine>) => {
    setPayments(payments.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  return (
    <Modal title={`Buyurtma #${order.orderNumber} to'lovi`} onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-6">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center">
          <span className="text-slate-600 font-medium">To'lanishi kerak:</span>
          <span className="text-xl font-black text-slate-900">{formatUZS(totalNeeded)}</span>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">To'lov turlari</h4>
            <button 
              onClick={addPayment}
              className="text-blue-600 hover:text-blue-700 text-sm font-bold flex items-center space-x-1"
            >
              <Plus size={16} />
              <span>Qo'shish</span>
            </button>
          </div>

          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center space-x-2 animate-in slide-in-from-top-1 duration-200">
                <select 
                  className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={p.method}
                  onChange={(e) => updatePayment(p.id, { method: e.target.value as any })}
                >
                  <option value="CASH">NAQD</option>
                  <option value="CARD">KARTA</option>
                </select>
                <input 
                  type="number" 
                  className="flex-1 bg-white border border-slate-300 rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={p.amount || ''}
                  onChange={(e) => updatePayment(p.id, { amount: Number(e.target.value) })}
                  onFocus={(e) => e.target.select()}
                />
                <button 
                  disabled={payments.length === 1}
                  onClick={() => removePayment(p.id)}
                  className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`p-4 rounded-lg border flex justify-between items-center ${isBalanced ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <span className={`text-sm font-medium ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
            Kiritilgan jami:
          </span>
          <span className={`text-lg font-bold ${isBalanced ? 'text-green-700' : 'text-red-700'}`}>
            {formatUZS(totalPaid)}
          </span>
        </div>

        {!isBalanced && (
          <p className="text-xs text-red-500 font-medium text-center">
            Kiritilgan summa umumiy hisobga mos kelishi shart. 
            (Farq: {formatUZS(totalNeeded - totalPaid)})
          </p>
        )}

        <div className="flex space-x-3 pt-2">
          <button 
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Yopish
          </button>
          <button 
            disabled={!isBalanced || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold hover:bg-green-700 shadow-md shadow-green-100 disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            <CheckCircle2 size={18} />
            <span>TO'LOVNI YAKUNLASH</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
