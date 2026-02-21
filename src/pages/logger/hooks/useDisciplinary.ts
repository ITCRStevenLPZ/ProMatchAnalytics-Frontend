import { useMemo } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import { compareCardEventOrder } from "../lib/clockHelpers";

interface CardDisciplinaryStatus {
  yellowCount: number;
  red: boolean;
}

export interface UseDisciplinaryResult {
  cardDisciplinaryStatus: Record<string, CardDisciplinaryStatus>;
  cardYellowCounts: Record<string, number>;
  expelledPlayerIds: Set<string>;
}

export const useDisciplinary = (
  liveEvents: MatchEvent[],
  queuedEvents: MatchEvent[],
): UseDisciplinaryResult => {
  const cardDisciplinaryStatus = useMemo(() => {
    const byPlayer = new Map<
      string,
      { yellow: number; red: number; suppressNextRed: number }
    >();
    const combinedEvents = [...liveEvents, ...queuedEvents]
      .filter((event) => event.type === "Card" && Boolean(event.player_id))
      .map((event, index) => ({ event, index }))
      .sort(compareCardEventOrder);

    combinedEvents.forEach(({ event }) => {
      const playerId = event.player_id;
      if (!playerId) return;
      const state = byPlayer.get(playerId) ?? {
        yellow: 0,
        red: 0,
        suppressNextRed: 0,
      };
      const cardType = String(event.data?.card_type || "").toLowerCase();

      if (cardType.includes("cancel")) {
        if (state.red > 0 && state.yellow >= 2) {
          state.red -= 1;
          state.yellow -= 1;
        } else if (state.red > 0) {
          state.red -= 1;
        } else if (state.yellow > 0) {
          state.yellow -= 1;
        }
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("yellow (second)")) {
        state.yellow += 1;
        state.red += 1;
        state.suppressNextRed += 1;
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("yellow")) {
        state.yellow += 1;
        byPlayer.set(playerId, state);
        return;
      }

      if (cardType.includes("red")) {
        if (state.suppressNextRed > 0) {
          state.suppressNextRed -= 1;
        } else {
          state.red += 1;
        }
        byPlayer.set(playerId, state);
      }
    });

    const status: Record<string, CardDisciplinaryStatus> = {};
    byPlayer.forEach((value, playerId) => {
      status[playerId] = {
        yellowCount: Math.max(0, value.yellow),
        red: value.red > 0,
      };
    });
    return status;
  }, [liveEvents, queuedEvents]);

  const cardYellowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(cardDisciplinaryStatus).forEach(([playerId, value]) => {
      counts[playerId] = value.yellowCount;
    });
    return counts;
  }, [cardDisciplinaryStatus]);

  const expelledPlayerIds = useMemo(() => {
    const expelled = new Set<string>();
    Object.entries(cardDisciplinaryStatus).forEach(([playerId, status]) => {
      if (status.red || status.yellowCount >= 2) {
        expelled.add(playerId);
      }
    });
    return expelled;
  }, [cardDisciplinaryStatus]);

  return {
    cardDisciplinaryStatus,
    cardYellowCounts,
    expelledPlayerIds,
  };
};
