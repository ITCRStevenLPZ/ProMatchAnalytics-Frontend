import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MatchEvent } from "../../../store/useMatchLogStore";
import { ACTION_FLOWS } from "../constants";
import {
  ActionStep,
  EventType,
  FieldAnchor,
  FieldCoordinate,
  IneffectiveAction,
  Match,
  Player,
  Team,
} from "../types";

interface UseActionFlowParams {
  match: Match | null;
  globalClock: string;
  operatorPeriod: number;
  selectedTeam: "home" | "away" | "both";
  isSubmitting: boolean;
  cardYellowCounts: Record<string, number>;
  expelledPlayerIds: Set<string>;
  recentEvents: MatchEvent[];
  onIneffectiveTrigger?: (payload: {
    note?: string;
    teamId: string;
    playerId?: string;
    actionType: IneffectiveAction;
  }) => void;
  sendEvent: (event: Omit<MatchEvent, "match_id" | "timestamp">) => void;
}

const resolveEventType = (action: string): EventType => {
  if (action === "Pass") return "Pass";
  if (action === "Shot" || action === "Goal" || action === "DirectShot")
    return "Shot";
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

const isGoalkeeperPosition = (value?: string | null) => {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
  return (
    normalized === "gk" ||
    normalized.includes("goalkeeper") ||
    normalized.includes("keeper") ||
    normalized.includes("portero")
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
  location?: [number, number],
  endLocation?: [number, number],
  extraData?: Record<string, any>,
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

  if (location) {
    eventData.location = location;
  }

  switch (eventType) {
    case "Pass":
      eventData.data = {
        pass_type: "Standard",
        outcome: outcome || "Complete",
        receiver_id: recipient?.id,
        receiver_name: recipient?.full_name,
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Shot":
      eventData.data = {
        shot_type: "Standard",
        outcome: outcome || "OnTarget",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Duel":
      eventData.data = {
        duel_type: "Ground",
        outcome: outcome || "Won",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "FoulCommitted":
      eventData.data = {
        foul_type: "Standard",
        outcome: outcome || "Standard",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Card":
      eventData.data = {
        card_type: outcome || "Yellow",
        reason: "Foul",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Interception":
      eventData.data = {
        outcome: outcome || "Success",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Clearance":
      eventData.data = {
        outcome: outcome || "Success",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Block":
      eventData.data = {
        block_type: "Shot",
        outcome: outcome || "Success",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Recovery":
      eventData.data = {
        recovery_type: outcome || "Loose Ball",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "Offside":
      eventData.data = {
        pass_player_id: null,
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "SetPiece":
      eventData.data = {
        set_piece_type: action,
        outcome: outcome || "Complete",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    case "GoalkeeperAction":
      eventData.data = {
        action_type: action,
        outcome: outcome || "Success",
        ...(endLocation ? { end_location: endLocation } : {}),
      };
      break;
    default:
      break;
  }

  if (extraData) {
    eventData.data = { ...eventData.data, ...extraData };
  }

  return eventData;
};

export const useActionFlow = ({
  match,
  globalClock,
  operatorPeriod,
  selectedTeam,
  isSubmitting,
  cardYellowCounts,
  expelledPlayerIds,
  recentEvents,
  onIneffectiveTrigger,
  sendEvent,
}: UseActionFlowParams) => {
  const [currentStep, setCurrentStep] = useState<ActionStep>("selectPlayer");
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [pendingOutcome, setPendingOutcome] = useState<string | null>(null);
  const [fieldAnchor, setFieldAnchor] = useState<FieldAnchor | null>(null);
  const [selectedPlayerLocation, setSelectedPlayerLocation] = useState<
    [number, number] | null
  >(null);
  const currentStepRef = useRef<ActionStep>("selectPlayer");

  const currentTeam = useMemo<Team | undefined>(() => {
    if (!match) return undefined;
    if (selectedPlayer) {
      const isHomePlayer = match.home_team.players.some(
        (player) => player.id === selectedPlayer.id,
      );
      if (isHomePlayer) return match.home_team;
      const isAwayPlayer = match.away_team.players.some(
        (player) => player.id === selectedPlayer.id,
      );
      if (isAwayPlayer) return match.away_team;
    }
    if (selectedTeam === "home") return match.home_team;
    if (selectedTeam === "away") return match.away_team;
    return undefined;
  }, [match, selectedPlayer, selectedTeam]);

  const resolvePlayerSide = useCallback(
    (player?: Player | null): "home" | "away" | null => {
      if (!match || !player) return null;
      if (match.home_team.players.some((p) => p.id === player.id))
        return "home";
      if (match.away_team.players.some((p) => p.id === player.id))
        return "away";
      return null;
    },
    [match],
  );

  const resolveOpponentTeamId = useCallback(
    (teamId?: string | null): string | null => {
      if (!match || !teamId) return null;
      if (teamId === match.home_team.id) return match.away_team.id;
      if (teamId === match.away_team.id) return match.home_team.id;
      return null;
    },
    [match],
  );

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
    setFieldAnchor(null);
    setSelectedPlayerLocation(null);
  }, []);

  const dispatchEvent = useCallback(
    (
      action: string,
      outcome: string | null,
      recipient: Player | null,
      opts?: {
        location?: [number, number];
        endLocation?: [number, number];
        extraData?: Record<string, any>;
      },
    ) => {
      if (!match || !currentTeam || !selectedPlayer) return false;
      if (isSubmitting) return false;
      if (expelledPlayerIds.has(selectedPlayer.id)) return false;
      let resolvedOutcome = outcome;
      const sendPayload = (
        nextAction: string,
        nextOutcome: string | null,
        nextRecipient: Player | null,
        extraData?: Record<string, any>,
      ) => {
        const payload = buildEventPayload(
          nextAction,
          nextOutcome,
          nextRecipient,
          currentTeam,
          selectedPlayer,
          globalClock,
          operatorPeriod,
          opts?.location,
          opts?.endLocation,
          extraData ?? opts?.extraData,
        );
        sendEvent(payload);
      };

      if (action === "Card") {
        const requested = outcome || "Yellow";
        if (requested === "Yellow") {
          const previousYellows = cardYellowCounts[selectedPlayer.id] || 0;
          resolvedOutcome = previousYellows >= 1 ? "Yellow (Second)" : "Yellow";
        } else {
          resolvedOutcome = requested;
        }

        sendPayload("Card", resolvedOutcome, null);

        if (resolvedOutcome === "Yellow (Second)") {
          sendPayload("Card", "Red", null);
        }

        return true;
      }

      const payload = buildEventPayload(
        action,
        resolvedOutcome,
        recipient,
        currentTeam,
        selectedPlayer,
        globalClock,
        operatorPeriod,
        opts?.location,
        opts?.endLocation,
        opts?.extraData,
      );
      sendEvent(payload);

      if (action === "Foul") {
        onIneffectiveTrigger?.({
          teamId: resolveOpponentTeamId(currentTeam.id) || currentTeam.id,
          playerId: selectedPlayer.id,
          actionType: "Foul",
        });
      }
      if (action === "Offside") {
        onIneffectiveTrigger?.({
          teamId: resolveOpponentTeamId(currentTeam.id) || currentTeam.id,
          playerId: selectedPlayer.id,
          actionType: "Offside",
        });
      }
      return true;
    },
    [
      match,
      currentTeam,
      selectedPlayer,
      isSubmitting,
      cardYellowCounts,
      expelledPlayerIds,
      recentEvents,
      onIneffectiveTrigger,
      resolveOpponentTeamId,
      globalClock,
      operatorPeriod,
      sendEvent,
    ],
  );

  const handlePlayerClick = useCallback(
    (player: Player, anchor?: FieldAnchor, location?: [number, number]) => {
      if (expelledPlayerIds.has(player.id)) {
        return;
      }
      setSelectedPlayer(player);
      setSelectedPlayerLocation(location ?? null);
      setFieldAnchor(anchor ?? null);
      setCurrentStep(anchor ? "selectQuickAction" : "selectAction");
    },
    [expelledPlayerIds],
  );

  const handleQuickActionSelect = useCallback(
    (action: string) => {
      setSelectedAction(action);
      setPendingOutcome(null);
      if (action === "Card") {
        setCurrentStep("selectOutcome");
        return;
      }
      if (action === "DirectShot") {
        if (selectedPlayer && currentTeam) {
          const sent = dispatchEvent(action, "OnTarget", null, {
            location: selectedPlayerLocation ?? undefined,
            extraData: {
              shot_type: "Direct",
            },
          });
          if (sent) {
            resetFlow();
          }
        }
        return;
      }
      if (action === "Goal") {
        if (selectedPlayer && currentTeam) {
          const sent = dispatchEvent(action, "Goal", null, {
            location: selectedPlayerLocation ?? undefined,
          });
          if (sent) {
            resetFlow();
          }
        }
        return;
      }
      if (action === "Offside") {
        if (selectedPlayer && currentTeam) {
          const sent = dispatchEvent(action, "Standard", null, {
            location: selectedPlayerLocation ?? undefined,
          });
          if (sent) {
            resetFlow();
          }
        }
        return;
      }
      setCurrentStep("selectDestination");
    },
    [
      currentTeam,
      dispatchEvent,
      resetFlow,
      selectedPlayer,
      selectedPlayerLocation,
    ],
  );

  const handleOpenMoreActions = useCallback(() => {
    setCurrentStep("selectAction");
  }, []);

  const handleActionClick = useCallback((action: string) => {
    setSelectedAction(action);
    setPendingOutcome(null);
    setCurrentStep("selectOutcome");
  }, []);

  const handleDestinationClick = useCallback(
    (payload: {
      destination: FieldCoordinate;
      targetPlayer?: Player | null;
    }) => {
      if (!selectedAction || !selectedPlayer || !currentTeam) {
        return { sent: false, outOfBounds: false, isGoal: false };
      }

      const destination = payload.destination;
      const targetPlayer = payload.targetPlayer ?? null;
      const selectedPlayerSide = resolvePlayerSide(selectedPlayer);
      const targetPlayerSide = resolvePlayerSide(targetPlayer);
      const isSameTeam =
        selectedPlayerSide && targetPlayerSide
          ? selectedPlayerSide === targetPlayerSide
          : false;
      const isOpponent =
        selectedPlayerSide && targetPlayerSide
          ? selectedPlayerSide !== targetPlayerSide
          : false;

      const isPassOrShot =
        selectedAction === "Pass" || selectedAction === "Shot";
      const ownGoalEdge =
        selectedPlayerSide === "home"
          ? "left"
          : selectedPlayerSide === "away"
            ? "right"
            : null;
      const isSameSideKeeperTarget =
        isPassOrShot &&
        isSameTeam &&
        Boolean(targetPlayer) &&
        isGoalkeeperPosition(targetPlayer?.position);
      const isBehindOwnGoalLine =
        isPassOrShot &&
        destination.isOutOfBounds &&
        Boolean(destination.outOfBoundsEdge) &&
        ownGoalEdge !== null &&
        destination.outOfBoundsEdge === ownGoalEdge;
      const shouldAwardCorner = isSameSideKeeperTarget || isBehindOwnGoalLine;

      const awardedCornerTeamId =
        shouldAwardCorner && selectedPlayerSide === "home"
          ? match?.away_team.id || null
          : shouldAwardCorner && selectedPlayerSide === "away"
            ? match?.home_team.id || null
            : null;
      const cornerReason = isSameSideKeeperTarget
        ? "same_side_keeper"
        : isBehindOwnGoalLine
          ? "behind_own_goal_line"
          : null;

      let outcome: string | null = null;
      const extraData: Record<string, any> = {
        destination_type: destination.isOutOfBounds
          ? "out_of_bounds"
          : targetPlayer
            ? isSameTeam
              ? "teammate"
              : "opponent"
            : "empty",
        out_of_bounds: destination.isOutOfBounds,
      };

      if (targetPlayer) {
        extraData.target_player_id = targetPlayer.id;
        extraData.target_player_name = targetPlayer.full_name;
      }

      if (shouldAwardCorner) {
        extraData.corner_awarded = true;
        if (cornerReason) {
          extraData.corner_reason = cornerReason;
        }
        if (awardedCornerTeamId) {
          extraData.corner_team_id = awardedCornerTeamId;
        }
      }

      if (selectedAction === "Pass") {
        if (isBehindOwnGoalLine) {
          outcome = "Out";
        } else if (shouldAwardCorner) {
          outcome = "Incomplete";
        } else if (destination.isOutOfBounds) {
          outcome = "Out";
        } else if (isSameTeam) {
          outcome = "Complete";
        } else {
          outcome = "Incomplete";
          if (isOpponent && targetPlayer) {
            extraData.intercepted_by_id = targetPlayer.id;
            extraData.intercepted_by_name = targetPlayer.full_name;
          }
        }
      } else if (
        selectedAction === "Shot" ||
        selectedAction === "Goal" ||
        selectedAction === "DirectShot"
      ) {
        if (shouldAwardCorner) {
          outcome = "OffTarget";
        } else if (destination.isOutOfBounds) {
          outcome = "OffTarget";
        } else if (isOpponent && targetPlayer?.position === "GK") {
          outcome = "Saved";
        } else if (isOpponent) {
          outcome = "Blocked";
        } else {
          outcome = selectedAction === "Goal" ? "Goal" : "OffTarget";
        }
      } else if (selectedAction === "Foul") {
        outcome = "Standard";
      } else if (selectedAction === "Duel") {
        outcome = isOpponent ? "Lost" : "Won";
      } else if (selectedAction === "Card") {
        outcome = null;
      }

      const recipient = shouldAwardCorner
        ? null
        : isSameTeam
          ? targetPlayer
          : null;
      const sent = dispatchEvent(selectedAction, outcome, recipient, {
        location: selectedPlayerLocation ?? undefined,
        endLocation: destination.statsbomb,
        extraData,
      });

      if (sent && shouldAwardCorner && awardedCornerTeamId) {
        sendEvent({
          match_clock: globalClock,
          period: operatorPeriod,
          team_id: awardedCornerTeamId,
          type: "SetPiece",
          location: destination.statsbomb,
          data: {
            set_piece_type: "Corner",
            outcome: "Complete",
            awarded_reason: cornerReason || "auto",
            source_action: selectedAction,
            source_team_id: currentTeam.id,
            source_player_id: selectedPlayer.id,
          },
        });
      }

      const isGoal = outcome === "Goal";

      const triggerAction: IneffectiveAction | null = isGoal
        ? "Goal"
        : shouldAwardCorner || destination.isOutOfBounds
          ? "OutOfBounds"
          : null;

      const triggerContext =
        sent && triggerAction
          ? {
              actionType: triggerAction,
              teamId:
                triggerAction === "OutOfBounds"
                  ? awardedCornerTeamId ||
                    resolveOpponentTeamId(currentTeam.id) ||
                    currentTeam.id
                  : currentTeam.id,
              playerId: selectedPlayer.id,
            }
          : null;

      if (sent) {
        resetFlow();
      }

      return {
        sent,
        outOfBounds: destination.isOutOfBounds,
        isGoal,
        triggerContext,
      };
    },
    [
      globalClock,
      match,
      currentTeam,
      dispatchEvent,
      operatorPeriod,
      resetFlow,
      resolvePlayerSide,
      sendEvent,
      selectedAction,
      selectedPlayer,
      selectedPlayerLocation,
    ],
  );

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
      if (selectedAction === "Pass" && outcome === "Out") {
        const sent = dispatchEvent(selectedAction, outcome, null, {
          location: selectedPlayerLocation ?? undefined,
          extraData: {
            destination_type: "out_of_bounds",
            out_of_bounds: true,
          },
        });
        if (sent && currentTeam && selectedPlayer) {
          onIneffectiveTrigger?.({
            note: "Out of bounds",
            teamId: resolveOpponentTeamId(currentTeam.id) || currentTeam.id,
            playerId: selectedPlayer.id,
            actionType: "OutOfBounds",
          });
          resetFlow();
        }
        return;
      }
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
      currentTeam,
      onIneffectiveTrigger,
      resetFlow,
      selectedAction,
      selectedPlayer,
      selectedPlayerLocation,
      currentTeam?.players,
      resolveOpponentTeamId,
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
    fieldAnchor,
    availableActions,
    availableOutcomes,
    handlePlayerClick,
    handleQuickActionSelect,
    handleOpenMoreActions,
    handleDestinationClick,
    handleActionClick,
    handleOutcomeClick,
    handleRecipientClick,
    resetFlow,
    currentStepRef,
  } as const;
};
