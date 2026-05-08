import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Users as UsersIcon,
  Plus,
  Pencil,
  UserMinus,
  UserCheck,
  Shield,
  ChefHat,
  HandPlatter,
  Lock,
  Eye,
  EyeOff,
  TrendingUp,
} from 'lucide-react';
import { usersApi } from '../api/users';
import { User } from '../api/auth';
import { useAuthStore } from '../stores/auth.store';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { reportsApi, WaiterReport } from '../api/reports';
import { formatUZS, formatDateTimeUZ } from '../utils/format';

const userSchema = z.object({
  fullName: z.string().min(1, "FIO kiritilishi shart"),
  role: z.enum(['OWNER', 'ADMIN', 'KITCHEN', 'WAITER']),
  username: z.string().optional(),
  password: z.string().optional(),
  pin: z.string().optional(),
}).refine((data) => {
  if (data.role !== 'WAITER') {
    return !!data.username && (data.password === undefined || data.password.length >= 4);
  }
  return !!data.pin && data.pin.length === 4 && /^\d+$/.test(data.pin);
}, {
  message: "Username/Parol yoki 4 xonali PIN noto'g'ri",
  path: ['username']
});

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore(s => s.user);
  const [isAdding, setIsAdding] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [reportWaiter, setReportWaiter] = useState<User | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [dialog, setDialog] = useState<{ message: string; onConfirm: () => void; onCancel?: () => void } | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', showInactive],
    queryFn: () => usersApi.list(showInactive),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsAdding(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditUser(null);
    },
    onError: (err: any) => {
      setDialog({ message: err.response?.data?.error?.message || "Xatolik yuz berdi", onConfirm: () => setDialog(null) });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err: any) => {
      setDialog({ message: err.response?.data?.error?.message || "Xatolik yuz berdi", onConfirm: () => setDialog(null) });
    }
  });

  const handleToggleActive = (user: User) => {
    if (user.isActive) {
      setDialog({
        message: `"${user.fullName}" foydalanuvchisini faolsizlantirmoqchimisiz?`,
        onConfirm: () => { deactivateMutation.mutate(user.id); setDialog(null); },
        onCancel: () => setDialog(null),
      });
    } else {
      if (user.role === 'OWNER' && currentUser?.role !== 'OWNER') {
        setDialog({ message: "Faqat Ega (Owner) boshqa Egani qayta faollashtira oladi", onConfirm: () => setDialog(null) });
        return;
      }
      setDialog({
        message: `"${user.fullName}" foydalanuvchisini qayta faollashtirmoqchimisiz?`,
        onConfirm: () => { updateMutation.mutate({ id: user.id, data: { isActive: true } }); setDialog(null); },
        onCancel: () => setDialog(null),
      });
    }
  };

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
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Faolsizlarni ham ko'rsatish</span>
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
            {users.map((user) => (
              <tr key={user.id} className={`hover:bg-slate-50/50 transition-colors ${!user.isActive ? 'bg-slate-50/50' : ''}`}>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${!user.isActive ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                      {user.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className={`font-bold ${!user.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'}`}>
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
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {user.isActive ? 'FAOL' : 'NOFAOL'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    {user.role === 'WAITER' && (
                      <button
                        onClick={() => setReportWaiter(user)}
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                        title="Hisobot"
                      >
                        <TrendingUp size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditUser(user)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                    >
                      <Pencil size={18} />
                    </button>
                    {user.id !== currentUser?.id && (
                      <button
                        onClick={() => handleToggleActive(user)}
                        className={`p-2 rounded-lg transition-all ${
                          user.isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'
                        }`}
                        title={user.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                      >
                        {user.isActive ? <UserMinus size={18} /> : <UserCheck size={18} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">
                  Foydalanuvchilar topilmadi
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(isAdding || editUser) && (
        <UserModal
          user={editUser}
          currentUserRole={currentUser?.role}
          onClose={() => { setIsAdding(false); setEditUser(null); }}
          onSave={(data: any) => editUser
            ? updateMutation.mutate({ id: editUser.id, data })
            : createMutation.mutate(data)
          }
        />
      )}

      {reportWaiter && (
        <WaiterReportModal
          waiter={reportWaiter}
          onClose={() => setReportWaiter(null)}
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

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function firstOfMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function WaiterReportModal({ waiter, onClose }: { waiter: User; onClose: () => void }) {
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(localDateString);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['waiter-report', waiter.id, from, to],
    queryFn: () => reportsApi.getWaiterReport(waiter.id, from, to),
    enabled: !!from && !!to && from <= to,
    retry: false,
  });

  return (
    <Modal title={`Ofitsiant hisoboti — ${waiter.fullName}`} onClose={onClose} maxWidth="max-w-5xl">
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase">Dan</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black outline-none focus:border-slate-800" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 uppercase">Gacha</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-black outline-none focus:border-slate-800" />
          </div>
          <button onClick={() => refetch()} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-700">
            Yangilash
          </button>
        </div>

        {isLoading && <div className="py-10 text-center text-sm font-bold text-slate-400">Yuklanmoqda...</div>}
        {isError && <div className="py-6 text-center text-sm font-bold text-rose-600">Hisobotni yuklab bo'lmadi</div>}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: 'Yopilgan buyurtma', value: `${data.summary.totalOrders} ta`, color: 'text-emerald-700' },
                { label: 'Bekor qilingan', value: `${data.summary.totalCanceledOrders} ta`, color: 'text-rose-600' },
                { label: 'Faol kunlar', value: `${data.summary.activeDays} kun`, color: 'text-slate-900' },
                { label: "O'rtacha chek", value: formatUZS(data.summary.avgOrderValue), color: 'text-slate-900' },
                { label: 'Brutto savdo', value: formatUZS(data.summary.grossRevenue), color: 'text-slate-900' },
                { label: 'Chegirma', value: formatUZS(data.summary.discounts), color: 'text-amber-700' },
                { label: 'Netto savdo', value: formatUZS(data.summary.netRevenue), color: 'text-slate-900' },
                { label: 'Servis (dona)', value: `${data.summary.serviceServings} ta`, color: 'text-violet-700' },
                { label: 'Xizmat haqi', value: formatUZS(data.summary.serviceEarned), color: 'text-blue-700' },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</div>
                  <div className={`mt-1 text-base font-black ${item.color}`}>{item.value}</div>
                </div>
              ))}
            </div>

            <details open className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none border-b border-slate-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700">
                Yopilgan buyurtmalar ({data.orders.length})
              </summary>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Vaqt</th>
                      <th className="px-4 py-3">Buyurtma</th>
                      <th className="px-4 py-3">Joy</th>
                      <th className="px-4 py-3 text-right">Netto</th>
                      <th className="px-4 py-3 text-right">Naqd</th>
                      <th className="px-4 py-3 text-right">Karta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.orders.map((o) => (
                      <tr key={o.orderId} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-500">{formatDateTimeUZ(o.closedAt)}</td>
                        <td className="px-4 py-2 font-black">#{o.orderNumber}</td>
                        <td className="px-4 py-2 text-slate-600">{o.tableName ?? 'Takeaway'}</td>
                        <td className="px-4 py-2 text-right font-black">{formatUZS(o.net)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{formatUZS(o.cash)}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{formatUZS(o.card)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {data.canceledOrders.length > 0 && (
              <details className="overflow-hidden rounded-xl border border-rose-100 bg-white">
                <summary className="cursor-pointer list-none border-b border-rose-100 px-5 py-3 text-xs font-black uppercase tracking-widest text-rose-700">
                  Bekor qilingan buyurtmalar ({data.canceledOrders.length})
                </summary>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Vaqt</th>
                        <th className="px-4 py-3">Buyurtma</th>
                        <th className="px-4 py-3">Joy</th>
                        <th className="px-4 py-3 text-right">Summa</th>
                        <th className="px-4 py-3">Sabab</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.canceledOrders.map((o) => (
                        <tr key={o.orderId} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-500">{formatDateTimeUZ(o.canceledAt)}</td>
                          <td className="px-4 py-2 font-black">#{o.orderNumber}</td>
                          <td className="px-4 py-2 text-slate-600">{o.tableName ?? 'Takeaway'}</td>
                          <td className="px-4 py-2 text-right font-black text-rose-600">{formatUZS(o.gross)}</td>
                          <td className="px-4 py-2 text-slate-500 italic">{o.reason || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function RoleBadge({ role, isActive }: { role: string, isActive: boolean }) {
  const configs: any = {
    OWNER: { label: 'Ega', icon: Shield, color: 'bg-purple-100 text-purple-700' },
    ADMIN: { label: 'Admin', icon: Lock, color: 'bg-blue-100 text-blue-700' },
    KITCHEN: { label: 'Oshpaz', icon: ChefHat, color: 'bg-orange-100 text-orange-700' },
    WAITER: { label: 'Ofitsiant', icon: HandPlatter, color: 'bg-green-100 text-green-700' },
  };
  const config = configs[role];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold space-x-1.5 ${isActive ? config.color : 'bg-slate-100 text-slate-400'}`}>
      <Icon size={14} />
      <span>{config.label}</span>
    </span>
  );
}

function UserModal({ user, currentUserRole, onClose, onSave }: any) {
  const [showPass, setShowPass] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: user || { fullName: '', role: 'WAITER', username: '', password: '', pin: '' }
  });

  const selectedRole = watch('role');

  const isTrivialPin = (pin: string) => {
    return ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'].includes(pin);
  };

  const onSubmit = (data: any) => {
    if (data.role === 'WAITER' && isTrivialPin(data.pin)) {
      setFormError("PIN juda oddiy, iltimos boshqasini tanlang");
      return;
    }
    // Clean up data based on role
    if (data.role === 'WAITER') {
      delete data.username;
      delete data.password;
    } else {
      delete data.pin;
      if (!data.password && user) delete data.password; // Don't update password if empty on edit
    }
    onSave(data);
  };

  return (
    <Modal title={user ? "Foydalanuvchini tahrirlash" : "Yangi foydalanuvchi"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">To'liq ismi (FIO)</label>
          <input 
            {...register('fullName')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Masalan: Azizbek Karimov"
          />
          {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName.message as string}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
          <select 
            {...register('role')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {currentUserRole === 'OWNER' && <option value="OWNER">Ega (Owner)</option>}
            <option value="ADMIN">Administrator</option>
            <option value="KITCHEN">Oshpaz (Kitchen)</option>
            <option value="WAITER">Ofitsiant (Waiter)</option>
          </select>
        </div>

        {selectedRole !== 'WAITER' ? (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Foydalanuvchi nomi (Login)</label>
              <input 
                {...register('username')}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {user ? "Yangi parol (o'zgartirish uchun)" : "Parol"}
              </label>
              <div className="relative">
                <input 
                  type={showPass ? "text" : "password"}
                  {...register('password')}
                  className="w-full border border-slate-300 rounded-lg pl-3 pr-10 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••••••"
                />
                <button 
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            <label className="block text-sm font-medium text-slate-700 mb-1">PIN kod (4 raqam)</label>
            <input 
              type="text"
              maxLength={4}
              {...register('pin')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-center text-xl font-bold tracking-widest"
              placeholder="0000"
              onInput={(e) => {
                e.currentTarget.value = e.currentTarget.value.replace(/\D/g, '');
              }}
            />
          </div>
        )}

        {errors.username && <p className="text-xs text-red-500 font-medium">Username/Parol yoki PIN talab qilinadi</p>}
        {formError && <p className="text-xs text-red-600 font-semibold rounded-lg bg-red-50 px-3 py-2">{formError}</p>}

        <div className="flex space-x-3 pt-4">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50">Bekor qilish</button>
          <button type="submit" className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100">Saqlash</button>
        </div>
      </form>
    </Modal>
  );
}
