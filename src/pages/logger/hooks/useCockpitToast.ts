import { useCallback, useState } from "react";

export interface CockpitToast {
  message: string;
  actionLabel?: string;
  action?: () => void;
}

interface UseCockpitToastResult {
  toast: CockpitToast | null;
  setToast: React.Dispatch<React.SetStateAction<CockpitToast | null>>;
  showTimedToast: (message: string, timeoutMs?: number) => void;
  dismissToast: () => void;
}

export const useCockpitToast = (): UseCockpitToastResult => {
  const [toast, setToast] = useState<CockpitToast | null>(null);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  const showTimedToast = useCallback((message: string, timeoutMs = 3000) => {
    setToast({ message });
    setTimeout(() => setToast(null), timeoutMs);
  }, []);

  return {
    toast,
    setToast,
    showTimedToast,
    dismissToast,
  };
};
