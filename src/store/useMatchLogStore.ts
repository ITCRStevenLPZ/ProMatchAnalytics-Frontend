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
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del } from 'idb-keyval';

/**
 * MatchEvent interface based on backend MatchEvent model
 */
export interface MatchEvent {
  _id?: string;
  match_id: string;
  timestamp: string;
  match_clock: string;
  period: number;
  team_id: string;
  player_id?: string;
  location?: [number, number];
  type: string;
  data: Record<string, any>;
}

/**
 * Match Log Store State
 */
interface MatchLogState {
  // Connection status
  isConnected: boolean;
  
  // Events for this session (rendered in UI)
  liveEvents: MatchEvent[];
  
  // Events pending server sync (persisted to IndexedDB)
  queuedEvents: MatchEvent[];
  
  // Current match ID
  currentMatchId: string | null;
  
  // Actions
  setConnected: (connected: boolean) => void;
  addLiveEvent: (event: MatchEvent) => void;
  addQueuedEvent: (event: MatchEvent) => void;
  removeQueuedEvent: (event: MatchEvent) => void;
  clearQueuedEvents: () => void;
  setCurrentMatch: (matchId: string | null) => void;
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
      console.error('Error reading from IndexedDB:', error);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value);
    } catch (error) {
      console.error('Error writing to IndexedDB:', error);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name);
    } catch (error) {
      console.error('Error removing from IndexedDB:', error);
    }
  },
};

/**
 * Create the Match Log Store
 * Implements Section 4.3: Client-Side State & Persistence
 */
export const useMatchLogStore = create<MatchLogState>()(
  persist(
    (set) => ({
      // Initial state
      isConnected: false,
      liveEvents: [],
      queuedEvents: [],
      currentMatchId: null,
      
      // Set connection status
      setConnected: (connected: boolean) => {
        set({ isConnected: connected });
      },
      
      // Add event to live feed (optimistic UI)
      addLiveEvent: (event: MatchEvent) => {
        set((state) => ({
          liveEvents: [...state.liveEvents, event],
        }));
      },
      
      // Add event to queue (offline persistence)
      addQueuedEvent: (event: MatchEvent) => {
        set((state) => ({
          queuedEvents: [...state.queuedEvents, event],
        }));
      },
      
      // Remove event from queue (after successful sync)
      removeQueuedEvent: (event: MatchEvent) => {
        set((state) => ({
          queuedEvents: state.queuedEvents.filter(
            (e) => e.timestamp !== event.timestamp || e.type !== event.type
          ),
        }));
      },
      
      // Clear all queued events
      clearQueuedEvents: () => {
        set({ queuedEvents: [] });
      },
      
      // Set current match ID
      setCurrentMatch: (matchId: string | null) => {
        set({ 
          currentMatchId: matchId,
          liveEvents: [], // Clear live events when switching matches
        });
      },
      
      // Reset store to initial state
      resetStore: () => {
        set({
          isConnected: false,
          liveEvents: [],
          queuedEvents: [],
          currentMatchId: null,
        });
      },
    }),
    {
      name: 'match-log-storage', // IndexedDB key
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist queued events and current match
      partialize: (state) => ({
        queuedEvents: state.queuedEvents,
        currentMatchId: state.currentMatchId,
      }),
    }
  )
);
