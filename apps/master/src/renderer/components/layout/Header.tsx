import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { useConnectionStore } from '@/stores/connection.store';
import { useUIStore } from '@/stores/ui.store';
import { authApi } from '@/api/auth';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

function ConnectionChip() {
  const status = useConnectionStore((s) => s.status);
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Wifi className="h-4 w-4 text-success" strokeWidth={2} />
        <span className="hidden sm:inline">Onlayn</span>
      </span>
    );
  }
  const isAuth = status === 'auth-failed';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', isAuth ? 'text-destructive' : 'text-warning')}>
      <WifiOff className="h-4 w-4" strokeWidth={2} />
      <span className="hidden sm:inline">{isAuth ? 'Sessiya tugagan' : 'Qayta ulanmoqda'}</span>
    </span>
  );
}

function ServerChip() {
  const [info, setInfo] = useState<{ lanIps: string[]; port: number } | null>(null);
  useEffect(() => {
    api.get<{ lanIps: string[]; port: number }>('/api/health/server-info')
      .then(setInfo)
      .catch(() => {});
  }, []);
  if (!info || info.lanIps.length === 0) return null;
  return (
    <span className="hidden md:inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground">
      {info.lanIps[0]}:{info.port}
    </span>
  );
}

function getInitials(name?: string | null) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Header() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const pageTitle = useUIStore((s) => s.pageTitle);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local logout always succeeds.
    } finally {
      clearAuth();
      navigate('/');
    }
  };

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 xl:px-6 shrink-0 z-30 sticky top-0">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-semibold text-foreground truncate">
          {pageTitle || 'Chayxana'}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <ServerChip />
        <ConnectionChip />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-2.5">
              <span className="h-8 w-8 rounded-full bg-primary text-primary-foreground inline-flex items-center justify-center text-sm font-semibold">
                {getInitials(user?.fullName)}
              </span>
              <span className="hidden sm:inline text-sm font-medium">{user?.fullName ?? ''}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
              <span className="text-sm font-semibold">{user?.fullName ?? ''}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{user?.role}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" strokeWidth={2} />
              Chiqish
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
