import { useCallback } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import { formatMatchClock } from "../utils";
import type { Match } from "../types";

interface UseCockpitHarnessEventsParams {
  match: Match | null;
  operatorClock: string;
  operatorPeriod: number;
  sendEvent: (event: Omit<MatchEvent, "match_id" | "timestamp">) => void;
}

interface UseCockpitHarnessEventsResult {
  sendHarnessPassEvent: (options: {
    team: "home" | "away";
    passerId: string;
    recipientId: string;
  }) => void;
  sendHarnessRawEvent: (payload: Record<string, any>) => void;
}

export const useCockpitHarnessEvents = ({
  match,
  operatorClock,
  operatorPeriod,
  sendEvent,
}: UseCockpitHarnessEventsParams): UseCockpitHarnessEventsResult => {
  const sendHarnessPassEvent = useCallback(
    (options: {
      team: "home" | "away";
      passerId: string;
      recipientId: string;
    }) => {
      if (!match) return;
      const { team, passerId, recipientId } = options;
      const targetTeam = team === "home" ? match.home_team : match.away_team;
      const passer = targetTeam.players?.find(
        (player) => player.id === passerId,
      );
      const recipient = targetTeam.players?.find(
        (player) => player.id === recipientId,
      );
      if (!passer || !recipient) return;

      const eventData: Omit<MatchEvent, "match_id" | "timestamp"> = {
        match_clock: operatorClock?.trim()
          ? operatorClock
          : formatMatchClock(match.match_time_seconds),
        period: operatorPeriod,
        team_id: targetTeam.id,
        player_id: passer.id,
        type: "Pass",
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: recipient.id,
          receiver_name: recipient.full_name,
        },
      };

      sendEvent(eventData);
    },
    [match, operatorClock, operatorPeriod, sendEvent],
  );

  const sendHarnessRawEvent = useCallback(
    (payload: Record<string, any>) => {
      sendEvent(payload as Omit<MatchEvent, "match_id" | "timestamp">);
    },
    [sendEvent],
  );

  return {
    sendHarnessPassEvent,
    sendHarnessRawEvent,
  };
};
