import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { authApi } from '@/api/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function ConnectionChip() {
  const status = useConnectionStore((s) => s.status);
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wifi className="h-3.5 w-3.5 text-success" />
        Onlayn
      </span>
    );
  }
  const isAuth = status === 'auth-failed';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs', isAuth ? 'text-destructive' : 'text-warning')}>
      <WifiOff className="h-3.5 w-3.5" />
      {isAuth ? 'Sessiya tugagan' : 'Qayta ulanmoqda'}
    </span>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Topbar({ title }: { title: string }) {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = [false, (_: boolean) => {}];

  // Lightweight menu without dropdown-menu dependency: a click-toggled panel.
  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local logout always succeeds.
    } finally {
      clearAuth();
      navigate('/login', { replace: true });
    }
  };

  void menuOpen;
  void setMenuOpen;

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0 z-30 sticky top-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-semibold text-foreground truncate">{title || 'Chayxana'}</h1>
      </div>

      <div className="flex items-center gap-3">
        <ConnectionChip />
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          onClick={() => navigate('/settings')}
          title="Sozlamalar"
        >
          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center text-xs font-medium">
            {getInitials(user?.fullName)}
          </span>
          <span className="hidden sm:inline text-sm font-medium">{user?.fullName ?? ''}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void handleLogout()}
          title="Chiqish"
        >
          <LogOut className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </header>
  );
}
