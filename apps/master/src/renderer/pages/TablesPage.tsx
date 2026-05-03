import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Armchair, 
  Plus, 
  Pencil, 
  Trash2, 
  RotateCcw,
  Hash,
  Eye,
  EyeOff
} from 'lucide-react';
import { tablesApi, Table } from '../api/tables';
import { Modal } from '../components/Modal';

const tableSchema = z.object({
  name: z.string().min(1, "Nom kiritilishi shart"),
  type: z.enum(['TABLE', 'ROOM']),
  displayOrder: z.number().int().default(0),
});

type TableForm = z.infer<typeof tableSchema>;

export function TablesPage() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables', showInactive],
    queryFn: () => tablesApi.list(showInactive),
  });

  const sortedTables = [...tables].sort((a, b) => a.displayOrder - b.displayOrder);

  const createMutation = useMutation({
    mutationFn: (data: TableForm) => tablesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setIsAdding(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Table> }) => tablesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] });
      setEditTable(null);
    }
  });

  const handleToggleActive = (table: Table) => {
    if (table.isActive) {
      if (confirm(`"${table.name}" stolini faolsizlantirmoqchimisiz?`)) {
        updateMutation.mutate({ id: table.id, data: { isActive: false } });
      }
    } else {
      if (confirm(`"${table.name}" stolini qayta faollashtirmoqchimisiz?`)) {
        updateMutation.mutate({ id: table.id, data: { isActive: true } });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Armchair className="text-slate-400" size={28} />
          <h1 className="text-2xl font-bold text-slate-800">Stollar boshqaruvi</h1>
        </div>
        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors">
            <input 
              type="checkbox" 
              checked={showInactive} 
              onChange={(e) => setShowInactive(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Faolsizlarni ko'rsatish</span>
          </label>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center space-x-2 shadow-sm"
          >
            <Plus size={20} />
            <span>Yangi stol</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {sortedTables.map((table) => (
            <div 
              key={table.id} 
              className={`bg-white rounded-2xl border p-6 shadow-sm transition-all hover:shadow-md ${
                !table.isActive ? 'bg-slate-50 border-dashed border-slate-300' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${
                  !table.isActive ? 'bg-slate-200 text-slate-400' :
                  table.activeOrderId ? 'bg-red-50 text-red-600 border border-red-100' : 
                  'bg-green-50 text-green-600 border border-green-100'
                }`}>
                  <Armchair size={24} />
                </div>
                <div className="flex items-center space-x-1">
                  {table.isActive ? (
                    <>
                      <div className={`w-2.5 h-2.5 rounded-full ${table.activeOrderId ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${table.activeOrderId ? 'text-red-600' : 'text-green-600'}`}>
                        {table.activeOrderId ? 'Band' : 'Bo\'sh'}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nofaol</span>
                  )}
                </div>
              </div>

              <div>
                <h3 className={`text-lg font-black ${!table.isActive ? 'text-slate-400 italic line-through' : 'text-slate-800'}`}>
                  {table.name}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">{table.type}</p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center text-slate-400 space-x-3">
                  <div className="flex items-center space-x-1" title="Tartib raqami">
                    <Hash size={14} />
                    <span className="text-xs font-bold">{table.displayOrder}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <button 
                    onClick={() => setEditTable(table)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Pencil size={18} />
                  </button>
                  <button 
                    onClick={() => handleToggleActive(table)}
                    className={`p-2 rounded-lg transition-colors ${
                      table.isActive ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-green-500 hover:bg-green-50'
                    }`}
                    title={table.isActive ? "Faolsizlantirish" : "Faollashtirish"}
                  >
                    {table.isActive ? <Trash2 size={18} /> : <RotateCcw size={18} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(isAdding || editTable) && (
        <TableModal 
          table={editTable}
          onClose={() => { setIsAdding(false); setEditTable(null); }}
          onSave={(data: TableForm) => editTable 
            ? updateMutation.mutate({ id: editTable.id, data })
            : createMutation.mutate(data)
          }
        />
      )}
    </div>
  );
}

function TableModal({ table, onClose, onSave }: any) {
  const { register, handleSubmit, formState: { errors } } = useForm<TableForm>({
    resolver: zodResolver(tableSchema),
    defaultValues: table || { name: '', type: 'TABLE', displayOrder: 0 }
  });

  return (
    <Modal title={table ? "Stolni tahrirlash" : "Yangi stol"} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Stol nomi / raqami</label>
          <input 
            {...register('name')}
            className={`w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-500 bg-red-50' : 'border-slate-300'
            }`}
            placeholder="Masalan: Stol 1 yoki VIP 1"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Turi</label>
          <select 
            {...register('type')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="TABLE">Oddiy stol</option>
            <option value="ROOM">Xona</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tartib raqami</label>
          <input 
            type="number"
            {...register('displayOrder', { valueAsNumber: true })}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex space-x-3 pt-4">
          <button 
            type="button" 
            onClick={onClose} 
            className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Bekor qilish
          </button>
          <button 
            type="submit" 
            className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 shadow-md shadow-blue-100 transition-all"
          >
            Saqlash
          </button>
        </div>
      </form>
    </Modal>
  );
}
