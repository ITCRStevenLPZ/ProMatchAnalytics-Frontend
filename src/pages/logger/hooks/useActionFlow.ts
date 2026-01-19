import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MatchEvent } from "../../../store/useMatchLogStore";
import { ACTION_FLOWS } from "../constants";
import { ActionStep, EventType, Match, Player, Team } from "../types";

interface UseActionFlowParams {
  match: Match | null;
  globalClock: string;
  operatorPeriod: number;
  selectedTeam: "home" | "away" | "both";
  isSubmitting: boolean;
  sendEvent: (event: Omit<MatchEvent, "match_id" | "timestamp">) => void;
}

const resolveEventType = (action: string): EventType => {
  if (action === "Pass") return "Pass";
  if (action === "Shot") return "Shot";
  if (action === "Duel") return "Duel";
  if (action === "Foul") return "FoulCommitted";
  if (action === "Card") return "Card";
  if (action === "Interception") return "Interception";
  if (action === "Clearance") return "Clearance";
  if (action === "Block") return "Block";
  if (action === "Recovery" || action === "Carry") return "Recovery";
  if (action === "Offside") return "Offside";
  if (
    [
      "Corner",
      "Free Kick",
      "Throw-in",
      "Goal Kick",
      "Penalty",
      "Kick Off",
    ].includes(action)
  ) {
    return "SetPiece";
  }
  if (["Save", "Claim", "Punch", "Pick Up", "Smother"].includes(action)) {
    return "GoalkeeperAction";
  }
  return "Pass";
};

const getActionConfig = (action?: string | null) => {
  if (!action) return undefined;
  return Object.values(ACTION_FLOWS).find((config) =>
    config.actions.includes(action),
  );
};

const buildEventPayload = (
  action: string,
  outcome: string | null,
  recipient: Player | null,
  currentTeam: Team,
  selectedPlayer: Player,
  globalClock: string,
  operatorPeriod: number,
): Omit<MatchEvent, "match_id" | "timestamp"> => {
  const eventType = resolveEventType(action);
  // Always use the live global clock for event timestamps to avoid stale operator-clock values.
  const matchClock = globalClock;

  const eventData: Omit<MatchEvent, "match_id" | "timestamp"> = {
    match_clock: matchClock,
    period: operatorPeriod,
    team_id: currentTeam.id,
    player_id: selectedPlayer.id,
    type: eventType,
    data: {},
  };

  switch (eventType) {
    case "Pass":
      eventData.data = {
        pass_type: "Standard",
        outcome: outcome || "Complete",
        receiver_id: recipient?.id,
        receiver_name: recipient?.full_name,
      };
      break;
    case "Shot":
      eventData.data = {
        shot_type: "Standard",
        outcome: outcome || "OnTarget",
      };
      break;
    case "Duel":
      eventData.data = {
        duel_type: "Ground",
        outcome: outcome || "Won",
      };
      break;
    case "FoulCommitted":
      eventData.data = {
        foul_type: "Standard",
        outcome: outcome || "Standard",
      };
      break;
    case "Card":
      eventData.data = {
        card_type: outcome || "Yellow",
        reason: "Foul",
      };
      break;
    case "Interception":
      eventData.data = {
        outcome: outcome || "Success",
      };
      break;
    case "Clearance":
      eventData.data = {
        outcome: outcome || "Success",
      };
      break;
    case "Block":
      eventData.data = {
        block_type: "Shot",
        outcome: outcome || "Success",
      };
      break;
    case "Recovery":
      eventData.data = {
        recovery_type: outcome || "Loose Ball",
      };
      break;
    case "Offside":
      eventData.data = {
        pass_player_id: null,
      };
      break;
    case "SetPiece":
      eventData.data = {
        set_piece_type: action,
        outcome: outcome || "Complete",
      };
      break;
    case "GoalkeeperAction":
      eventData.data = {
        action_type: action,
        outcome: outcome || "Success",
      };
      break;
    default:
      break;
  }

  return eventData;
};

