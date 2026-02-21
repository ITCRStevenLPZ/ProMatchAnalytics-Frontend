import { useCallback, useEffect, useState } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import type { Match, Player } from "../types";
import { compareSubstitutionEventOrder } from "../lib/clockHelpers";

interface OnFieldIds {
  home: Set<string>;
  away: Set<string>;
}

export interface UseOnFieldRosterResult {
  onFieldIds: OnFieldIds;
  applyOnFieldChange: (
    team: "home" | "away",
    playerOffId?: string,
    playerOnId?: string,
  ) => void;
}

export const useOnFieldRoster = (
  match: Match | null,
  liveEvents: MatchEvent[],
): UseOnFieldRosterResult => {
  const [onFieldIds, setOnFieldIds] = useState<OnFieldIds>({
    home: new Set(),
    away: new Set(),
  });

  const getInitialOnField = useCallback((players: Player[]) => {
    const starters = players.filter((player) => player.is_starter !== false);
    if (starters.length) return starters;
    return players.slice(0, Math.min(11, players.length));
  }, []);

  useEffect(() => {
    if (!match) return;
    const home = new Set(
      getInitialOnField(match.home_team.players).map((player) => player.id),
    );
    const away = new Set(
      getInitialOnField(match.away_team.players).map((player) => player.id),
    );

    const resolveTeamSideFromId = (
      teamId?: string | null,
    ): "home" | "away" | null => {
      const normalized = String(teamId || "")
        .trim()
        .toUpperCase();
      if (!normalized) return null;

      const homeAliases = new Set(
        [match.home_team.id, match.home_team.team_id, "HOME"]
          .filter(Boolean)
          .map((value) => String(value).trim().toUpperCase()),
      );
      const awayAliases = new Set(
        [match.away_team.id, match.away_team.team_id, "AWAY"]
          .filter(Boolean)
          .map((value) => String(value).trim().toUpperCase()),
      );

      if (homeAliases.has(normalized)) return "home";
      if (awayAliases.has(normalized)) return "away";
      return null;
    };

    const applySubstitution = (
      teamId?: string,
      playerOffId?: string,
      playerOnId?: string,
    ) => {
      const teamSide = resolveTeamSideFromId(teamId);
      const target =
        teamSide === "home" ? home : teamSide === "away" ? away : null;
      if (!target) return;
      if (playerOffId) target.delete(playerOffId);
      if (playerOnId) target.add(playerOnId);
    };

    const substitutionEvents = liveEvents
      .map((event, index) => ({ event, index }))
      .filter(({ event }) => event.type === "Substitution")
      .sort(compareSubstitutionEventOrder);

    substitutionEvents.forEach(({ event }) => {
      const playerOffId =
        event.data?.player_off_id ??
        event.data?.playerOffId ??
        event.data?.player_out_id ??
        event.data?.playerOutId ??
        event.player_id;
      const playerOnId =
        event.data?.player_on_id ??
        event.data?.playerOnId ??
        event.data?.player_in_id ??
        event.data?.playerInId;
      applySubstitution(event.team_id, playerOffId, playerOnId);
    });

    setOnFieldIds({ home, away });
  }, [getInitialOnField, liveEvents, match]);

  const applyOnFieldChange = useCallback(
    (team: "home" | "away", playerOffId?: string, playerOnId?: string) => {
      setOnFieldIds((prev) => {
        const nextHome = new Set(prev.home);
        const nextAway = new Set(prev.away);
        const target = team === "home" ? nextHome : nextAway;
        if (playerOffId) target.delete(playerOffId);
        if (playerOnId) target.add(playerOnId);
        return { home: nextHome, away: nextAway };
      });
    },
    [],
  );

  return { onFieldIds, applyOnFieldChange };
};
