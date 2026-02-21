import {
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { useMatchLogStore } from "../../../store/useMatchLogStore";
import type { Player, Match } from "../types";
import type { CardSelection } from "../components/molecules/QuickCardPanel";
import {
  addMillisecondsToClock,
  getActiveYellowCountForPlayer,
} from "../lib/clockHelpers";

interface DestinationPayload {
  xPercent: number;
  yPercent: number;
  statsbomb: [number, number];
  isOutOfBounds: boolean;
  outOfBoundsEdge?: "left" | "right" | "top" | "bottom" | null;
}

interface DestinationResult {
  isGoal?: boolean;
  triggerContext?: {
    teamId: string;
    playerId?: string;
    actionType: string;
  } | null;
}

interface UseCockpitInteractionHandlersParams {
  t: (...args: any[]) => any;
  match: Match | null;
  cockpitLocked: boolean;
  selectedTeam: "home" | "away" | "both";
  setSelectedTeam: (team: "home" | "away" | "both") => void;
  pendingCardType: CardSelection | null;
  pendingCardTypeRef: MutableRefObject<CardSelection | null>;
  setPendingCardType: Dispatch<SetStateAction<CardSelection | null>>;
  resetFlow: () => void;
  operatorPeriod: number;
  globalClock: string;
  sendEvent: (event: Omit<any, "match_id" | "timestamp">) => void;
  expelledPlayerIds: Set<string>;
  isVarActive: boolean;
  currentStep: string;
  selectedPlayer: Player | null;
  currentTeam: { id: string; players: Player[] } | undefined;
  onFieldIds: { home: Set<string>; away: Set<string> };
  setSubstitutionTeam: (team: "home" | "away") => void;
  setShowSubstitutionFlow: (open: boolean) => void;
  setPriorityPlayerId: (playerId: string | null) => void;
  handlePlayerClick: (
    player: Player,
    anchor?: { xPercent: number; yPercent: number },
    location?: [number, number],
  ) => void;
  handleDestinationClick: (args: {
    destination: DestinationPayload;
    targetPlayer?: Player;
  }) => DestinationResult | undefined;
  handleActionClick: (action: string) => void;
  handleOutcomeClick: (outcome: string) => void;
  handleRecipientClick: (player: Player) => void;
  beginIneffective: (note?: string | null, context?: any) => void;
  showToast: (message: string) => void;
}

interface UseCockpitInteractionHandlersResult {
  handleCardSelection: (cardType: CardSelection) => void;
  cancelCardSelection: () => void;
  handlePlayerSelection: (player: Player) => void;
  handleFieldPlayerSelection: (
    player: Player,
    anchor: { xPercent: number; yPercent: number },
    location: [number, number],
    side: "home" | "away",
  ) => void;
  handleFieldDestination: (destination: DestinationPayload) => void;
  handleQuickSubstitution: (team: "home" | "away") => void;
  handleActionClickOverride: (action: string) => void;
  handleOutcomeSelect: (outcome: string) => void;
  handleRecipientSelect: (player: Player) => void;
  eligibleRecipients: Player[];
}

export const useCockpitInteractionHandlers = ({
  t,
  match,
  cockpitLocked,
  selectedTeam,
  setSelectedTeam,
  pendingCardType,
  pendingCardTypeRef,
  setPendingCardType,
  resetFlow,
  operatorPeriod,
  globalClock,
  sendEvent,
  expelledPlayerIds,
  isVarActive,
  currentStep,
  selectedPlayer,
  currentTeam,
  onFieldIds,
  setSubstitutionTeam,
  setShowSubstitutionFlow,
  setPriorityPlayerId,
  handlePlayerClick,
  handleDestinationClick,
  handleActionClick,
  handleOutcomeClick,
  handleRecipientClick,
  beginIneffective,
  showToast,
}: UseCockpitInteractionHandlersParams): UseCockpitInteractionHandlersResult => {
  const determinePlayerTeam = useCallback(
    (player: Player): "home" | "away" | null => {
      if (!match) return null;
      if (
        match.home_team.players.some(
          (homePlayer) => homePlayer.id === player.id,
        )
      ) {
        return "home";
      }
      if (
        match.away_team.players.some(
          (awayPlayer) => awayPlayer.id === player.id,
        )
      ) {
        return "away";
      }
      return null;
    },
    [match],
  );

  const getTeamSide = useCallback(
    (teamId?: string | null): "home" | "away" | null => {
      if (!match || !teamId) return null;
      if (teamId === match.home_team.id) return "home";
      if (teamId === match.away_team.id) return "away";
      return null;
    },
    [match],
  );

  const handleCardSelection = useCallback(
    (cardType: CardSelection) => {
      if (cockpitLocked) return;
      if (selectedTeam === "both") {
        setSelectedTeam("home");
      }
      setPendingCardType((prev) => {
        const next = prev === cardType ? null : cardType;
        pendingCardTypeRef.current = next;
        return next;
      });
      resetFlow();
    },
    [
      cockpitLocked,
      pendingCardTypeRef,
      resetFlow,
      selectedTeam,
      setPendingCardType,
      setSelectedTeam,
    ],
  );

  const cancelCardSelection = useCallback(() => {
    pendingCardTypeRef.current = null;
    setPendingCardType(null);
  }, [pendingCardTypeRef, setPendingCardType]);

  const logCardForPlayer = useCallback(
    (player: Player, cardType: CardSelection, location?: [number, number]) => {
      if (!match) return;
      const playerTeam = determinePlayerTeam(player);
      if (!playerTeam) return;
      const team = playerTeam === "home" ? match.home_team : match.away_team;
      const latestState = useMatchLogStore.getState();
      const existingCardEventsAtClock = [
        ...latestState.liveEvents,
        ...latestState.queuedEvents,
      ].filter(
        (event) =>
          event.type === "Card" &&
          event.period === operatorPeriod &&
          event.team_id === team.id &&
          event.player_id === player.id &&
          event.match_clock === globalClock,
      ).length;
      const cancelClockOffsetMs = existingCardEventsAtClock + 1;

      let resolvedCard: string = cardType;
      if (cardType === "Yellow") {
        const previousYellows = getActiveYellowCountForPlayer(
          [...latestState.liveEvents, ...latestState.queuedEvents],
          player.id,
        );
        resolvedCard = previousYellows >= 1 ? "Yellow (Second)" : "Yellow";
      }

      const buildCardPayload = (
        cardValue: string,
        matchClock = globalClock,
      ) => ({
        match_clock: matchClock,
        period: operatorPeriod,
        team_id: team.id,
        player_id: player.id,
        type: "Card" as const,
        data: {
          card_type: cardValue,
          reason: cardValue === "Cancelled" ? "VAR" : "Foul",
        },
        ...(location ? { location } : {}),
      });

      if (resolvedCard === "Yellow (Second)") {
        const secondYellowClock = addMillisecondsToClock(globalClock, 1);
        const redClock = addMillisecondsToClock(globalClock, 2);
        sendEvent(buildCardPayload(resolvedCard, secondYellowClock));
        sendEvent(buildCardPayload("Red", redClock));
      } else if (resolvedCard === "Cancelled") {
        const cancelledClock = addMillisecondsToClock(
          globalClock,
          cancelClockOffsetMs,
        );
        sendEvent(buildCardPayload(resolvedCard, cancelledClock));
      } else {
        sendEvent(buildCardPayload(resolvedCard));
      }

      setPendingCardType(null);
      pendingCardTypeRef.current = null;
      resetFlow();
    },
    [
      determinePlayerTeam,
      globalClock,
      match,
      operatorPeriod,
      pendingCardTypeRef,
      resetFlow,
      sendEvent,
      setPendingCardType,
    ],
  );

  const handlePlayerSelection = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      const activePendingCard = pendingCardTypeRef.current ?? pendingCardType;
      if (activePendingCard) {
        logCardForPlayer(player, activePendingCard);
        return;
      }
      if (expelledPlayerIds.has(player.id)) {
        showToast(
          t("playerExpelled", "Player is expelled and cannot log actions."),
        );
        return;
      }
      const playerTeam = determinePlayerTeam(player);
      if (!playerTeam) return;
      if (playerTeam !== selectedTeam) {
        setSelectedTeam(playerTeam);
      }
      handlePlayerClick(player);
    },
    [
      cockpitLocked,
      pendingCardType,
      pendingCardTypeRef,
      logCardForPlayer,
      expelledPlayerIds,
      showToast,
      t,
      determinePlayerTeam,
      selectedTeam,
      setSelectedTeam,
      handlePlayerClick,
    ],
  );

  const handleFieldPlayerSelection = useCallback(
    (
      player: Player,
      anchor: { xPercent: number; yPercent: number },
      location: [number, number],
      side: "home" | "away",
    ) => {
      if (cockpitLocked) return;

      if (isVarActive) {
        showToast(
          t(
            "varBlocksFieldActions",
            "Field actions are blocked while VAR is active.",
          ),
        );
        return;
      }

      const activePendingCard = pendingCardTypeRef.current ?? pendingCardType;
      if (
        expelledPlayerIds.has(player.id) &&
        activePendingCard !== "Cancelled"
      ) {
        showToast(
          t("playerExpelled", "Player is expelled and cannot log actions."),
        );
        return;
      }

      if (currentStep === "selectDestination") {
        const result = handleDestinationClick({
          destination: {
            xPercent: anchor.xPercent,
            yPercent: anchor.yPercent,
            statsbomb: location,
            isOutOfBounds: false,
            outOfBoundsEdge: null,
          },
          targetPlayer: player,
        });
        if (result?.triggerContext) {
          beginIneffective(
            result?.isGoal
              ? t("ineffectiveNoteGoal", "Goal")
              : t("ineffectiveNoteOut", "Out of bounds"),
            result?.triggerContext
              ? {
                  teamId: result.triggerContext.teamId,
                  playerId: result.triggerContext.playerId,
                  actionType: result.triggerContext.actionType,
                }
              : null,
          );
        }
        return;
      }

      if (activePendingCard) {
        logCardForPlayer(player, activePendingCard, location);
        return;
      }

      if (side !== selectedTeam) {
        setSelectedTeam(side);
      }
      handlePlayerClick(player, anchor, location);
    },
    [
      beginIneffective,
      cockpitLocked,
      currentStep,
      expelledPlayerIds,
      handleDestinationClick,
      handlePlayerClick,
      isVarActive,
      logCardForPlayer,
      pendingCardType,
      pendingCardTypeRef,
      selectedTeam,
      setSelectedTeam,
      showToast,
      t,
    ],
  );

  const handleFieldDestination = useCallback(
    (destination: DestinationPayload) => {
      if (cockpitLocked || currentStep !== "selectDestination") return;
      if (isVarActive) {
        showToast(
          t(
            "varBlocksFieldActions",
            "Field actions are blocked while VAR is active.",
          ),
        );
        return;
      }
      const result = handleDestinationClick({ destination });
      if (result?.triggerContext) {
        beginIneffective(
          result?.isGoal
            ? t("ineffectiveNoteGoal", "Goal")
            : t("ineffectiveNoteOut", "Out of bounds"),
          result?.triggerContext
            ? {
                teamId: result.triggerContext.teamId,
                playerId: result.triggerContext.playerId,
                actionType: result.triggerContext.actionType,
              }
            : null,
        );
      }
    },
    [
      beginIneffective,
      cockpitLocked,
      currentStep,
      handleDestinationClick,
      isVarActive,
      showToast,
      t,
    ],
  );

  const handleQuickSubstitution = useCallback(
    (team: "home" | "away") => {
      if (cockpitLocked) return;
      setSubstitutionTeam(team);
      setShowSubstitutionFlow(true);
      resetFlow();
    },
    [cockpitLocked, resetFlow, setShowSubstitutionFlow, setSubstitutionTeam],
  );

  const handleActionClickOverride = useCallback(
    (action: string) => {
      if (cockpitLocked) return;
      if (action === "Substitution") {
        const teamForSub = selectedPlayer
          ? determinePlayerTeam(selectedPlayer) || "home"
          : selectedTeam === "both"
            ? "home"
            : selectedTeam;
        setSubstitutionTeam(teamForSub);
        setShowSubstitutionFlow(true);
        resetFlow();
      } else {
        handleActionClick(action);
      }
    },
    [
      cockpitLocked,
      determinePlayerTeam,
      handleActionClick,
      resetFlow,
      selectedPlayer,
      selectedTeam,
      setShowSubstitutionFlow,
      setSubstitutionTeam,
    ],
  );

  const handleOutcomeSelect = useCallback(
    (outcome: string) => {
      if (cockpitLocked) return;
      handleOutcomeClick(outcome);
    },
    [cockpitLocked, handleOutcomeClick],
  );

  const handleRecipientSelect = useCallback(
    (player: Player) => {
      if (cockpitLocked) return;
      setPriorityPlayerId(player.id);
      handleRecipientClick(player);
    },
    [cockpitLocked, handleRecipientClick, setPriorityPlayerId],
  );

  const eligibleRecipients = useMemo(() => {
    if (!currentTeam || !match) return [] as Player[];
    const side = getTeamSide(currentTeam.id);
    if (!side) return [] as Player[];
    const onField = onFieldIds[side];
    return currentTeam.players.filter(
      (player) => onField.has(player.id) && player.id !== selectedPlayer?.id,
    );
  }, [currentTeam, getTeamSide, match, onFieldIds, selectedPlayer]);

  return {
    handleCardSelection,
    cancelCardSelection,
    handlePlayerSelection,
    handleFieldPlayerSelection,
    handleFieldDestination,
    handleQuickSubstitution,
    handleActionClickOverride,
    handleOutcomeSelect,
    handleRecipientSelect,
    eligibleRecipients,
  };
};
