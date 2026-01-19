/**
 * WebSocket Hook for Real-Time Match Logging
 * Based on Section 4.3: Data Synchronization Flow (Offline-First Strategy)
 *
 * Implements:
 * - WebSocket connection lifecycle (onopen, onclose, onmessage)
 * - syncQueue: Syncs queued events on reconnection
 * - sendEvent: Sends event or queues if offline
 * - Automatic reconnection handling
 */
import { useEffect, useRef, useCallback } from "react";
import {
  useMatchLogStore,
  MatchEvent,
  PendingAckEntry,
} from "../store/useMatchLogStore";
import { auth } from "../lib/firebase";
import { trackTelemetry } from "../lib/telemetry";

const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === "true";

const generateClientId = (): string => {
  const globalCrypto = globalThis.crypto as Crypto | undefined;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

interface UseMatchSocketProps {
  matchId: string;
  enabled?: boolean;
}

interface UseMatchSocketReturn {
  sendEvent: (event: Omit<MatchEvent, "match_id" | "timestamp">) => void;
  undoEvent: (event: MatchEvent) => void;
  isConnected: boolean;
}

interface DuplicateMetadata {
  event_id?: string | null;
  match_id?: string;
  match_clock?: string;
  period?: number;
  team_id?: string;
}

interface AckResultPayload {
  status?: string;
  event_id?: string;
  duplicate?: DuplicateMetadata;
  client_id?: string;
  message?: string;
}

interface SocketTestHarness {
  forceDisconnect: () => void;
  reconnect: () => void;
}

declare global {
  interface Window {
    __PROMATCH_SOCKET_TEST__?: SocketTestHarness;
  }
}

/**
 * Custom hook for WebSocket connection to match logging endpoint
 * Implements Section 4.3: Data Synchronization Flow
 */
export const useMatchSocket = ({
  matchId,
  enabled = true,
}: UseMatchSocketProps): UseMatchSocketReturn => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pendingAckOrderRef = useRef<string[]>([]);
  const suppressReconnectRef = useRef(false);

  const {
    isConnected,
    setConnected,
    queuedEventsByMatch,
    pendingAcks,
    addLiveEvent,
    upsertLiveEvent,
    removeLiveEventByTimestamp,
    removeLiveEventByClientId,
    removeLiveEventById,
    updateLiveEventId,
    addQueuedEvent,
    removeQueuedEvent,
    removeQueuedEventByClientId,
    upsertPendingAck,
    resolvePendingAck,
    rejectPendingAck,
    setDuplicateHighlight,
    incrementDuplicateStats,
    setQueuedEventClientId,
    requestTimelineRefresh,
    pushUndoCandidate,
    removeUndoCandidate,
  } = useMatchLogStore();

  const queuedEventsRef =
    useRef<Record<string, MatchEvent[]>>(queuedEventsByMatch);
  const pendingAcksRef = useRef<typeof pendingAcks>(pendingAcks);
  const undoInFlightRef = useRef<Set<string>>(new Set());
  const undoCompletedRef = useRef<Set<string>>(new Set());

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (IS_E2E_TEST_MODE && typeof window !== "undefined") {
      const token = (window as any).__PROMATCH_E2E_TOKEN__ ?? "e2e-test-token";
      return token;
    }

    const user = auth.currentUser;
    if (!user) {
      console.error("No authenticated user");
      return null;
    }
    try {
      return await user.getIdToken();
    } catch (error) {
      console.error("Failed to get auth token", error);
      return null;
    }
  }, []);

  const ensureClientId = useCallback(
    (event: MatchEvent, source: "live" | "queue") => {
      if (event.client_id) {
        return event.client_id;
      }
      const generated = generateClientId();
      if (source === "queue") {
        setQueuedEventClientId(event.match_id, event.timestamp, generated);
      }
      event.client_id = generated;
      return generated;
    },
    [setQueuedEventClientId],
  );

  const registerPendingAck = useCallback(
    (event: MatchEvent, source: "live" | "queue") => {
      const clientId = ensureClientId(event, source);
      if (!pendingAckOrderRef.current.includes(clientId)) {
        pendingAckOrderRef.current.push(clientId);
      }
      upsertPendingAck(clientId, { event, source });
    },
    [ensureClientId, upsertPendingAck],
  );

  const handleUndoAck = useCallback(
    (ackResult: AckResultPayload) => {
      const clientId = ackResult?.client_id ?? null;
      if (clientId) {
        const idx = pendingAckOrderRef.current.indexOf(clientId);
        if (idx !== -1) {
          pendingAckOrderRef.current.splice(idx, 1);
        }
      }

      const entry = clientId ? resolvePendingAck(clientId) : undefined;
      undoInFlightRef.current.delete(clientId ?? "");
      undoCompletedRef.current.add(clientId ?? "");

      if (ackResult?.status === "undo_success") {
        if (ackResult?.event_id) {
          removeLiveEventById(ackResult.event_id);
        }
        if (clientId) {
          removeLiveEventByClientId(clientId);
          removeQueuedEventByClientId(clientId);
          removeUndoCandidate(clientId);
        }
      } else if (ackResult?.status === "undo_not_found") {
        console.warn("Undo target not found for client id", clientId);
      } else {
        console.error(
          "Undo request failed",
          ackResult?.message || "Unknown undo error",
        );
      }

      if (!entry && clientId) {
        // Already resolved elsewhere (e.g., regular ACK beat undo response).
        resolvePendingAck(clientId);
      }
    },
    [
      removeLiveEventById,
      removeLiveEventByClientId,
      removeQueuedEventByClientId,
      removeUndoCandidate,
      resolvePendingAck,
    ],
  );

  const handleAckResult = useCallback(
    (ackResult: AckResultPayload) => {
      let pendingId = ackResult?.client_id ?? null;
      const status = ackResult?.status ?? "success";

      if (status.startsWith("undo_")) {
        handleUndoAck(ackResult);
        return;
      }

      if (pendingId) {
        const idx = pendingAckOrderRef.current.indexOf(pendingId);
        if (idx !== -1) {
          pendingAckOrderRef.current.splice(idx, 1);
        }
      } else {
        pendingId = pendingAckOrderRef.current.shift() ?? null;
      }

      if (!pendingId) {
        if (status === "success") {
          requestTimelineRefresh();
        } else {
          console.warn(
            "Ack received with no pending event in queue",
            ackResult,
          );
        }
        return;
      }
      const entry =
        status === "success"
          ? resolvePendingAck(pendingId)
          : rejectPendingAck(pendingId);

      if (!entry) {
        if (pendingId && undoCompletedRef.current.has(pendingId)) {
          undoCompletedRef.current.delete(pendingId);
          return;
        }
        console.warn("Pending ack entry missing for id", pendingId);
        return;
      }

      const { event, source } = entry;

      if (status === "success") {
        if (ackResult?.event_id) {
          updateLiveEventId(event.timestamp, ackResult.event_id);
        }
        if (source === "queue") {
          removeQueuedEvent(event);
        }
        if (event.client_id) {
          pushUndoCandidate(event.client_id);
        }
        console.log("✓ Event persisted:", event.type, ackResult?.event_id);
      } else if (status === "duplicate") {
        removeLiveEventByTimestamp(event.timestamp);
        if (source === "queue") {
          removeQueuedEvent(event);
        }
        if (event.client_id) {
          removeUndoCandidate(event.client_id);
        }
        const duplicateMeta = ackResult?.duplicate;
        setDuplicateHighlight({
          match_clock: duplicateMeta?.match_clock ?? event.match_clock,
          period: duplicateMeta?.period ?? event.period,
          team_id: duplicateMeta?.team_id ?? event.team_id,
          timestamp: event.timestamp,
          created_at: new Date().toISOString(),
          existing_event_id: duplicateMeta?.event_id ?? null,
        });
        incrementDuplicateStats({
          match_clock: event.match_clock,
          period: event.period,
          team_id: event.team_id,
          type: event.type,
        });
        trackTelemetry("match_event_duplicate", {
          matchId,
          eventType: event.type,
          period: event.period,
          matchClock: event.match_clock,
          teamId: event.team_id,
          source,
        });
        console.info(
          "⚠ Duplicate event acknowledged, removed optimistic entry",
        );
      } else {
        if (source === "live") {
          addQueuedEvent(event);
        }
        console.warn("✗ Event failed, re-queued for retry", status);
      }
    },
    [
      resolvePendingAck,
      rejectPendingAck,
      removeQueuedEvent,
      removeLiveEventByTimestamp,
      updateLiveEventId,
      addQueuedEvent,
      setDuplicateHighlight,
      incrementDuplicateStats,
      matchId,
      requestTimelineRefresh,
      handleUndoAck,
      pushUndoCandidate,
      removeUndoCandidate,
    ],
  );

  const flushPendingAcksToQueue = useCallback(() => {
    while (pendingAckOrderRef.current.length) {
      const pendingId = pendingAckOrderRef.current.shift();
      if (!pendingId) {
        continue;
      }
      const entry = rejectPendingAck(pendingId);
      if (entry && entry.source === "live") {
        addQueuedEvent(entry.event);
      }
    }
  }, [rejectPendingAck, addQueuedEvent]);

  /**
   * Sync Queue Function (Section 4.3, Step 6)
   * Sends all queued events and removes them on success
   */
  useEffect(() => {
    queuedEventsRef.current = queuedEventsByMatch;
  }, [queuedEventsByMatch]);

  useEffect(() => {
    pendingAcksRef.current = pendingAcks;
  }, [pendingAcks]);

  const syncQueue = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const scopedQueue = matchId ? queuedEventsRef.current[matchId] || [] : [];

    if (!scopedQueue.length) {
      return;
    }

    const pendingQueueTimestamps = new Set(
      (Object.values(pendingAcksRef.current || {}) as PendingAckEntry[])
        .filter((entry) => entry.source === "queue")
        .map((entry) => entry.event.timestamp),
    );

    console.log(
      `Syncing ${scopedQueue.length} queued events for match ${matchId}...`,
    );

    for (const event of scopedQueue) {
      if (pendingQueueTimestamps.has(event.timestamp)) {
        continue;
      }

      try {
        ensureClientId(event, "queue");
        wsRef.current.send(JSON.stringify(event));
        registerPendingAck(event, "queue");
        console.log("↻ Queue event sent for ack:", event.type);
      } catch (error) {
        console.error("✗ Failed to sync event:", error);
        break; // Stop syncing on error
      }
    }
  }, [registerPendingAck, matchId, ensureClientId]);

  /**
   * Send Event Function
   * Implements Section 4.3, Steps 7-9
   * - If connected: send via WebSocket
   * - If not connected or send fails: queue to IndexedDB
   */
  const sendEvent = useCallback(
    (eventData: Omit<MatchEvent, "match_id" | "timestamp">) => {
      const event: MatchEvent = {
        ...eventData,
        match_id: matchId,
        timestamp: new Date().toISOString(),
        client_id: generateClientId(),
      };

      // Step 8: Optimistic UI - immediately add to liveEvents
      addLiveEvent(event);
      if (event.client_id) {
        pushUndoCandidate(event.client_id);
      }

      // Step 9: Send/Queue Logic
      if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify(event));
          registerPendingAck(event, "live");
          console.log("✓ Event sent:", event.type);
        } catch (error) {
          console.error("✗ Send failed, queuing event:", error);
          addQueuedEvent(event);
        }
      } else {
        // Not connected - immediately queue to IndexedDB
        console.log("⚠ Offline, queuing event:", event.type);
        addQueuedEvent(event);
      }
    },
    [matchId, isConnected, addLiveEvent, addQueuedEvent, registerPendingAck],
  );

  const undoEvent = useCallback(
    (event: MatchEvent) => {
      if (!event?.client_id) {
        throw new Error("client_id required to undo an event");
      }
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not connected");
      }

      const alreadyPending = Boolean(pendingAcksRef.current?.[event.client_id]);
      if (!alreadyPending) {
        if (!pendingAckOrderRef.current.includes(event.client_id)) {
          pendingAckOrderRef.current.push(event.client_id);
        }
        upsertPendingAck(event.client_id, { event, source: "live" });
      }

      undoInFlightRef.current.add(event.client_id);

      wsRef.current.send(
        JSON.stringify({
          command: "undo",
          match_id: matchId,
          client_id: event.client_id,
          event_id: event._id,
        }),
      );
    },
    [matchId, upsertPendingAck],
  );

  /**
   * Initialize WebSocket connection
   */
  const connect = useCallback(async () => {
    if (!enabled || !matchId) return;

    try {
      const token = await getAuthToken();
      if (!token) {
        return;
      }

      // WebSocket URL: ws://localhost:8000/ws/{match_id}?token={token}
      const wsUrl = `${
        import.meta.env.VITE_WS_URL || "ws://localhost:8000"
      }/ws/${matchId}?token=${token}`;

      console.log("Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const handleOpen = () => {
        console.log("✓ WebSocket connected");
        suppressReconnectRef.current = false;
        setConnected(true);
        syncQueue();
      };

      // Step 6: On-Connect Handler (Section 4.3)
      ws.onopen = handleOpen;
      if (IS_E2E_TEST_MODE) {
        handleOpen();
      }

      // Step 10: On-Disconnect Handler (Section 4.3)
      ws.onclose = (event) => {
        console.log("✗ WebSocket disconnected:", event.code, event.reason);
        flushPendingAcksToQueue();
        pendingAckOrderRef.current = [];
        setConnected(false); // Update store

        // If the disconnect was forced (E2E harness) keep the socket offline
        // until an explicit reconnect() call is issued via the harness.
        if (suppressReconnectRef.current) {
          return;
        }

        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log("Attempting to reconnect...");
          connect();
        }, 3000);
      };

      // Handle incoming messages (confirmations, broadcasts)
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          // Handle acknowledgment
          if (message.type === "ack") {
            handleAckResult(message.result ?? {});
            return;
          }

          // Handle broadcast events from any logger
          if (message._confirmed) {
            upsertLiveEvent(message as MatchEvent);
            return;
          }

          if (message.type === "event_undone") {
            if (message.event_id) {
              removeLiveEventById(message.event_id);
            }
            if (message.client_id) {
              removeLiveEventByClientId(message.client_id);
              removeQueuedEventByClientId(message.client_id);
              removeUndoCandidate(message.client_id);
            }
            return;
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      // Handle errors
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    } catch (error) {
      console.error("Failed to connect WebSocket:", error);
      setConnected(false);
    }
  }, [
    enabled,
    matchId,
    setConnected,
    syncQueue,
    flushPendingAcksToQueue,
    handleAckResult,
    upsertLiveEvent,
    getAuthToken,
  ]);

  /**
   * Disconnect WebSocket
   */
  const disconnect = useCallback(() => {
    flushPendingAcksToQueue();
    pendingAckOrderRef.current = [];
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnected(false);
  }, [flushPendingAcksToQueue, setConnected]);

  /**
   * Effect: Connect on mount, disconnect on unmount
   */
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  useEffect(() => {
    if (isConnected) {
      syncQueue();
    }
  }, [isConnected, matchId, syncQueue]);

  useEffect(() => {
    if (!IS_E2E_TEST_MODE) {
      return;
    }

    const harness: SocketTestHarness = {
      forceDisconnect: () => {
        suppressReconnectRef.current = true;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        if (wsRef.current) {
          wsRef.current.close(4001, "e2e-force-disconnect");
        }
      },
      reconnect: () => {
        suppressReconnectRef.current = false;
        connect();
      },
    };

    window.__PROMATCH_SOCKET_TEST__ = harness;

    return () => {
      if (window.__PROMATCH_SOCKET_TEST__ === harness) {
        delete window.__PROMATCH_SOCKET_TEST__;
      }
    };
  }, [connect]);

  return {
    sendEvent,
    undoEvent,
    isConnected,
  };
};
