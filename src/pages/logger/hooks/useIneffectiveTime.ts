import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  formatSecondsAsClockWithMs,
  parseClockToSeconds,
} from "../lib/clockHelpers";
import type { IneffectiveAction, Match } from "../types";
import type { MatchEvent } from "../../../store/useMatchLogStore";

type TeamChoice = "home" | "away" | "both";

type IneffectiveContext = {
  teamId?: string | null;
  playerId?: string | null;
  actionType?: IneffectiveAction | null;
};

interface UseIneffectiveTimeParams {
  match: Match | null;
  selectedTeam: TeamChoice;
  globalClock: string;
  operatorPeriod: number;
  clockMode: "EFFECTIVE" | "INEFFECTIVE";
  handleModeSwitch: (mode: "EFFECTIVE" | "INEFFECTIVE") => void;
  sendEvent: (event: Omit<MatchEvent, "match_id" | "timestamp">) => void;
  setIsBallInPlay: (value: boolean) => void;
  setMatch: Dispatch<SetStateAction<Match | null>>;
}

export interface UseIneffectiveTimeResult {
  ineffectiveNoteOpen: boolean;
  setIneffectiveNoteOpen: Dispatch<SetStateAction<boolean>>;
  ineffectiveNoteText: string;
  setIneffectiveNoteText: Dispatch<SetStateAction<string>>;
  ineffectiveActionType: IneffectiveAction;
  setIneffectiveActionType: Dispatch<SetStateAction<IneffectiveAction>>;
  ineffectiveTeamSelection: "home" | "away";
  setIneffectiveTeamSelection: Dispatch<SetStateAction<"home" | "away">>;
  ineffectiveActionDropdownOpen: boolean;
  setIneffectiveActionDropdownOpen: Dispatch<SetStateAction<boolean>>;
  ineffectiveTeamDropdownOpen: boolean;
  setIneffectiveTeamDropdownOpen: Dispatch<SetStateAction<boolean>>;
  hasActiveIneffective: boolean;
  beginIneffective: (
    note?: string | null,
    context?: IneffectiveContext | null,
  ) => void;
  endIneffectiveIfNeeded: (nextMode: "EFFECTIVE") => void;
  confirmIneffectiveNote: () => void;
  cancelIneffectiveNote: () => void;
  switchIneffectiveTeam: (
    newTeam: "home" | "away",
    newAction?: IneffectiveAction,
  ) => void;
  logNeutralTimerEvent: (
    stoppageType: "VARStart" | "VARStop" | "TimeoutStart" | "TimeoutStop",
  ) => void;
}

