interface ToastState {
  message: string;
  actionLabel?: string;
  action?: () => void;
}

interface ToastNotificationProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export default function ToastNotification({
  toast,
  onDismiss,
}: ToastNotificationProps) {
  if (!toast) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded shadow-lg max-w-sm flex items-start gap-3"
      data-testid="logger-toast"
    >
      <div className="flex-1 text-sm leading-snug">{toast.message}</div>
      {toast.action && toast.actionLabel && (
        <button
          onClick={toast.action}
          className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
        >
          {toast.actionLabel}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="text-xs text-gray-300 hover:text-white"
        aria-label="Dismiss toast"
      >
        ✕
      </button>
    </div>
  );
}
