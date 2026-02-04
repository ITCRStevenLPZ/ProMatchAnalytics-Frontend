/**
 * Match Log Store with Offline-First Architecture
 * Based on Section 4.3: Data Synchronization Flow (Offline-First Strategy)
 *
 * Implements:
 * - Zustand state management
 * - persist middleware with IndexedDB storage (idb-keyval)
 * - isConnected, liveEvents, queuedEvents state
 * - Automatic hydration from IndexedDB on page load
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";

/**
 * MatchEvent interface based on backend MatchEvent model
 */
export interface MatchEvent {
  _id?: string;
  match_id: string;
  timestamp: string;
  client_id?: string;
  match_clock: string;
  period: number;
  team_id: string;
  player_id?: string;
  location?: [number, number];
  type: string;
  data: Record<string, any>;
  _confirmed?: boolean;
  _saved_at?: string;
}

export interface DuplicateHighlight {
  match_clock: string;
  period: number;
  team_id: string;
  timestamp?: string;
  created_at: string;
  existing_event_id?: string | null;
}

export interface DuplicateStats {
  count: number;
  lastMatchClock?: string;
  lastPeriod?: number;
  lastTeamId?: string;
  lastEventType?: string;
  lastSeenAt?: string;
}

/**
 * Match Log Store State
 */
export interface PendingAckEntry {
  event: MatchEvent;
  source: "live" | "queue";
}

interface MatchLogState {
  // Connection status
  isConnected: boolean;
  isHydrated: boolean;

  // Events for this session (rendered in UI)
  liveEvents: MatchEvent[];

  // Events pending server sync (persisted to IndexedDB)
  queuedEvents: MatchEvent[];
  queuedEventsByMatch: Record<string, MatchEvent[]>;

  // Optimistic events awaiting ack keyed by client request id
  pendingAcks: Record<string, PendingAckEntry>;

  // Current match ID
  currentMatchId: string | null;
  undoStack: string[];

  duplicateHighlight: DuplicateHighlight | null;
  duplicateStats: DuplicateStats;
  operatorClock: string;
  operatorPeriod: number;
  effectiveTime: number; // Accumulated effective time in seconds
  isBallInPlay: boolean;
  lastTimelineRefreshRequest: number;

  // Actions
  setConnected: (connected: boolean) => void;
  setIsHydrated: (hydrated: boolean) => void;
  addLiveEvent: (event: MatchEvent) => void;
  setLiveEvents: (events: MatchEvent[]) => void;
  upsertLiveEvent: (event: MatchEvent) => void;
  removeLiveEventByTimestamp: (timestamp: string) => void;
  removeLiveEventByClientId: (clientId: string) => void;
  removeLiveEventById: (eventId: string) => void;
  updateLiveEventId: (timestamp: string, serverId: string) => void;
  updateEventNotes: (event: MatchEvent, notes: string | null) => void;
  addQueuedEvent: (event: MatchEvent) => void;
  removeQueuedEvent: (event: MatchEvent) => void;
  removeQueuedEventByClientId: (clientId: string) => void;
  upsertPendingAck: (clientId: string, entry: PendingAckEntry) => void;
  resolvePendingAck: (clientId: string) => PendingAckEntry | undefined;
  rejectPendingAck: (clientId: string) => PendingAckEntry | undefined;
  setQueuedEventClientId: (
    matchId: string,
    timestamp: string,
    clientId: string,
  ) => void;
  clearQueuedEvents: () => void;
  clearPendingAcks: () => void;
  setCurrentMatch: (matchId: string | null) => void;
  pushUndoCandidate: (clientId: string) => void;
  removeUndoCandidate: (clientId: string) => void;
  clearUndoStack: () => void;
  setDuplicateHighlight: (highlight: DuplicateHighlight) => void;
  clearDuplicateHighlight: () => void;
  incrementDuplicateStats: (payload: {
    match_clock: string;
    period: number;
    team_id: string;
    type: string;
  }) => void;
  resetDuplicateStats: () => void;
  setOperatorClock: (clock: string) => void;
  setOperatorPeriod: (period: number) => void;
  setEffectiveTime: (time: number) => void;
  setIsBallInPlay: (inPlay: boolean) => void;
  resetOperatorControls: (defaults?: {
    clock?: string;
    period?: number;
  }) => void;
  requestTimelineRefresh: () => void;
  resetStore: () => void;
}

