import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function Modal({ title, children, onClose, maxWidth = 'max-w-2xl', initialFocusRef }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    window.setTimeout(() => {
      initialFocusRef?.current?.focus?.();
      if (document.activeElement === document.body) {
        closeButtonRef.current?.focus();
      }
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActive?.focus?.();
    };
  }, [initialFocusRef, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[100]">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div className="relative flex h-full items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`bg-white rounded-2xl shadow-2xl w-full ${maxWidth} flex max-h-[95vh] flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-white/20`}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{title}</h3>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-all active:scale-95"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
