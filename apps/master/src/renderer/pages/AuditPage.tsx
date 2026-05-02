import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ScrollText, 
  Search, 
  Calendar, 
  User as UserIcon, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  Info,
  RefreshCw,
  Eye
} from 'lucide-react';
import { auditApi } from '../api/audit';
import { usersApi } from '../api/users';
import { formatDateTimeUZ } from '../utils/format';
import { AUDIT_LABELS } from '../lib/audit-labels';

export function AuditPage() {
  const [filters, setFilters] = useState({
    action: '',
    userId: '',
    from: '',
    to: '',
    page: 1,
    pageSize: 20
  });

  const { data: auditData, isLoading, isFetching } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => auditApi.list(filters),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const totalPages = auditData ? Math.ceil(auditData.total / filters.pageSize) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <ScrollText size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Audit jurnali</h1>
            <p className="text-slate-500">Tizimdagi barcha muhim harakatlar tarixi</p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Harakat</label>
          <select 
            value={filters.action}
            onChange={(e) => handleFilterChange('action', e.target.value)}
            className="block w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Hammasi</option>
            {Object.entries(AUDIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Foydalanuvchi</label>
          <select 
            value={filters.userId}
            onChange={(e) => handleFilterChange('userId', e.target.value)}
            className="block w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">Barcha foydalanuvchilar</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Dan</label>
          <input 
            type="date" 
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            className="block px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Gacha</label>
          <input 
            type="date" 
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
            className="block px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        <button 
          onClick={() => setFilters({ action: '', userId: '', from: '', to: '', page: 1, pageSize: 20 })}
          className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          Filtrlarni tozalash
        </button>

        {isFetching && <RefreshCw size={18} className="animate-spin text-blue-500 ml-auto mb-2" />}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vaqt</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Foydalanuvchi</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Harakat</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Obyekt</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Batafsil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {auditData?.items.map((log: any) => (
                <React.Fragment key={log.id}>
                  <tr className={`hover:bg-slate-50/50 transition-colors ${expandedRow === log.id ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatDateTimeUZ(new Date(log.createdAt))}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                          {log.user.fullName.split(' ').map((n: string) => n[0]).join('')}
                        </div>
                        <span className="text-sm font-medium text-slate-800">{log.user.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-semibold text-slate-700">
                        {AUDIT_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase leading-none mb-1">{log.entityType}</span>
                        <span className="text-xs font-mono text-slate-500">{log.entityId || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                        className={`p-1.5 rounded-lg transition-colors ${expandedRow === log.id ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                  {expandedRow === log.id && (
                    <tr className="bg-blue-50/20">
                      <td colSpan={5} className="px-6 py-4">
                        <div className="bg-white border border-blue-100 rounded-lg p-4 shadow-inner">
                          <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Metadata (Texnik ma'lumotlar)</h4>
                          <pre className="text-xs font-mono bg-slate-50 p-3 rounded border border-slate-100 overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {auditData?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Info size={32} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500">Ma'lumotlar topilmadi</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Jami: <span className="font-bold text-slate-700">{auditData?.total || 0}</span> ta yozuv
          </div>
          <div className="flex items-center space-x-2">
            <button 
              disabled={filters.page === 1}
              onClick={() => handleFilterChange('page', filters.page - 1)}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-bold text-slate-700 px-2">
              {filters.page} / {totalPages || 1}
            </span>
            <button 
              disabled={filters.page >= totalPages}
              onClick={() => handleFilterChange('page', filters.page + 1)}
              className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
