import { WifiOff } from 'lucide-react';
import { useConnectionStore } from '@/stores/connection.store';
import { cn } from '@/lib/utils';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  if (status === 'online' || status === 'connecting') return null;

  const isAuth = status === 'auth-failed';
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-1.5 text-sm font-medium shrink-0',
        isAuth
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-warning text-warning-foreground',
      )}
    >
      <WifiOff className="h-4 w-4" />
      <span>
        {isAuth
          ? 'Sessiya tugadi. Iltimos qaytadan kiring.'
          : "Tarmoq bilan aloqa yo'q. Qayta ulanishga urinilmoqda…"}
      </span>
    </div>
  );
}
