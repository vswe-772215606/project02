import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users as UsersIcon,
  Plus,
  Pencil,
  UserMinus,
  UserCheck,
  Shield,
  HandPlatter,
  Lock,
  Search,
} from 'lucide-react';
import { usersApi } from '../api/users';
import { User } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UserEditDialog } from '../components/UserEditDialog';

type RoleFilter = 'ALL' | 'OWNER' | 'ADMIN' | 'WAITER';

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [isAdding, setIsAdding] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [dialog, setDialog] = useState<{ message: string; onConfirm: () => void; onCancel?: () => void } | null>(null);

  const { data: todayStats } = useQuery({
    queryKey: ['users', 'today-stats'],
    queryFn: () => usersApi.todayStats(),
    refetchInterval: 60_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users', showInactive],
    queryFn: () => usersApi.list(showInactive),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsAdding(false);
    },
    onError: (err: unknown) => {
      const message = extractApiError(err);
      setDialog({ message, onConfirm: () => setDialog(null) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    },
    onError: (err: unknown) => {
      const message = extractApiError(err);
      setDialog({ message, onConfirm: () => setDialog(null) });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: unknown) => {
      const message = extractApiError(err);
      setDialog({ message, onConfirm: () => setDialog(null) });
    },
  });

  const filteredUsers = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!needle) return true;
      const haystack = `${u.fullName} ${u.username ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [users, searchTerm, roleFilter]);

  const handleToggleActive = (user: User) => {
    if (user.isActive) {
      setDialog({
        message: `"${user.fullName}" foydalanuvchisini to'xtatmoqchimisiz? U tizimga kira olmaydi.`,
        onConfirm: () => {
          deactivateMutation.mutate(user.id);
          setDialog(null);
        },
        onCancel: () => setDialog(null),
      });
    } else {
      if (user.role === 'OWNER' && currentUser?.role !== 'OWNER') {
        setDialog({
          message: "Faqat Ega (Owner) boshqa Egani qayta faollashtira oladi",
          onConfirm: () => setDialog(null),
        });
        return;
      }
      setDialog({
        message: `"${user.fullName}" foydalanuvchisini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => {
          updateMutation.mutate({ id: user.id, data: { isActive: true } });
          setDialog(null);
        },
        onCancel: () => setDialog(null),
      });
    }
  };

  const roleChips: { value: RoleFilter; label: string }[] = [
    { value: 'ALL', label: 'Hammasi' },
    { value: 'OWNER', label: 'Ega' },
    { value: 'ADMIN', label: 'Admin' },
    { value: 'WAITER', label: 'Ofitsiant' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <UsersIcon className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Foydalanuvchilar</h1>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">
              Faolsizlarni ham ko'rsatish
            </span>
          </label>
          <button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center space-x-2 shadow-sm"
          >
            <Plus size={20} />
            <span>Yangi foydalanuvchi</span>
          </button>
        </div>
      </div>

      {/* Search + role chip filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Foydalanuvchini qidirish"
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {roleChips.map((chip) => {
            const active = roleFilter === chip.value;
            return (
              <button
                key={chip.value}
                onClick={() => setRoleFilter(chip.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-tight border transition-all ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs font-semibold text-slate-400">
          {filteredUsers.length} / {users.length}
        </div>
      </div>

      {todayStats && todayStats.items.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Bugungi ofitsiantlar ko'rsatkichi
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{todayStats.date}</span>
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-100">
              <tr>
                <th className="px-6 py-2.5 font-bold">Ofitsiant</th>
                <th className="px-6 py-2.5 font-bold text-right">Buyurtmalar</th>
                <th className="px-6 py-2.5 font-bold text-right">Savdo</th>
                <th className="px-6 py-2.5 font-bold text-right">Xizmat haqi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {todayStats.items.map((row) => (
                <tr key={row.waiterId}>
                  <td className="px-6 py-2.5 text-sm font-semibold text-slate-800">{row.waiterName}</td>
                  <td className="px-6 py-2.5 text-sm tabular-nums text-right">{row.orders}</td>
                  <td className="px-6 py-2.5 text-sm font-bold tabular-nums text-right">
                    {/* Sof savdo (subtotal − chegirma, xizmat haqisiz) — owner's
                        perWaiter.revenue bilan bir xil raqam. */}
                    {Number(row.revenue).toLocaleString('uz-UZ').replace(/,/g, ' ')}
                  </td>
                  <td className="px-6 py-2.5 text-sm font-bold tabular-nums text-right text-amber-700">
                    {Number(row.serviceEarned).toLocaleString('uz-UZ').replace(/,/g, ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <th className="px-6 py-4">Foydalanuvchi</th>
              <th className="px-6 py-4 text-center">Rol</th>
              <th className="px-6 py-4 text-center">Holati</th>
              <th className="px-6 py-4 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((user) => (
              <tr
                key={user.id}
                className={`hover:bg-slate-50/50 transition-colors ${!user.isActive ? 'bg-slate-50/50' : ''}`}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        !user.isActive ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {user.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div
                        className={`font-bold ${
                          !user.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'
                        }`}
                      >
                        {user.fullName}
                      </div>
                      <div className="text-xs text-slate-400 font-medium">@{user.username || 'pin-auth'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-center">
                    <RoleBadge role={user.role} isActive={user.isActive} />
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {user.isActive ? 'FAOL' : "TO'XTATILGAN"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <button
                      onClick={() => setEditUser(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Tahrirlash"
                    >
                      <Pencil size={18} />
                    </button>
                    {user.id !== currentUser?.id && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`p-2 rounded-lg transition-all ${
                          user.isActive
                            ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                        title={user.isActive ? "To'xtatish" : 'Faollashtirish'}
                      >
                        {user.isActive ? <UserMinus size={18} /> : <UserCheck size={18} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                  {users.length === 0 ? 'Foydalanuvchilar topilmadi' : "Qidiruv bo'yicha mos foydalanuvchi yo'q"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(isAdding || editUser) && (
        <UserEditDialog
          user={editUser}
          currentUserRole={currentUser?.role as 'OWNER' | 'ADMIN' | 'WAITER' | undefined}
          onClose={() => {
            setIsAdding(false);
            setEditUser(null);
          }}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onSave={(data) =>
            editUser
              ? updateMutation.mutate({ id: editUser.id, data })
              : createMutation.mutate(data as Parameters<typeof usersApi.create>[0])
          }
        />
      )}

      {dialog && (
        <ConfirmDialog
          message={dialog.message}
          variant={dialog.onCancel ? 'danger' : 'default'}
          onConfirm={dialog.onConfirm}
          onCancel={dialog.onCancel}
        />
      )}
    </div>
  );
}

function RoleBadge({ role, isActive }: { role: 'OWNER' | 'ADMIN' | 'WAITER'; isActive: boolean }) {
  const configs = {
    OWNER: { label: 'Ega', icon: Shield, color: 'bg-purple-100 text-purple-700' },
    ADMIN: { label: 'Admin', icon: Lock, color: 'bg-blue-100 text-blue-700' },
    WAITER: { label: 'Ofitsiant', icon: HandPlatter, color: 'bg-green-100 text-green-700' },
  } as const;
  const config = configs[role];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold space-x-1.5 ${
        isActive ? config.color : 'bg-slate-100 text-slate-400'
      }`}
    >
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
  );
}

function extractApiError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const maybe = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
    return maybe.response?.data?.error?.message ?? maybe.message ?? "Xatolik yuz berdi";
  }
  return "Xatolik yuz berdi";
}
