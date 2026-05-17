import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCcw, ShieldAlert, Wifi } from 'lucide-react';
import { useMasterUrl } from '../providers/MasterUrlProvider';
import { useConnectionStore } from '../stores/connection.store';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const { masterUrl } = useMasterUrl();
  const navigate = useNavigate();

  if (status === 'online') {
    return null;
  }

  if (status === 'connecting') {
    return (
      <div className="bg-warning text-warning-foreground h-10 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider">
        <Wifi size={14} />
        <span>Aloqa o&apos;rnatilmoqda...</span>
      </div>
    );
  }

  if (status === 'reconnecting') {
    return (
      <div className="bg-warning text-warning-foreground h-10 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider">
        <RefreshCcw size={14} />
        <span>Qayta ulanmoqda...</span>
      </div>
    );
  }

  if (status === 'auth-failed') {
    return (
      <div className="bg-destructive text-destructive-foreground h-10 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider">
        <ShieldAlert size={14} />
        <span>Sessiya tugadi. Qaytadan kiring.</span>
      </div>
    );
  }

  return (
    <div className="bg-destructive text-destructive-foreground min-h-10 px-4 py-2 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider">
      <AlertTriangle size={14} />
      <span>Server topilmadi: {masterUrl ?? 'tanlanmagan'}</span>
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="rounded border border-white/30 px-2 py-1 hover:bg-white/10 transition-colors"
      >
        Sozlamalar
      </button>
    </div>
  );
}
