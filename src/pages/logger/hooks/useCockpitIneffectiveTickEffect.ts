import { useEffect } from "react";

interface UseCockpitIneffectiveTickEffectParams {
  match: unknown;
  hasActiveIneffective: boolean;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  isVarActiveLocal: boolean;
  isTimeoutActive: boolean;
  setIneffectiveTick: (value: number) => void;
}

export const useCockpitIneffectiveTickEffect = ({
  match,
  hasActiveIneffective,
  clockMode,
  isVarActiveLocal,
  isTimeoutActive,
  setIneffectiveTick,
}: UseCockpitIneffectiveTickEffectParams): void => {
  useEffect(() => {
    if (
      !match ||
      (!hasActiveIneffective &&
        clockMode !== "INEFFECTIVE" &&
        !isVarActiveLocal &&
        !isTimeoutActive)
    ) {
      return undefined;
    }
    const interval = setInterval(() => {
      setIneffectiveTick(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [
    clockMode,
    hasActiveIneffective,
    isVarActiveLocal,
    isTimeoutActive,
    match,
    setIneffectiveTick,
  ]);
};
