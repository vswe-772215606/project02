import { useMasterUrl } from '../providers/MasterUrlProvider';
import { useConnectionStore, type ConnectionStatus } from '../stores/connection.store';

function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'bg-emerald-500';
    case 'connecting':
      return 'bg-amber-400';
    case 'reconnecting':
      return 'bg-orange-500';
    case 'auth-failed':
      return 'bg-rose-500';
    case 'unreachable':
      return 'bg-red-600';
    default:
      return 'bg-slate-400';
  }
}

function getStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'online':
      return 'onlayn';
    case 'connecting':
      return 'ulanmoqda';
    case 'reconnecting':
      return 'qayta ulanmoqda';
    case 'auth-failed':
      return 'sessiya tugagan';
    case 'unreachable':
      return 'server topilmadi';
    default:
      return status;
  }
}

export function ConnectionDiagnostics() {
  const { masterUrl } = useMasterUrl();
  const status = useConnectionStore((s) => s.status);

  if (!masterUrl) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[110] pointer-events-none">
      <div className="rounded-md border bg-card shadow-md px-3 py-2 max-w-md">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <span className={`h-2 w-2 rounded-full ${getStatusColor(status)}`} />
          <span>{getStatusLabel(status)}</span>
        </div>
        <div className="mt-0.5 text-[11px] font-mono text-muted-foreground break-all">{masterUrl}</div>
      </div>
    </div>
  );
}
