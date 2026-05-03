import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { kitchenApi } from '../api/kitchen';
import { LogOut, ChefHat, RefreshCw, LayoutGrid } from 'lucide-react';
import { useConnectionStore } from '../stores/connection.store';
import { TicketCard } from '../components/TicketCard';

export function KitchenDisplayPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const status = useConnectionStore((s) => s.status);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const { data: tickets = [], isLoading, isFetching } = useQuery({
    queryKey: ['kitchen', 'tickets'],
    queryFn: () => kitchenApi.listActive(),
    refetchInterval: 30000, // Fallback refetch every 30s
  });

  const activeTickets = tickets
    .filter((t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS' || t.status === 'CANCELED')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-20 bg-slate-800 border-b border-slate-700 px-8 flex items-center justify-between shrink-0 shadow-2xl z-10">
        <div className="flex items-center space-x-6">
          <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-900/20">
            <ChefHat size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tighter text-white">Oshxona</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-green-400' : 'bg-red-500'} animate-pulse`} />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {status === 'online' ? 'Bog\'langan' : 'Aloqa yo\'q'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-12">
          <div className="text-center">
            <div className="text-3xl font-black text-white tracking-tight">
              {now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {now.toLocaleDateString('uz-UZ', { weekday: 'long' })}
            </div>
          </div>

          <div className="flex items-center space-x-6 border-l border-slate-700 pl-12">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-white">{user?.fullName}</p>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{user?.role}</p>
            </div>
            <button 
              onClick={logout}
              className="p-4 bg-slate-700 text-slate-400 rounded-2xl hover:bg-red-600 hover:text-white transition-all active:scale-95"
            >
              <LogOut size={24} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-900/50">
        {isLoading && tickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="animate-spin text-blue-500" size={48} />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">Buyurtmalar yuklanmoqda...</p>
          </div>
        ) : activeTickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-6 opacity-20">
            <LayoutGrid size={120} className="text-slate-500" />
            <h2 className="text-3xl font-black text-slate-500 uppercase tracking-tighter">Hozircha buyurtmalar yo'q</h2>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-8 items-start">
            {activeTickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </main>

      {/* Loading Overlay */}
      {isFetching && (
        <div className="fixed bottom-6 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg animate-bounce">
          <RefreshCw size={20} className="animate-spin" />
        </div>
      )}
    </div>
  );
}
