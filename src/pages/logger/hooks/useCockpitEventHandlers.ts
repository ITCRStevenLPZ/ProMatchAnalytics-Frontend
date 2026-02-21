import { useCallback, useMemo, useState } from "react";
import type { MatchEvent } from "../../../store/useMatchLogStore";
import { deleteMatchEvent, updateMatchEvent } from "../../../lib/loggerApi";

interface UseCockpitEventHandlersParams {
  t: (...args: any[]) => any;
  isAdmin: boolean;
  isConnected: boolean;
  cockpitLocked: boolean;
  lockReason?: string;
  pendingAcks: Record<string, unknown>;
  undoStack: string[];
  liveEvents: MatchEvent[];
  queuedEvents: MatchEvent[];
  removeLiveEventByClientId: (clientId: string) => void;
  removeQueuedEvent: (event: MatchEvent) => void;
  removeUndoCandidate: (clientId: string) => void;
  undoEvent: (event: MatchEvent) => void;
  removeQueuedEventByClientId: (clientId: string) => void;
  rejectPendingAck: (clientId: string) => void;
  removeLiveEventById: (eventId: string) => void;
  hydrateEvents: () => Promise<void>;
  updateEventNotes: (event: MatchEvent, notes: string | null) => void;
  upsertLiveEvent: (event: MatchEvent) => void;
  showToast: (message: string) => void;
}

interface UseCockpitEventHandlersResult {
  undoError: string | null;
  undoDisabled: boolean;
  handleUndoLastEvent: () => Promise<void>;
  handleDeletePendingEvent: (clientId: string) => void;
  handleDeleteLoggedEvent: (event: MatchEvent) => Promise<void>;
  handleUpdateEventNotes: (
    event: MatchEvent,
    notes: string | null,
  ) => Promise<void>;
}

