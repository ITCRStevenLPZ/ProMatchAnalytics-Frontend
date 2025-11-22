import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  isConfirming?: boolean;
  icon?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export function ConfirmationModal({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  closeLabel = 'Close dialog',
  confirmVariant = 'primary',
  isConfirming = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  const confirmClasses =
    confirmVariant === 'danger'
      ? 'inline-flex justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70'
      : 'inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70';

  const cancelClasses =
    'inline-flex justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

  const Icon = icon ?? (confirmVariant === 'danger' ? <AlertTriangle className="text-red-600" size={24} /> : null);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <button
          onClick={onCancel}
          aria-label={closeLabel}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-500 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            {Icon && <div className="mt-1">{Icon}</div>}
            <div>
              <h2 id={titleId} className="text-lg font-semibold text-gray-900">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-gray-600">
                  {description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={onCancel} className={cancelClasses}>
              {cancelLabel}
            </button>
            <button onClick={onConfirm} disabled={isConfirming} className={confirmClasses}>
              {isConfirming ? `${confirmLabel}...` : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
