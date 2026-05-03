import React from 'react';
import { useAuthStore } from '../stores/auth.store';
import { kitchenApi } from '../api/kitchen';
import { LogOut, ChefHat, RefreshCw, Zap } from 'lucide-react';
import { useConnectionStore } from '../stores/connection.store';

export function KitchenDisplayPage() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const status = useConnectionStore((s) => s.status);
  const [testResult, setTestResult] = React.useState<string | null>(null);
  const [isTesting, setIsTesting] = React.useState(false);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const tickets = await kitchenApi.listActive();
      setTestResult(`Aktiv buyurtmalar soni: ${tickets.length}`);
    } catch (err: any) {
      setTestResult(`Xatolik: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <div className="p-2 bg-blue-600 text-white rounded-xl">
            <ChefHat size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-slate-800">Oshxona</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-2.5 h-2.5 rounded-full ${status === 'online' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {status === 'online' ? 'Bog\'langan' : 'Uzilgan'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right">
            <p className="text-sm font-bold text-slate-700">{user?.fullName}</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user?.role}</p>
          </div>
          <button 
            onClick={logout}
            className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
          >
            <LogOut size={24} />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8">
        <div className="p-12 bg-white rounded-[40px] shadow-xl border border-slate-100 max-w-2xl w-full space-y-6">
          <div className="inline-flex p-6 bg-blue-50 text-blue-600 rounded-3xl">
            <Zap size={64} className="fill-blue-600" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Oshxona ko'rsatkichi</h2>
            <p className="text-lg text-slate-500 font-medium">Aktiv buyurtmalar bu yerda ko'rinadi</p>
          </div>

          <div className="pt-6 flex flex-col items-center space-y-4">
            <button 
              onClick={handleTest}
              disabled={isTesting}
              className="px-10 h-16 bg-blue-600 text-white rounded-2xl text-xl font-black uppercase tracking-wide hover:bg-blue-700 transition-all flex items-center space-x-3 disabled:bg-blue-300"
            >
              {isTesting ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
              <span>Test API</span>
            </button>
            
            {testResult && (
              <div className="px-6 py-3 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 animate-in fade-in slide-in-from-bottom-2">
                {testResult}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