export const useCockpitEventHandlers = ({
  t,
  isAdmin,
  isConnected,
  cockpitLocked,
  lockReason,
  pendingAcks,
  undoStack,
  liveEvents,
  queuedEvents,
  removeLiveEventByClientId,
  removeQueuedEvent,
  removeUndoCandidate,
  undoEvent,
  removeQueuedEventByClientId,
  rejectPendingAck,
  removeLiveEventById,
  hydrateEvents,
  updateEventNotes,
  upsertLiveEvent,
  showToast,
}: UseCockpitEventHandlersParams): UseCockpitEventHandlersResult => {
  const [undoError, setUndoError] = useState<string | null>(null);

  const lastUndoClientId = undoStack.length
    ? undoStack[undoStack.length - 1]
    : null;

  const lastUndoEvent = useMemo(() => {
    if (!lastUndoClientId) return null;
    return (
      liveEvents.find((event) => event.client_id === lastUndoClientId) ||
      queuedEvents.find((event) => event.client_id === lastUndoClientId) ||
      null
    );
  }, [lastUndoClientId, liveEvents, queuedEvents]);

  const undoRequiresConnection = Boolean(
    lastUndoClientId && (pendingAcks[lastUndoClientId] || lastUndoEvent?._id),
  );

  const undoDisabled =
    !lastUndoEvent || cockpitLocked || (undoRequiresConnection && !isConnected);

  const handleDeletePendingEvent = useCallback(
    (clientId: string) => {
      if (!clientId) return;
      removeLiveEventByClientId(clientId);
      removeQueuedEventByClientId(clientId);
      rejectPendingAck(clientId);
    },
    [removeLiveEventByClientId, removeQueuedEventByClientId, rejectPendingAck],
  );

  const handleDeleteLoggedEvent = useCallback(
    async (event: MatchEvent) => {
      if (!event._id || !isAdmin) return;
      try {
        await deleteMatchEvent(event._id);
        removeLiveEventById(event._id);
        if (event.client_id) {
          removeQueuedEventByClientId(event.client_id);
        }
        await hydrateEvents();
      } catch (error) {
        console.error("Failed to delete event", error);
        showToast(t("deleteEventFailed", "Unable to delete event right now."));
      }
    },
    [
      hydrateEvents,
      isAdmin,
      removeLiveEventById,
      removeQueuedEventByClientId,
      showToast,
      t,
    ],
  );

  const handleUpdateEventNotes = useCallback(
    async (event: MatchEvent, notes: string | null) => {
      updateEventNotes(event, notes);
      if (!event._id) return;
      try {
        const updated = await updateMatchEvent(event._id, { notes });
        upsertLiveEvent(updated);
      } catch (error) {
        console.error("Failed to update event notes", error);
        showToast(t("notesUpdateFailed", "Unable to update notes right now."));
      }
    },
    [showToast, t, updateEventNotes, upsertLiveEvent],
  );

  const handleUndoLastEvent = useCallback(async () => {
    if (cockpitLocked) {
      setUndoError(
        lockReason || t("undoLocked", "Cannot undo while cockpit is locked."),
      );
      return;
    }
    if (!lastUndoClientId || !lastUndoEvent) {
      setUndoError(t("undoUnavailable", "No event available to undo."));
      return;
    }

    setUndoError(null);

    const previousUndoClientId =
      undoStack.length > 1 ? undoStack[undoStack.length - 2] : null;
    const previousUndoEvent = previousUndoClientId
      ? liveEvents.find((event) => event.client_id === previousUndoClientId) ||
        queuedEvents.find((event) => event.client_id === previousUndoClientId)
      : null;

    const lastCardType = String(
      lastUndoEvent.data?.card_type || "",
    ).toLowerCase();
    const previousCardType = String(
      previousUndoEvent?.data?.card_type || "",
    ).toLowerCase();
    const shouldCascadeUndoSecondYellow =
      Boolean(previousUndoClientId) &&
      Boolean(previousUndoEvent) &&
      lastUndoEvent.type === "Card" &&
      previousUndoEvent?.type === "Card" &&
      lastCardType.includes("red") &&
      previousCardType.includes("yellow (second)") &&
      lastUndoEvent.player_id === previousUndoEvent.player_id &&
      lastUndoEvent.team_id === previousUndoEvent.team_id &&
      lastUndoEvent.period === previousUndoEvent.period;

    const eventsToUndo =
      shouldCascadeUndoSecondYellow && previousUndoEvent
        ? [lastUndoEvent, previousUndoEvent]
        : [lastUndoEvent];

    const removeLocally = (targetEvent: MatchEvent, targetClientId: string) => {
      removeLiveEventByClientId(targetClientId);
      removeQueuedEvent(targetEvent);
      removeUndoCandidate(targetClientId);
    };

    const hasOfflineOnlyTargets = eventsToUndo.every((event) => {
      if (!event.client_id) return false;
      return !pendingAcks[event.client_id] && !event._id;
    });

    if (hasOfflineOnlyTargets || !undoRequiresConnection) {
      eventsToUndo.forEach((event) => {
        if (!event.client_id) return;
        removeLocally(event, event.client_id);
      });
      return;
    }

    try {
      eventsToUndo.forEach((event) => {
        undoEvent(event);
      });
    } catch (error) {
      console.error("Undo failed", error);
      setUndoError(
        t(
          "undoFailed",
          "Unable to undo the last event. Try again when the connection is back.",
        ),
      );
    }
  }, [
    cockpitLocked,
    lastUndoClientId,
    lastUndoEvent,
    liveEvents,
    lockReason,
    pendingAcks,
    queuedEvents,
    removeLiveEventByClientId,
    removeQueuedEvent,
    removeUndoCandidate,
    t,
    undoEvent,
    undoRequiresConnection,
    undoStack,
  ]);

  return {
    undoError,
    undoDisabled,
    handleUndoLastEvent,
    handleDeletePendingEvent,
    handleDeleteLoggedEvent,
    handleUpdateEventNotes,
  };
};
