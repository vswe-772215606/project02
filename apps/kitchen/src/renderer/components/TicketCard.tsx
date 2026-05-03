import React, { useState, useEffect } from 'react';
import { Ticket, TicketLine } from '../api/types';
import { kitchenApi } from '../api/kitchen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, User, Printer, CheckCircle2, Play, Ban } from 'lucide-react';
import { useTicketStore } from '../stores/ticket.store';

interface Props {
  ticket: Ticket;
}

export function TicketCard({ ticket }: Props) {
  const queryClient = useQueryClient();
  const dismiss = useTicketStore((s) => s.dismiss);
  const dismissedIds = useTicketStore((s) => s.dismissedIds);
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const start = new Date(ticket.createdAt).getTime();
      const now = Date.now();
      const diff = Math.floor((now - start) / 1000);
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      setElapsed(`${mins}:${secs.toString().padStart(2, '0')}`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [ticket.createdAt]);

  const statusMutation = useMutation({
    mutationFn: (status: 'IN_PROGRESS' | 'READY') => kitchenApi.setStatus(ticket.id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kitchen', 'tickets'] }),
  });

  const reprintMutation = useMutation({
    mutationFn: () => kitchenApi.reprint(ticket.id),
  });

  if (dismissedIds.has(ticket.id)) return null;

  const isCanceled = ticket.status === 'CANCELED' || ticket.order.status === 'CANCELED';

  // Group lines by combo
  const comboGroups = ticket.lines.reduce((acc, line) => {
    const key = line.comboGroupId || 'none';
    if (!acc[key]) acc[key] = [];
    acc[key].push(line);
    return acc;
  }, {} as Record<string, TicketLine[]>);

  return (
    <div className={`relative flex flex-col bg-white rounded-3xl shadow-xl overflow-hidden border-2 transition-all ${
      isCanceled ? 'border-red-500 bg-red-50' : 
      ticket.status === 'IN_PROGRESS' ? 'border-yellow-400' : 'border-slate-100'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 flex items-center justify-between border-b ${
        isCanceled ? 'bg-red-500 text-white border-red-600' : 
        ticket.status === 'IN_PROGRESS' ? 'bg-yellow-400 text-slate-900 border-yellow-500' : 'bg-slate-50 border-slate-100'
      }`}>
        <div className="flex flex-col">
          <span className="text-3xl font-black uppercase tracking-tight">
            {ticket.order.table?.name || 'VITEZ'}
          </span>
          <div className="flex items-center space-x-2 text-sm font-bold opacity-80">
            <User size={14} />
            <span>{ticket.order.waiter.fullName}</span>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center space-x-2 text-2xl font-black">
            <Clock size={20} />
            <span>{elapsed}</span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
            ID: {ticket.id.slice(-6).toUpperCase()}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto min-h-[200px]">
        {Object.entries(comboGroups).map(([key, lines]) => (
          <div key={key} className="space-y-3">
            {key !== 'none' && (
              <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-black uppercase tracking-widest inline-block">
                Combo: {lines[0].comboNameSnapshot}
              </div>
            )}
            <div className="space-y-4">
              {lines.map((line) => (
                <div key={line.id} className={`flex flex-col ${line.isCanceled ? 'opacity-40 line-through' : ''}`}>
                  <div className="flex items-start justify-between">
                    <span className="text-2xl font-bold text-slate-800 leading-tight">
                      <span className="inline-block min-w-[2.5rem] text-blue-600 font-black">{line.quantity}×</span>
                      {line.nameSnapshot}
                    </span>
                  </div>
                  {line.notes && (
                    <div className="mt-1 ml-10 p-2 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 text-lg font-bold italic rounded-r-lg">
                      {line.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer / Actions */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center space-x-3">
        {isCanceled ? (
          <button 
            onClick={() => dismiss(ticket.id)}
            className="w-full h-20 bg-red-600 text-white rounded-2xl text-2xl font-black uppercase tracking-wide flex items-center justify-center space-x-3 shadow-lg active:scale-95"
          >
            <Ban size={28} />
            <span>Tushundim</span>
          </button>
        ) : (
          <>
            <button 
              onClick={() => reprintMutation.mutate()}
              className="w-20 h-20 bg-white border-2 border-slate-200 text-slate-400 rounded-2xl flex items-center justify-center hover:bg-slate-50 active:scale-90"
              title="Qayta chop etish"
            >
              <Printer size={28} />
            </button>

            {ticket.status === 'PENDING' && (
              <button 
                onClick={() => statusMutation.mutate('IN_PROGRESS')}
                disabled={statusMutation.isPending}
                className="flex-1 h-20 bg-blue-600 text-white rounded-2xl text-2xl font-black uppercase tracking-wide flex items-center justify-center space-x-3 shadow-lg shadow-blue-200 active:scale-95 disabled:bg-blue-300"
              >
                {statusMutation.isPending ? <RefreshCw size={28} className="animate-spin" /> : <Play size={28} className="fill-white" />}
                <span>Boshlash</span>
              </button>
            )}

            {ticket.status === 'IN_PROGRESS' && (
              <button 
                onClick={() => statusMutation.mutate('READY')}
                disabled={statusMutation.isPending}
                className="flex-1 h-20 bg-green-600 text-white rounded-2xl text-2xl font-black uppercase tracking-wide flex items-center justify-center space-x-3 shadow-lg shadow-green-200 active:scale-95 disabled:bg-green-300"
              >
                {statusMutation.isPending ? <RefreshCw size={28} className="animate-spin" /> : <CheckCircle2 size={28} />}
                <span>Tayyor</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Canceled Overlay */}
      {isCanceled && (
        <div className="absolute inset-0 bg-red-600/10 pointer-events-none flex items-center justify-center overflow-hidden">
          <div className="rotate-[-15deg] border-8 border-red-600 text-red-600 px-8 py-4 text-6xl font-black uppercase tracking-tighter opacity-20">
            BEKOR QILINDI
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshCw({ className, size }: { className?: string; size?: number }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
