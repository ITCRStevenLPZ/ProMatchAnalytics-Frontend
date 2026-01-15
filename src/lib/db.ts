import Dexie, { Table } from "dexie";

// Types
// Normalized offline event aligned to MatchEvent schema
export interface OfflineEvent {
  id?: number;
  clientId: string;
  matchId: string;
  matchClock?: string; // MM:SS(.mmm)
  period?: number; // 1-5
  teamId?: string;
  playerId?: string;
  location?: [number, number];
  type?: string;
  data?: Record<string, any>;
  notes?: string;
  timestamp: Date;
  syncStatus: "pending" | "synced" | "failed";
  // Legacy fields for backward compatibility; prefer the normalized ones above
  eventType?: string;
  matchMinute?: number;
  matchSecond?: number;
  addedTime?: number;
  team?: string;
  playerName?: string;
  playerNumber?: number;
  relatedPlayer?: string;
  relatedPlayerNumber?: number;
  locationX?: number;
  locationY?: number;
  endLocationX?: number;
  endLocationY?: number;
  outcome?: string;
  details?: Record<string, any>;
}

export interface OfflineMatch {
  id: string;
  data: any;
  lastSync: Date;
  version: number;
}

// IndexedDB Database
class OfflineDatabase extends Dexie {
  events!: Table<OfflineEvent, number>;
  matches!: Table<OfflineMatch, string>;

  constructor() {
    super("ProMatchAnalytics");

    this.version(1).stores({
      events: "++id, clientId, matchId, syncStatus, timestamp",
      matches: "id, lastSync",
    });
  }

  // Event operations
  async addEvent(event: Omit<OfflineEvent, "id">): Promise<number> {
    return await this.events.add(event);
  }

  async getPendingEvents(matchId?: string): Promise<OfflineEvent[]> {
    let query = this.events.where("syncStatus").equals("pending");

    if (matchId) {
      return await query.and((event) => event.matchId === matchId).toArray();
    }

    return await query.toArray();
  }

  async markEventSynced(id: number): Promise<void> {
    await this.events.update(id, { syncStatus: "synced" });
  }

  async markEventFailed(id: number): Promise<void> {
    await this.events.update(id, { syncStatus: "failed" });
  }

  async deleteEvent(id: number): Promise<void> {
    await this.events.delete(id);
  }

  async getMatchEvents(matchId: string): Promise<OfflineEvent[]> {
    return await this.events.where("matchId").equals(matchId).toArray();
  }

  // Match operations
  async saveMatch(match: OfflineMatch): Promise<void> {
    await this.matches.put(match);
  }

  async getMatch(matchId: string): Promise<OfflineMatch | undefined> {
    return await this.matches.get(matchId);
  }

  async updateMatch(
    matchId: string,
    data: Partial<OfflineMatch>,
  ): Promise<void> {
    await this.matches.update(matchId, data);
  }

  async clearSyncedEvents(): Promise<void> {
    await this.events.where("syncStatus").equals("synced").delete();
  }
}

export const db = new OfflineDatabase();
