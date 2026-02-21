import { useMemo } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import type { Match } from "../types";

interface UseCockpitSubstitutionFlowParams {
  match: Match | null;
  substitutionTeam: "home" | "away";
  onFieldIds: { home: Set<string>; away: Set<string> };
  cockpitLocked: boolean;
  expelledPlayerIds: Set<string>;
  globalClock: string;
  operatorPeriod: number;
  applyOnFieldChange: (
    team: "home" | "away",
    offId?: string,
    onId?: string,
  ) => void;
  sendEvent: (eventData: Omit<MatchEvent, "match_id" | "timestamp">) => void;
  setShowSubstitutionFlow: (open: boolean) => void;
  showTimedToast: (message: string, timeoutMs?: number) => void;
  t: (key: string, fallback: string) => string;
}

interface UseCockpitSubstitutionFlowResult {
  modalTeam: Match["home_team"] | Match["away_team"] | null;
  availablePlayers: Match["home_team"]["players"];
  onField: Set<string>;
  onSubmit: (
    playerOffId: string,
    playerOnId: string,
    isConcussion: boolean,
  ) => void;
  onCancel: () => void;
}

export const useCockpitSubstitutionFlow = ({
  match,
  substitutionTeam,
  onFieldIds,
  cockpitLocked,
  expelledPlayerIds,
  globalClock,
  operatorPeriod,
  applyOnFieldChange,
  sendEvent,
  setShowSubstitutionFlow,
  showTimedToast,
  t,
}: UseCockpitSubstitutionFlowParams): UseCockpitSubstitutionFlowResult => {
  const modalTeam = useMemo(() => {
    if (!match) return null;
    return substitutionTeam === "home" ? match.home_team : match.away_team;
  }, [match, substitutionTeam]);

  const availablePlayers = useMemo(() => {
    if (!match) return [] as Match["home_team"]["players"];
    return substitutionTeam === "home"
      ? match.home_team.players
      : match.away_team.players;
  }, [match, substitutionTeam]);

  const onField = useMemo(
    () => (substitutionTeam === "home" ? onFieldIds.home : onFieldIds.away),
    [substitutionTeam, onFieldIds.home, onFieldIds.away],
  );

  const onSubmit = (
    playerOffId: string,
    playerOnId: string,
    isConcussion: boolean,
  ) => {
    if (!match || cockpitLocked) return;

    if (
      expelledPlayerIds.has(playerOffId) ||
      expelledPlayerIds.has(playerOnId)
    ) {
      showTimedToast(
        t(
          "substitutionExpelledBlocked",
          "Expelled players cannot be substituted.",
        ),
      );
      return;
    }

    const team =
      substitutionTeam === "home" ? match.home_team : match.away_team;
    const eventData: Omit<MatchEvent, "match_id" | "timestamp"> = {
      match_clock: globalClock,
      period: operatorPeriod,
      team_id: team.id,
      player_id: playerOffId,
      type: "Substitution",
      data: {
        player_off_id: playerOffId,
        player_on_id: playerOnId,
        is_concussion: isConcussion,
      },
    };

    applyOnFieldChange(substitutionTeam, playerOffId, playerOnId);
    sendEvent(eventData);
    setShowSubstitutionFlow(false);
  };

  const onCancel = () => {
    setShowSubstitutionFlow(false);
  };

  return {
    modalTeam,
    availablePlayers,
    onField,
    onSubmit,
    onCancel,
  };
};
