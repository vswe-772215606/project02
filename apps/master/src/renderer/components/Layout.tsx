import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ReceiptText,
  BookOpen,
  Armchair,
  Users,
  Percent,
  Settings,
  BarChart3,
  ScrollText,
  Package,
  HandCoins,
  Wifi,
  WifiOff,
  PanelLeft,
  LogOut,
  Monitor,
  Wallet,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { useConnectionStore } from '../stores/connection.store';
import { authApi } from '../api/auth';
import { api } from '../api/client';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, clearAuth } = useAuthStore();
  const { status } = useConnectionStore();
  const navigate = useNavigate();
  
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    return saved === 'true';
  });
  const [serverInfo, setServerInfo] = useState<{ lanIps: string[]; port: number } | null>(null);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    api.get<{ lanIps: string[]; port: number }>('/api/health/server-info')
      .then(setServerInfo)
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Local logout must still succeed even if the server session is already gone.
    } finally {
      clearAuth();
      navigate('/');
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const navItems = [
    { label: "Bosh sahifa", path: "/", icon: LayoutDashboard, roles: ['OWNER', 'ADMIN', 'WAITER', 'KITCHEN'] },
    { label: "Buyurtmalar", path: "/orders", icon: ReceiptText, roles: ['OWNER', 'ADMIN', 'WAITER'] },
    { label: "Menyu", path: "/menu", icon: BookOpen, roles: ['OWNER', 'ADMIN'] },
    { label: "Zaxiralar", path: "/stock", icon: Package, roles: ['OWNER', 'ADMIN'] },
    { label: "Chiqimlar", path: "/expenses", icon: Wallet, roles: ['OWNER', 'ADMIN'] },
    { label: "Qarzlar", path: "/debts", icon: HandCoins, roles: ['OWNER', 'ADMIN'] },
    { label: "Stollar", path: "/tables", icon: Armchair, roles: ['OWNER', 'ADMIN'] },
    { label: "Foydalanuvchilar", path: "/users", icon: Users, roles: ['OWNER', 'ADMIN'] },
    { label: "Chegirmalar", path: "/discounts", icon: Percent, roles: ['OWNER', 'ADMIN'] },
    { label: "Hisobotlar", path: "/reports", icon: BarChart3, roles: ['OWNER'] },
    { label: "Audit jurnali", path: "/audit", icon: ScrollText, roles: ['OWNER'] },
    { label: "Sozlamalar", path: "/settings", icon: Settings, roles: ['OWNER', 'ADMIN'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role || ''));

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside 
        className={`${collapsed ? 'w-16' : 'w-64'} bg-slate-800 text-white flex flex-col transition-[width] duration-200 ease-in-out shrink-0`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700 shrink-0 overflow-hidden">
          {!collapsed && <span className="text-xl font-bold truncate">Chayxana POS</span>}
          <button 
            onClick={() => setCollapsed(!collapsed)}
            className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${collapsed ? 'mx-auto' : ''}`}
            title={collapsed ? "Yoyish" : "Yig'ish"}
          >
            <PanelLeft size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center rounded transition-colors ${
                  collapsed ? 'justify-center p-2' : 'px-3 py-2 space-x-3'
                } ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                }`
              }
            >
              <item.icon size={20} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User Area */}
        <div className="p-3 border-t border-slate-700 bg-slate-800/50 shrink-0">
          <div className={`flex items-center ${collapsed ? 'flex-col space-y-3' : 'space-x-3'}`}>
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold shrink-0 shadow-inner">
              {getInitials(user?.fullName)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-slate-100">{user?.fullName}</div>
                <div className="text-xs text-slate-400 truncate uppercase tracking-tighter">{user?.role}</div>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="Chiqish"
              className={`p-2 rounded text-slate-400 hover:bg-slate-700 hover:text-red-400 transition-colors ${collapsed ? '' : 'shrink-0'}`}
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Connection Banner */}
        {(status === 'reconnecting' || status === 'connecting') && (
          <div className="bg-amber-500 text-white flex items-center justify-center py-1.5 px-4 text-sm font-medium shrink-0 space-x-2 z-50">
            <WifiOff size={16} />
            <span>Tarmoq bilan aloqa yo'q. Qayta ulanishga urinilmoqda...</span>
          </div>
        )}
        {status === 'auth-failed' && (
          <div className="bg-red-600 text-white flex items-center justify-center py-1.5 px-4 text-sm font-medium shrink-0 space-x-2 z-50">
            <WifiOff size={16} />
            <span>Sessiya tugadi. Iltimos qaytadan kiring.</span>
          </div>
        )}

        {/* Top Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-40">
          <div className="flex items-center space-x-3">
            {status === 'online' ? (
              <Wifi size={18} className="text-green-500" />
            ) : status === 'auth-failed' ? (
              <WifiOff size={18} className="text-red-500" />
            ) : (
              <WifiOff size={18} className="text-amber-500" />
            )}
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {status === 'online' ? 'Onlayn' : status === 'auth-failed' ? 'Sessiya tugagan' : 'Qayta ulanmoqda'}
            </span>
          </div>
          
          {serverInfo && serverInfo.lanIps.length > 0 && (
            <div className="flex items-center space-x-2 bg-slate-100 rounded-lg px-3 py-1.5" title="Mobil va Kitchen ilovalar shu manzilga ulanadi">
              <Monitor size={14} className="text-slate-500 shrink-0" />
              <div className="text-xs">
                <span className="text-slate-400 mr-1">Server:</span>
                {serverInfo.lanIps.map((ip) => (
                  <span key={ip} className="font-mono font-bold text-slate-700 mr-2">
                    {ip}:{serverInfo.port}
                  </span>
                ))}
              </div>
            </div>
          )}
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-auto p-8 bg-slate-50 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