export const useIneffectiveTime = ({
  match,
  selectedTeam,
  globalClock,
  operatorPeriod,
  clockMode,
  handleModeSwitch,
  sendEvent,
  setIsBallInPlay,
  setMatch,
}: UseIneffectiveTimeParams): UseIneffectiveTimeResult => {
  const [ineffectiveNoteOpen, setIneffectiveNoteOpen] = useState(false);
  const [ineffectiveNoteText, setIneffectiveNoteText] = useState("");
  const [ineffectiveActionType, setIneffectiveActionType] =
    useState<IneffectiveAction>("Other");
  const [ineffectiveTeamSelection, setIneffectiveTeamSelection] = useState<
    "home" | "away"
  >("home");
  const [ineffectiveActionDropdownOpen, setIneffectiveActionDropdownOpen] =
    useState(false);
  const [ineffectiveTeamDropdownOpen, setIneffectiveTeamDropdownOpen] =
    useState(false);
  const [hasActiveIneffective, setHasActiveIneffective] = useState(false);
  const [pendingIneffectiveContext, setPendingIneffectiveContext] =
    useState<IneffectiveContext | null>(null);
  const activeIneffectiveContextRef = useRef<
    (IneffectiveContext & { startedAtMs?: number }) | null
  >(null);
  const lastStoppageClockRef = useRef<string | null>(null);

  const getStoppageTeamId = useCallback(() => {
    if (!match) return null;
    if (selectedTeam === "away") return match.away_team.id;
    return match.home_team.id;
  }, [match, selectedTeam]);

  const resolveManualTeamSelection = useCallback(
    (teamId?: string | null): "home" | "away" => {
      if (teamId && teamId === match?.away_team.id) return "away";
      if (teamId && teamId === match?.home_team.id) return "home";
      return selectedTeam === "away" ? "away" : "home";
    },
    [match, selectedTeam],
  );

  const getManualTeamId = useCallback(
    (teamSelection: "home" | "away") => {
      if (teamSelection === "away") return match?.away_team.id ?? null;
      return match?.home_team.id ?? null;
    },
    [match],
  );

  const logClockStoppage = useCallback(
    (
      stoppageType: "ClockStop" | "ClockStart",
      notes?: string | null,
      context?: IneffectiveContext | null,
    ) => {
      if (!match) return;
      const isNeutralAction =
        context?.actionType === "VAR" || context?.actionType === "Referee";
      const resolvedTeamId = isNeutralAction
        ? "NEUTRAL"
        : context?.teamId || getStoppageTeamId();
      if (!resolvedTeamId) return;

      const baseClock = globalClock || "00:00.000";
      const adjustedClock =
        stoppageType === "ClockStart" &&
        lastStoppageClockRef.current === baseClock
          ? formatSecondsAsClockWithMs(parseClockToSeconds(baseClock) + 0.001)
          : baseClock;
      lastStoppageClockRef.current = adjustedClock;

      sendEvent({
        match_clock: adjustedClock,
        period: operatorPeriod,
        team_id: resolvedTeamId,
        type: "GameStoppage",
        data: {
          stoppage_type: stoppageType,
          reason: context?.actionType || "Other",
          trigger_action: context?.actionType || null,
          trigger_team_id: isNeutralAction ? null : context?.teamId || null,
          trigger_player_id: context?.playerId || null,
        },
        ...(notes ? { notes } : {}),
      });
    },
    [getStoppageTeamId, globalClock, match, operatorPeriod, sendEvent],
  );

  const logNeutralTimerEvent = useCallback(
    (stoppageType: "VARStart" | "VARStop" | "TimeoutStart" | "TimeoutStop") => {
      if (!match) return;
      const baseClock = globalClock || "00:00.000";
      const adjustedClock =
        lastStoppageClockRef.current === baseClock
          ? formatSecondsAsClockWithMs(parseClockToSeconds(baseClock) + 0.001)
          : baseClock;
      lastStoppageClockRef.current = adjustedClock;
      sendEvent({
        match_clock: adjustedClock,
        period: operatorPeriod,
        team_id: "NEUTRAL",
        type: "GameStoppage",
        data: {
          stoppage_type: stoppageType,
          reason:
            stoppageType === "TimeoutStart" || stoppageType === "TimeoutStop"
              ? "Timeout"
              : "VAR",
          trigger_action:
            stoppageType === "TimeoutStart" || stoppageType === "TimeoutStop"
              ? "Timeout"
              : "VAR",
          trigger_team_id: null,
          trigger_player_id: null,
        },
      });
    },
    [globalClock, match, operatorPeriod, sendEvent],
  );

  const optimisticModeChange = useCallback(
    (mode: "EFFECTIVE" | "INEFFECTIVE") => {
      const now = new Date().toISOString();
      setMatch((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          clock_mode: mode,
          last_mode_change_timestamp: now,
          current_period_start_timestamp:
            prev.current_period_start_timestamp ?? now,
        };
      });
    },
    [setMatch],
  );

  const beginIneffective = useCallback(
    (note?: string | null, context?: IneffectiveContext | null) => {
      if (clockMode === "INEFFECTIVE") return;
      if (activeIneffectiveContextRef.current) return;
      const trimmed = (note || "").trim();
      const fallbackTeamId =
        selectedTeam === "away"
          ? match?.away_team.id ?? null
          : selectedTeam === "home"
            ? match?.home_team.id ?? null
            : null;
      const explicitTeamId = context?.teamId ?? null;
      const resolvedContext = {
        teamId: explicitTeamId ?? fallbackTeamId,
        playerId: context?.playerId ?? null,
        actionType: context?.actionType ?? ineffectiveActionType,
      };
      if (!trimmed) {
        setIneffectiveTeamSelection(
          resolveManualTeamSelection(resolvedContext.teamId),
        );
        if (resolvedContext.actionType) {
          setIneffectiveActionType(resolvedContext.actionType);
        }
        setIneffectiveNoteText("");
        setPendingIneffectiveContext({
          teamId: explicitTeamId,
          playerId: resolvedContext.playerId,
          actionType: context?.actionType ?? null,
        });
        setIneffectiveNoteOpen(true);
        return;
      }
      logClockStoppage("ClockStop", trimmed, resolvedContext);
      activeIneffectiveContextRef.current = {
        ...resolvedContext,
        startedAtMs: Date.now(),
      };
      setHasActiveIneffective(true);
      optimisticModeChange("INEFFECTIVE");
      handleModeSwitch("INEFFECTIVE");
      setIsBallInPlay(false);
    },
    [
      clockMode,
      handleModeSwitch,
      ineffectiveActionType,
      logClockStoppage,
      match,
      optimisticModeChange,
      resolveManualTeamSelection,
      selectedTeam,
      setIsBallInPlay,
    ],
  );

  const endIneffectiveIfNeeded = useCallback(
    (nextMode: "EFFECTIVE") => {
      if (clockMode === "INEFFECTIVE" || activeIneffectiveContextRef.current) {
        logClockStoppage(
          "ClockStart",
          null,
          activeIneffectiveContextRef.current,
        );
        activeIneffectiveContextRef.current = null;
        setHasActiveIneffective(false);
      }
      optimisticModeChange(nextMode);
      handleModeSwitch(nextMode);
    },
    [clockMode, handleModeSwitch, logClockStoppage, optimisticModeChange],
  );

  const confirmIneffectiveNote = useCallback(() => {
    const trimmed = ineffectiveNoteText.trim();
    const fallbackTeamId = getManualTeamId(ineffectiveTeamSelection);
    const resolvedContext = {
      teamId: pendingIneffectiveContext?.teamId ?? fallbackTeamId,
      playerId: pendingIneffectiveContext?.playerId ?? null,
      actionType:
        pendingIneffectiveContext?.actionType ?? ineffectiveActionType,
    };
    logClockStoppage("ClockStop", trimmed || null, resolvedContext);
    activeIneffectiveContextRef.current = {
      ...resolvedContext,
      startedAtMs: Date.now(),
    };
    setHasActiveIneffective(true);
    optimisticModeChange("INEFFECTIVE");
    handleModeSwitch("INEFFECTIVE");
    setIsBallInPlay(false);
    setIneffectiveNoteOpen(false);
    setIneffectiveNoteText("");
    setPendingIneffectiveContext(null);
    setIneffectiveActionDropdownOpen(false);
    setIneffectiveTeamDropdownOpen(false);
  }, [
    getManualTeamId,
    handleModeSwitch,
    ineffectiveActionType,
    ineffectiveNoteText,
    ineffectiveTeamSelection,
    logClockStoppage,
    optimisticModeChange,
    pendingIneffectiveContext,
    setIsBallInPlay,
  ]);

  const cancelIneffectiveNote = useCallback(() => {
    setIneffectiveNoteOpen(false);
    setIneffectiveNoteText("");
    setPendingIneffectiveContext(null);
    setIneffectiveActionDropdownOpen(false);
    setIneffectiveTeamDropdownOpen(false);
  }, []);

  /**
   * Switch the team attribution during an active ineffective period.
   * This ends the current stoppage for the old team and starts a new one
   * for the target team, keeping the clock in INEFFECTIVE mode.
   */
  const switchIneffectiveTeam = useCallback(
    (newTeam: "home" | "away", newAction?: IneffectiveAction) => {
      if (!match) return;
      if (clockMode !== "INEFFECTIVE" && !activeIneffectiveContextRef.current)
        return;

      // End current ineffective for the old team
      logClockStoppage("ClockStart", null, activeIneffectiveContextRef.current);

      // Start new ineffective for the target team
      const newTeamId = getManualTeamId(newTeam);
      const resolvedAction =
        newAction ?? activeIneffectiveContextRef.current?.actionType ?? "Other";
      const newContext: IneffectiveContext & { startedAtMs?: number } = {
        teamId: newTeamId,
        playerId: null,
        actionType: resolvedAction,
        startedAtMs: Date.now(),
      };

      logClockStoppage("ClockStop", null, newContext);
      activeIneffectiveContextRef.current = newContext;
      setIneffectiveTeamSelection(newTeam);
      if (newAction) setIneffectiveActionType(newAction);
    },
    [clockMode, getManualTeamId, logClockStoppage, match],
  );

  return {
    ineffectiveNoteOpen,
    setIneffectiveNoteOpen,
    ineffectiveNoteText,
    setIneffectiveNoteText,
    ineffectiveActionType,
    setIneffectiveActionType,
    ineffectiveTeamSelection,
    setIneffectiveTeamSelection,
    ineffectiveActionDropdownOpen,
    setIneffectiveActionDropdownOpen,
    ineffectiveTeamDropdownOpen,
    setIneffectiveTeamDropdownOpen,
    hasActiveIneffective,
    beginIneffective,
    endIneffectiveIfNeeded,
    confirmIneffectiveNote,
    cancelIneffectiveNote,
    switchIneffectiveTeam,
    logNeutralTimerEvent,
  };
};
