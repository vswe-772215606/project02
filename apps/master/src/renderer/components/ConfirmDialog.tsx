import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info } from 'lucide-react';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({ message, onConfirm, onCancel, variant = 'default' }: ConfirmDialogProps) {
  const isConfirm = Boolean(onCancel);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
      if (e.key === 'Escape' && onCancel) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onConfirm, onCancel]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onMouseDown={onCancel ?? onConfirm}
        aria-hidden="true"
      />
      <div className="relative flex h-full items-center justify-center p-4">
        <div
          role="alertdialog"
          aria-modal="true"
          className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-150 rounded-2xl border border-white/20 bg-white shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="space-y-4 px-6 py-5">
            <div className="flex items-start gap-3">
              {variant === 'danger' ? (
                <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={20} />
              ) : (
                <Info className="mt-0.5 shrink-0 text-slate-400" size={20} />
              )}
              <p className="text-sm font-semibold text-slate-800">{message}</p>
            </div>
            <div className="flex justify-end gap-3">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Yo'q
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={onConfirm}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                  variant === 'danger'
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : isConfirm
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-200 text-slate-800 hover:bg-slate-300'
                }`}
              >
                {isConfirm ? 'Ha' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
