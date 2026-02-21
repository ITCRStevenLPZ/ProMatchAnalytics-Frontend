import { useKeyboardInput } from "../../../hooks/useKeyboardInput";
import { KEY_ACTION_MAP, QUICK_ACTIONS } from "../constants";
import type { Player, Match } from "../types";

interface UseCockpitKeyboardHandlersParams {
  isSubmitting: boolean;
  cockpitLocked: boolean;
  currentStep: string;
  match: Match | null;
  currentTeam: { players: Player[] } | undefined;
  selectedTeam: "home" | "away" | "both";
  eligibleRecipients: Player[];
  availableOutcomes: string[];
  isBallInPlay: boolean;
  setIsBallInPlay: (value: boolean) => void;
  setSelectedTeam: (team: "home" | "away" | "both") => void;
  setPriorityPlayerId: (playerId: string | null) => void;
  handlePlayerClick: (player: Player) => void;
  handleRecipientClick: (player: Player) => void;
  handleOutcomeClick: (outcome: string) => void;
  handleQuickActionSelect: (action: string) => void;
  handleActionClick: (action: string) => void;
  resetFlow: () => void;
  handleGlobalClockStart: () => void;
  handleGlobalClockStop: () => void;
}

interface UseCockpitKeyboardHandlersResult {
  buffer: string;
}

export const useCockpitKeyboardHandlers = ({
  isSubmitting,
  cockpitLocked,
  currentStep,
  match,
  currentTeam,
  selectedTeam,
  eligibleRecipients,
  availableOutcomes,
  isBallInPlay,
  setIsBallInPlay,
  setSelectedTeam,
  setPriorityPlayerId,
  handlePlayerClick,
  handleRecipientClick,
  handleOutcomeClick,
  handleQuickActionSelect,
  handleActionClick,
  resetFlow,
  handleGlobalClockStart,
  handleGlobalClockStop,
}: UseCockpitKeyboardHandlersParams): UseCockpitKeyboardHandlersResult => {
  const { buffer } = useKeyboardInput({
    disabled: isSubmitting || cockpitLocked,
    onNumberCommit: (number) => {
      if (cockpitLocked) return;
      if (currentStep === "selectPlayer") {
        if (!match) return;
        const homePlayer = match.home_team.players.find(
          (player) => player.jersey_number === number,
        );
        const awayPlayer = match.away_team.players.find(
          (player) => player.jersey_number === number,
        );
        const player = homePlayer || awayPlayer;
        if (player) {
          const playerTeam: "home" | "away" = homePlayer ? "home" : "away";
          if (playerTeam !== selectedTeam) {
            setSelectedTeam(playerTeam);
          }
          handlePlayerClick(player);
        }
        return;
      }

      if (!currentTeam) return;

      if (currentStep === "selectRecipient") {
        const recipient = eligibleRecipients.find(
          (player) => player.jersey_number === number,
        );
        if (recipient) {
          setPriorityPlayerId(recipient.id);
          handleRecipientClick(recipient);
        }
        return;
      }
      if (currentStep === "selectOutcome") {
        const outcome = availableOutcomes[number - 1];
        if (outcome) handleOutcomeClick(outcome);
      }
    },
    onKeyAction: (key) => {
      if (cockpitLocked) return;
      if (key === "Escape") {
        resetFlow();
        return;
      }

      const normalizedKey = key.length === 1 ? key : key.toUpperCase();
      const mappedAction =
        KEY_ACTION_MAP[normalizedKey] || KEY_ACTION_MAP[key.toUpperCase()];

      if (mappedAction === "ToggleClock" || key === " ") {
        if (isBallInPlay) {
          setIsBallInPlay(false);
          handleGlobalClockStop();
        } else {
          setIsBallInPlay(true);
          handleGlobalClockStart();
        }
        return;
      }

      if (mappedAction && currentStep === "selectQuickAction") {
        if (QUICK_ACTIONS.includes(mappedAction as any)) {
          handleQuickActionSelect(mappedAction);
        } else {
          handleActionClick(mappedAction);
        }
      }

      if (mappedAction && currentStep === "selectAction") {
        handleActionClick(mappedAction);
      }
    },
  });

  return { buffer };
};
