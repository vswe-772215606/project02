import { useToastStore, type ToastType } from '../stores/toast.store';
import { cn } from '../lib/utils';

const TYPE_CLASSES: Record<ToastType, string> = {
  info: 'bg-card text-foreground border-border',
  success: 'bg-success text-success-foreground border-success',
  warning: 'bg-warning text-warning-foreground border-warning',
  error: 'bg-destructive text-destructive-foreground border-destructive',
};

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[120] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className={cn(
            'rounded-md border shadow-md px-4 py-3 text-sm text-left transition-opacity',
            TYPE_CLASSES[toast.type],
          )}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
