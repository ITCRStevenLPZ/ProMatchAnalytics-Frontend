import { useEffect } from "react";

interface UseCockpitExpelledPlayerEffectParams {
  selectedPlayer: { id: string } | null;
  expelledPlayerIds: Set<string>;
  resetFlow: () => void;
  setToast: (toast: { message: string } | null) => void;
  t: (key: string, fallback: string) => string;
}

export const useCockpitExpelledPlayerEffect = ({
  selectedPlayer,
  expelledPlayerIds,
  resetFlow,
  setToast,
  t,
}: UseCockpitExpelledPlayerEffectParams): void => {
  useEffect(() => {
    if (!selectedPlayer) return;
    if (!expelledPlayerIds.has(selectedPlayer.id)) return;
    resetFlow();
    setToast({
      message: t(
        "playerExpelled",
        "Player is expelled and cannot log actions.",
      ),
    });
    const timeout = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timeout);
  }, [expelledPlayerIds, resetFlow, selectedPlayer, setToast, t]);
};
