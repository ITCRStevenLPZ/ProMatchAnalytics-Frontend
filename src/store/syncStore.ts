import { create } from "zustand";
import { db, OfflineEvent } from "../lib/db";
import { apiClient } from "../lib/api";

interface SyncState {
  isSyncing: boolean;
  isOnline: boolean;
  lastSync: Date | null;
  pendingCount: number;
  setOnline: (isOnline: boolean) => void;
  syncEvents: (matchId: string) => Promise<void>;
  addPendingEvent: (event: Omit<OfflineEvent, "id">) => Promise<void>;
  updatePendingCount: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  isSyncing: false,
  isOnline: navigator.onLine,
  lastSync: null,
  pendingCount: 0,

  setOnline: (isOnline) => {
    set({ isOnline });
    if (isOnline) {
      // Trigger sync when coming back online
      get().updatePendingCount();
    }
  },

  addPendingEvent: async (event) => {
    try {
      await db.addEvent(event);
      await get().updatePendingCount();

      // Try to sync immediately if online
      if (get().isOnline && event.matchId) {
        get().syncEvents(event.matchId);
      }
    } catch (error) {
      console.error("Failed to add pending event:", error);
      throw error;
    }
  },

  syncEvents: async (matchId: string) => {
    if (get().isSyncing || !get().isOnline) {
      return;
    }

    set({ isSyncing: true });

    try {
      const pendingEvents = await db.getPendingEvents(matchId);

      if (pendingEvents.length === 0) {
        set({ isSyncing: false, lastSync: new Date() });
        return;
      }

      // Get match data
      const match = await db.getMatch(matchId);

      // Prepare sync request
      const toMatchClock = (minute?: number, second?: number) => {
        if (minute === undefined) return undefined;
        const sec = second ?? 0;
        const m = Math.max(0, minute).toString();
        const s = Math.max(0, Math.min(59, sec)).toString().padStart(2, "0");
        return `${m}:${s}`;
      };

      const pendingPayloads = pendingEvents.map((event) => {
        const clock =
          event.matchClock ??
          toMatchClock(event.matchMinute, event.matchSecond);
        const location =
          event.location ??
          (event.locationX !== undefined && event.locationY !== undefined
            ? [event.locationX, event.locationY]
            : undefined);

        return {
          match_id: event.matchId,
          client_id: event.clientId,
          match_clock: clock,
          period: event.period ?? 1,
          team_id: event.teamId ?? event.team,
          player_id: event.playerId,
          location,
          type: event.type ?? event.eventType,
          data: event.data ?? event.details ?? {},
          notes: event.notes,
        };
      });

      const syncRequest = {
        last_sync: match?.lastSync,
        pending_events: pendingPayloads,
        client_version: match?.version || 1,
        pending_match_updates: match?.data
          ? {
              status: match.data.status,
              home_score: match.data.home_score,
              away_score: match.data.away_score,
              clock_mode: match.data.clock_mode,
              match_time_seconds: match.data.match_time_seconds,
            }
          : undefined,
      };

      // Sync with server
      const response = await apiClient.post<any>(
        `/sync/match/${matchId}`,
        syncRequest,
      );

      // Mark events as synced
      for (const event of pendingEvents) {
        if (event.id) {
          await db.markEventSynced(event.id);
        }
      }

      // Update match data
      if (response.match_updates) {
        await db.saveMatch({
          id: matchId,
          data: response.match_updates,
          lastSync: new Date(),
          version: response.match_updates.version,
        });
      }

      // Handle conflicts
      if (response.conflicts && response.conflicts.length > 0) {
        console.warn("Sync conflicts detected:", response.conflicts);
        // TODO: Implement conflict resolution UI
      }

      set({ lastSync: new Date() });
      await get().updatePendingCount();

      // Clean up old synced events
      await db.clearSyncedEvents();
    } catch (error) {
      console.error("Sync failed:", error);

      // Mark events as failed
      const pendingEvents = await db.getPendingEvents(matchId);
      for (const event of pendingEvents) {
        if (event.id) {
          await db.markEventFailed(event.id);
        }
      }
    } finally {
      set({ isSyncing: false });
    }
  },

  updatePendingCount: async () => {
    try {
      const pending = await db.getPendingEvents();
      set({ pendingCount: pending.length });
    } catch (error) {
      console.error("Failed to update pending count:", error);
    }
  },
}));

// Listen for online/offline events
window.addEventListener("online", () => {
  useSyncStore.getState().setOnline(true);
});

window.addEventListener("offline", () => {
  useSyncStore.getState().setOnline(false);
});