export const useActionFlow = ({
  match,
  globalClock,
  operatorPeriod,
  selectedTeam,
  isSubmitting,
  sendEvent,
}: UseActionFlowParams) => {
  const [currentStep, setCurrentStep] = useState<ActionStep>("selectPlayer");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null);
  const currentStepRef = useRef<ActionStep>("selectPlayer");

  const currentTeam = useMemo<Team | undefined>(() => {
    if (!match) return undefined;
    if (selectedTeam === "home") return match.home_team;
    if (selectedTeam === "away") return match.away_team;
    // If viewing both, defer to selected player's team if available
    if (selectedPlayer) {
      const isHome = match.home_team.players.some(
        (p) => p.id === selectedPlayer.id,
      );
      if (isHome) return match.home_team;
      const isAway = match.away_team.players.some(
        (p) => p.id === selectedPlayer.id,
      );
      if (isAway) return match.away_team;
    }
    return undefined;
  }, [match, selectedPlayer, selectedTeam]);

  const availableActions = useMemo(() => {
    if (!selectedPlayer) return [];
    return Object.values(ACTION_FLOWS).flatMap((config) => config.actions);
  }, [selectedPlayer]);

  const availableOutcomes = useMemo(() => {
    if (!selectedAction) return [];
    return getActionConfig(selectedAction)?.outcomes?.[selectedAction] || [];
  }, [selectedAction]);

  const resetFlow = useCallback(() => {
    setCurrentStep("selectPlayer");
    setSelectedPlayer(null);
    setSelectedAction(null);
    setPendingOutcome(null);
  }, []);

  const dispatchEvent = useCallback(
    (action: string, outcome: string | null, recipient: Player | null) => {
      if (!match || !currentTeam || !selectedPlayer) return false;
      if (isSubmitting) return false;
      const payload = buildEventPayload(
        action,
        outcome,
        recipient,
        currentTeam,
        selectedPlayer,
        globalClock,
        operatorPeriod,
      );
      sendEvent(payload);
      return true;
    },
    [
      match,
      currentTeam,
      selectedPlayer,
      isSubmitting,
      globalClock,
      operatorPeriod,
      sendEvent,
    ],
  );

  const handlePlayerClick = useCallback((player: Player) => {
    setSelectedPlayer(player);
    setCurrentStep("selectAction");
  }, []);

  const handleActionClick = useCallback((action: string) => {
    setSelectedAction(action);
    setPendingOutcome(null);
    setCurrentStep("selectOutcome");
  }, []);

  const handleOutcomeClick = useCallback(
    (outcome: string) => {
      if (!selectedAction) return;
      const config = getActionConfig(selectedAction);
      console.log("[useActionFlow] handleOutcomeClick:", {
        outcome,
        selectedAction,
        config,
        needsRecipient: config?.needsRecipient,
      });
      if (config?.needsRecipient) {
        setPendingOutcome(outcome);
        setCurrentStep("selectRecipient");
        console.log("[useActionFlow] Transitioning to selectRecipient step");
        return;
      }
      if (dispatchEvent(selectedAction, outcome, null)) {
        resetFlow();
      }
    },
    [
      dispatchEvent,
      resetFlow,
      selectedAction,
      currentTeam?.players,
      selectedPlayer,
    ],
  );

  const handleRecipientClick = useCallback(
    (recipient: Player) => {
      if (!selectedAction || !pendingOutcome) return;
      if (dispatchEvent(selectedAction, pendingOutcome, recipient)) {
        resetFlow();
      }
    },
    [dispatchEvent, pendingOutcome, resetFlow, selectedAction],
  );

  useEffect(() => {
    currentStepRef.current = currentStep;
    console.log("[useActionFlow] currentStep changed to:", currentStep);
  }, [currentStep]);

  return {
    currentStep,
    currentTeam,
    selectedPlayer,
    selectedAction,
    availableActions,
    availableOutcomes,
    handlePlayerClick,
    handleActionClick,
    handleOutcomeClick,
    handleRecipientClick,
    resetFlow,
    currentStepRef,
  } as const;
};
