import React from 'react';
import { AlertTriangle, RefreshCcw, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { useConnectionStore } from '../stores/connection.store';

export function ConnectionBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const status = useConnectionStore((s) => s.status);
  const { masterUrl } = useMasterUrl();

  if (status === 'online') {
    return null;
  }

  if (status === 'connecting') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-400 text-slate-900 h-12 flex items-center justify-center gap-3 shadow-lg">
        <Wifi size={18} />
        <span className="font-black uppercase tracking-widest text-sm">Aloqa o&apos;rnatilmoqda...</span>
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-500 text-white h-12 flex items-center justify-center gap-3 shadow-lg">
        <RefreshCcw size={18} />
        <span className="font-black uppercase tracking-widest text-sm">Qayta ulanmoqda...</span>
      </div>
    );
  }

  if (status === 'auth-failed') {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-rose-600 text-white h-12 flex items-center justify-center gap-3 shadow-lg">
        <ShieldAlert size={18} />
        <span className="font-black uppercase tracking-widest text-sm">Sessiya tugadi. Qaytadan kiring.</span>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-red-700 text-white min-h-14 px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
      <AlertTriangle size={20} className="shrink-0" />
      <span className="font-black uppercase tracking-widest text-sm text-center">
        Server topilmadi: {masterUrl ?? 'server tanlanmagan'}
      </span>
      <button
        type="button"
        onClick={onOpenSettings}
        className="rounded-xl border border-white/30 px-3 py-1.5 text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
      >
        Sozlamalar
      </button>
    </div>
  );
}
