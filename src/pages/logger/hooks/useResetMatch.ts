import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { resetMatch } from "../../../lib/loggerApi";
import { normalizeMatchPayload } from "../utils";
import type { Match } from "../types";

interface UseResetMatchParams {
  matchId?: string;
  isAdmin: boolean;
  match: Match | null;
  queuedCount: number;
  pendingAckCount: number;
  t: (...args: any[]) => any;
  setMatch: Dispatch<SetStateAction<Match | null>>;
  hydrateEvents: () => Promise<void>;
  resetVarState: () => void;
  resetOperatorControls: (params: { clock: string; period: number }) => void;
  setLiveEvents: (events: any[]) => void;
  clearQueuedEvents: () => void;
  clearPendingAcks: () => void;
  clearUndoStack: () => void;
  resetDuplicateStats: () => void;
  clearDuplicateHighlight: () => void;
}

export interface UseResetMatchResult {
  showResetModal: boolean;
  setShowResetModal: Dispatch<SetStateAction<boolean>>;
  resetConfirmText: string;
  setResetConfirmText: Dispatch<SetStateAction<string>>;
  isFulltime: boolean;
  resetBlocked: boolean;
  resetDisabledReason?: string;
  resetTooltip?: string;
  openResetModal: () => void;
  confirmGlobalReset: () => Promise<void>;
  handleGlobalClockReset: () => Promise<void>;
}

export const useResetMatch = ({
  matchId,
  isAdmin,
  match,
  queuedCount,
  pendingAckCount,
  t,
  setMatch,
  hydrateEvents,
  resetVarState,
  resetOperatorControls,
  setLiveEvents,
  clearQueuedEvents,
  clearPendingAcks,
  clearUndoStack,
  resetDuplicateStats,
  clearDuplicateHighlight,
}: UseResetMatchParams): UseResetMatchResult => {
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  const isFulltime =
    match?.status === "Completed" || match?.status === "Fulltime";

  const resetBlocked = queuedCount > 0 || pendingAckCount > 0;
  const resetBlockReason =
    queuedCount > 0
      ? t(
          "resetBlockedQueued",
          "{{count}} event(s) queued — clear them before reset.",
          { count: queuedCount },
        )
      : pendingAckCount > 0
        ? t(
            "resetBlockedPending",
            "{{count}} event(s) awaiting server confirmation.",
            { count: pendingAckCount },
          )
        : undefined;

  const resetDisabledReason = resetBlockReason;

  const resetTooltip = useMemo(
    () =>
      resetDisabledReason ||
      (isFulltime
        ? t(
            "resetAfterFulltimeTooltip",
            "Match is completed; reset will wipe data and restart.",
          )
        : undefined),
    [isFulltime, resetDisabledReason, t],
  );

  const handleGlobalClockReset = useCallback(async () => {
    if (!matchId || !isAdmin) return;

    try {
      const refreshed = await resetMatch(matchId);
      setMatch(normalizeMatchPayload(refreshed as any));
      resetOperatorControls({ clock: "00:00.000", period: 1 });
      resetVarState();
      await hydrateEvents();
      setLiveEvents([]);
      clearQueuedEvents();
      clearPendingAcks();
      clearUndoStack();
      resetDuplicateStats();
      clearDuplicateHighlight();
      console.log("✅ Reset complete: backend match cleared and timers reset");
    } catch (error) {
      console.error("Failed to reset match:", error);
    }
  }, [
    clearDuplicateHighlight,
    clearPendingAcks,
    clearQueuedEvents,
    clearUndoStack,
    hydrateEvents,
    isAdmin,
    matchId,
    resetDuplicateStats,
    resetOperatorControls,
    resetVarState,
    setLiveEvents,
    setMatch,
  ]);

  const openResetModal = useCallback(() => {
    if (!isAdmin) return;
    setShowResetModal(true);
    setResetConfirmText("");
  }, [isAdmin]);

  const confirmGlobalReset = useCallback(async () => {
    if (resetBlocked || resetConfirmText !== "RESET") return;
    await handleGlobalClockReset();
    setShowResetModal(false);
    setResetConfirmText("");
  }, [handleGlobalClockReset, resetBlocked, resetConfirmText]);

  return {
    showResetModal,
    setShowResetModal,
    resetConfirmText,
    setResetConfirmText,
    isFulltime,
    resetBlocked,
    resetDisabledReason,
    resetTooltip,
    openResetModal,
    confirmGlobalReset,
    handleGlobalClockReset,
  };
};