/**
 * Custom IndexedDB storage using idb-keyval
 * Implements the async StateStorage pattern for zustand/persist
 */
const indexedDBStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await get(name);
      return value || null;
    } catch (error) {
      console.error("Error reading from IndexedDB:", error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch (error) {
      console.error("Error writing to IndexedDB:", error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch (error) {
      console.error("Error removing from IndexedDB:", error);
    }
  },
};

/**
 * Create the Match Log Store
 * Implements Section 4.3: Client-Side State & Persistence
 */
export const useMatchLogStore = create<MatchLogState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: false,
      isHydrated: false,
      liveEvents: [],
      queuedEvents: [],
      queuedEventsByMatch: {},
      pendingAcks: {},
      currentMatchId: null,
      undoStack: [],
      duplicateHighlight: null,
      duplicateStats: { count: 0 },
      operatorClock: "00:00.000",
      operatorPeriod: 1,
      effectiveTime: 0,
      isBallInPlay: false,
      lastTimelineRefreshRequest: 0,

      // Set connection status
      setConnected: (connected: boolean) => {
        set({ isConnected: connected });
      },

      setIsHydrated: (hydrated: boolean) => {
        set({ isHydrated: hydrated });
      },

      // Add event to live feed (optimistic UI)
      addLiveEvent: (event: MatchEvent) => {
        set((state) => ({
          liveEvents: [...state.liveEvents, event],
        }));
      },

      setLiveEvents: (events: MatchEvent[]) => {
        set((state) => {
          const currentMatchId = state.currentMatchId;
          if (!currentMatchId) {
            return { liveEvents: events };
          }

          const queued = state.queuedEventsByMatch[currentMatchId] || [];
          if (queued.length === 0) {
            return { liveEvents: events };
          }

          // Merge fetched events with local queued events
          // Avoid duplicates based on client_id or timestamp+type
          const merged = [...events];

          queued.forEach((qEvent) => {
            const exists = merged.some((e) => {
              if (e.client_id && qEvent.client_id) {
                return e.client_id === qEvent.client_id;
              }
              return e.timestamp === qEvent.timestamp && e.type === qEvent.type;
            });

            if (!exists) {
              merged.push(qEvent);
            }
          });

          // Sort by timestamp to maintain timeline order
          merged.sort(
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
          );

          return { liveEvents: merged };
        });
      },

      updateEventNotes: (event: MatchEvent, notes: string | null) => {
        const nextNotes = notes || null;
        const matcher = (existing: MatchEvent) => {
          if (event._id && existing._id) return event._id === existing._id;
          if (event.client_id && existing.client_id)
            return event.client_id === existing.client_id;
          return (
            existing.timestamp === event.timestamp &&
            existing.type === event.type &&
            existing.match_clock === event.match_clock
          );
        };

        set((state) => {
          const updateItem = (item: MatchEvent) =>
            matcher(item) ? { ...item, notes: nextNotes } : item;

          const queuedEvents = state.queuedEvents.map(updateItem);
          const liveEvents = state.liveEvents.map(updateItem);
          const queuedEventsByMatch = Object.fromEntries(
            Object.entries(state.queuedEventsByMatch).map(([matchId, list]) => [
              matchId,
              list.map(updateItem),
            ]),
          );

          return { liveEvents, queuedEvents, queuedEventsByMatch };
        });
      },

      upsertLiveEvent: (event: MatchEvent) => {
        set((state) => {
          const idx = state.liveEvents.findIndex((existing) => {
            if (event._id && existing._id) {
              return existing._id === event._id;
            }
            return (
              existing.timestamp === event.timestamp &&
              existing.type === event.type &&
              existing.match_clock === event.match_clock
            );
          });

          if (idx === -1) {
            return { liveEvents: [...state.liveEvents, event] };
          }

          const updated = [...state.liveEvents];
          updated[idx] = { ...updated[idx], ...event };
          return { liveEvents: updated };
        });
      },

      removeLiveEventByTimestamp: (timestamp: string) => {
        set((state) => ({
          liveEvents: state.liveEvents.filter(
            (event) => event.timestamp !== timestamp,
          ),
        }));
      },

      removeLiveEventByClientId: (clientId: string) => {
        if (!clientId) return;
        set((state) => ({
          liveEvents: state.liveEvents.filter(
            (event) => event.client_id !== clientId,
          ),
        }));
      },

      removeLiveEventById: (eventId: string) => {
        if (!eventId) return;
        set((state) => ({
          liveEvents: state.liveEvents.filter((event) => event._id !== eventId),
        }));
      },

      updateLiveEventId: (timestamp: string, serverId: string) => {
        set((state) => ({
          liveEvents: state.liveEvents.map((event) =>
            event.timestamp === timestamp ? { ...event, _id: serverId } : event,
          ),
        }));
      },

      // Add event to queue (offline persistence)
      addQueuedEvent: (event: MatchEvent) => {
        set((state) => {
          const matchQueue = state.queuedEventsByMatch[event.match_id] || [];
          const isCurrentMatch = state.currentMatchId === event.match_id;
          return {
            queuedEvents: isCurrentMatch
              ? [...state.queuedEvents, event]
              : state.queuedEvents,
            queuedEventsByMatch: {
              ...state.queuedEventsByMatch,
              [event.match_id]: [...matchQueue, event],
            },
          };
        });
      },

      // Remove event from queue (after successful sync)
      removeQueuedEvent: (event: MatchEvent) => {
        set((state) => {
          const matchQueue = state.queuedEventsByMatch[event.match_id] || [];
          const filteredMatchQueue = matchQueue.filter(
            (e) => e.timestamp !== event.timestamp || e.type !== event.type,
          );
          const updatedByMatch = {
            ...state.queuedEventsByMatch,
            [event.match_id]: filteredMatchQueue,
          };
          if (!filteredMatchQueue.length) {
            delete updatedByMatch[event.match_id];
          }

          const isCurrentMatch = state.currentMatchId === event.match_id;
          const filtered = isCurrentMatch
            ? state.queuedEvents.filter(
                (e) => e.timestamp !== event.timestamp || e.type !== event.type,
              )
            : state.queuedEvents;

          return {
            queuedEvents: filtered,
            queuedEventsByMatch: updatedByMatch,
          };
        });
      },

      removeQueuedEventByClientId: (clientId: string) => {
        if (!clientId) return;
        set((state) => {
          const updatedByMatch: Record<string, MatchEvent[]> = {};
          Object.entries(state.queuedEventsByMatch).forEach(
            ([matchId, events]) => {
              const filtered = events.filter(
                (event) => event.client_id !== clientId,
              );
              if (filtered.length) {
                updatedByMatch[matchId] = filtered;
              }
            },
          );

          const filteredQueue = state.queuedEvents.filter(
            (event) => event.client_id !== clientId,
          );

          return {
            queuedEventsByMatch: updatedByMatch,
            queuedEvents: filteredQueue,
          };
        });
      },

      // Track optimistic events awaiting ack
      upsertPendingAck: (clientId: string, entry: PendingAckEntry) => {
        set((state) => ({
          pendingAcks: { ...state.pendingAcks, [clientId]: entry },
        }));
      },

      resolvePendingAck: (clientId: string) => {
        const pending = get().pendingAcks[clientId];
        if (pending) {
          set((state) => {
            const { [clientId]: _, ...rest } = state.pendingAcks;
            return { pendingAcks: rest };
          });
        }
        return pending;
      },

      rejectPendingAck: (clientId: string) => {
        const pending = get().pendingAcks[clientId];
        if (pending) {
          set((state) => {
            const { [clientId]: _, ...rest } = state.pendingAcks;
            return { pendingAcks: rest };
          });
        }
        return pending;
      },

      setQueuedEventClientId: (
        matchId: string,
        timestamp: string,
        clientId: string,
      ) => {
        set((state) => {
          const queue = state.queuedEventsByMatch[matchId];
          if (!queue?.length) {
            return {};
          }

          const updatedQueue = queue.map((event) =>
            event.timestamp === timestamp
              ? { ...event, client_id: clientId }
              : event,
          );

          const updates: Partial<MatchLogState> = {
            queuedEventsByMatch: {
              ...state.queuedEventsByMatch,
              [matchId]: updatedQueue,
            },
          };

          if (state.currentMatchId === matchId) {
            updates.queuedEvents = state.queuedEvents.map((event) =>
              event.timestamp === timestamp
                ? { ...event, client_id: clientId }
                : event,
            );
          }

          return updates;
        });
      },

      // Clear all queued events
      clearQueuedEvents: () => {
        set({ queuedEvents: [], queuedEventsByMatch: {} });
      },

      // Clear all pending acks
      clearPendingAcks: () => {
        set({ pendingAcks: {} });
      },

      // Set current match ID
      setCurrentMatch: (matchId: string | null) => {
        set({
          currentMatchId: matchId,
          liveEvents: [], // Clear live events when switching matches
          queuedEvents: matchId ? get().queuedEventsByMatch[matchId] || [] : [],
          undoStack: [],
        });
      },

      pushUndoCandidate: (clientId: string) => {
        if (!clientId) return;
        set((state) => {
          const MAX_UNDO = 20;
          const deduped = state.undoStack.filter((id) => id !== clientId);
          deduped.push(clientId);
          while (deduped.length > MAX_UNDO) {
            deduped.shift();
          }
          return { undoStack: deduped };
        });
      },

      removeUndoCandidate: (clientId: string) => {
        if (!clientId) return;
        set((state) => ({
          undoStack: state.undoStack.filter((id) => id !== clientId),
        }));
      },

      clearUndoStack: () => {
        set({ undoStack: [] });
      },

      setDuplicateHighlight: (highlight: DuplicateHighlight) => {
        set({ duplicateHighlight: highlight });
      },

      clearDuplicateHighlight: () => {
        set({ duplicateHighlight: null });
      },

      incrementDuplicateStats: ({ match_clock, period, team_id, type }) => {
        set((state) => ({
          duplicateStats: {
            count: state.duplicateStats.count + 1,
            lastMatchClock: match_clock,
            lastPeriod: period,
            lastTeamId: team_id,
            lastEventType: type,
            lastSeenAt: new Date().toISOString(),
          },
        }));
      },

      resetDuplicateStats: () => {
        set({ duplicateStats: { count: 0 } });
      },

      setOperatorClock: (clock: string) => {
        set({ operatorClock: clock });
      },

      setOperatorPeriod: (period: number) => {
        set({ operatorPeriod: period });
      },

      setEffectiveTime: (time: number) => {
        set({ effectiveTime: time });
      },

      setIsBallInPlay: (inPlay: boolean) => {
        set({ isBallInPlay: inPlay });
      },

      resetOperatorControls: (defaults) => {
        set({
          operatorClock: defaults?.clock ?? "00:00.000",
          operatorPeriod: defaults?.period ?? 1,
          effectiveTime: 0,
          isBallInPlay: false,
        });
      },

      requestTimelineRefresh: () => {
        set({ lastTimelineRefreshRequest: Date.now() });
      },

      // Reset store to initial state
      resetStore: () => {
        set({
          isConnected: false,
          isHydrated: true, // Keep hydrated true
          liveEvents: [],
          queuedEvents: [],
          queuedEventsByMatch: {},
          pendingAcks: {},
          currentMatchId: null,
          undoStack: [],
          duplicateHighlight: null,
          duplicateStats: { count: 0 },
          operatorClock: "00:00.000",
          operatorPeriod: 1,
          effectiveTime: 0,
          isBallInPlay: false,
          lastTimelineRefreshRequest: 0,
        });
      },
    }),
    {
      name: "match-log-storage", // IndexedDB key
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist queued events map and current match
      partialize: (state) => ({
        queuedEventsByMatch: state.queuedEventsByMatch,
        currentMatchId: state.currentMatchId,
        operatorClock: state.operatorClock,
        operatorPeriod: state.operatorPeriod,
        effectiveTime: state.effectiveTime,
        isBallInPlay: state.isBallInPlay,
        liveEvents: state.liveEvents,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setIsHydrated(true);
      },
    },
  ),
);
