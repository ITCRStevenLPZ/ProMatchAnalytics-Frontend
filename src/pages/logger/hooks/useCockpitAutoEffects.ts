import { useEffect, useRef } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";

interface UseCockpitAutoEffectsParams {
  t: (...args: any[]) => any;
  liveEvents: MatchEvent[];
  duplicateHighlight: unknown;
  clearDuplicateHighlight: () => void;
  beginIneffective: (
    note?: string | null,
    context?: {
      teamId?: string | null;
      playerId?: string | null;
      actionType?: "Goal" | null;
    } | null,
  ) => void;
}

export const useCockpitAutoEffects = ({
  t,
  liveEvents,
  duplicateHighlight,
  clearDuplicateHighlight,
  beginIneffective,
}: UseCockpitAutoEffectsParams): void => {
  const lastGoalClientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!duplicateHighlight) return;
    const timer = setTimeout(() => {
      clearDuplicateHighlight();
    }, 5000);
    return () => clearTimeout(timer);
  }, [duplicateHighlight, clearDuplicateHighlight]);

  useEffect(() => {
    if (!liveEvents.length) return;
    const latest = liveEvents[liveEvents.length - 1];
    if (!latest) return;
    if (latest.type !== "Shot" || latest.data?.outcome !== "Goal") return;
    if (!latest.client_id) return;
    if (lastGoalClientIdRef.current === latest.client_id) return;

    lastGoalClientIdRef.current = latest.client_id;
    beginIneffective(t("ineffectiveNoteGoal", "Goal"), {
      teamId: latest.team_id,
      playerId: latest.player_id,
      actionType: "Goal",
    });
  }, [beginIneffective, liveEvents, t]);
};
