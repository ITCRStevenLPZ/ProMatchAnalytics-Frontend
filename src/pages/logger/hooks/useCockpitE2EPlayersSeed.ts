import { useEffect } from "react";
import type { Match } from "../types";

interface UseCockpitE2EPlayersSeedParams {
  enabled: boolean;
  match: Match | null;
}

export const useCockpitE2EPlayersSeed = ({
  enabled,
  match,
}: UseCockpitE2EPlayersSeedParams): void => {
  useEffect(() => {
    if (!enabled || !match) return;

    const ensurePlayers = (
      team: Match["home_team"],
      prefix: "HOME" | "AWAY",
    ) => {
      const hasRoster = Array.isArray(team.players) && team.players.length >= 2;
      if (hasRoster) return team.players;
      const teamLabel = prefix === "HOME" ? "Home" : "Away";
      return [1, 2].map((n) => ({
        id: `${prefix}-${n}`,
        jersey_number: n,
        full_name: `${teamLabel} Player ${n}`,
        short_name: `${teamLabel[0]}P${n}`,
        position: "MF",
      })) as Match["home_team"]["players"];
    };

    match.home_team.players = ensurePlayers(match.home_team, "HOME");
    match.away_team.players = ensurePlayers(match.away_team, "AWAY");
  }, [enabled, match]);
};
