# State Management & Offline Sync

## Overview
The frontend uses a hybrid state management approach:
- **Zustand**: For global application state (Auth, UI, Sync Status).
- **React Query**: For server state (fetching matches, teams).
- **Dexie.js (IndexedDB)**: For persistent local storage and offline queue.

## Stores

### 1. `useMatchLogStore`
Manages the active match logging session.
- **State**: Current match, event history, timer status.
- **Actions**: `addEvent`, `startClock`, `stopClock`.
- **Persistence**: State is kept in memory but events are immediately persisted to IndexedDB.

### 2. `syncStore`
Manages the offline synchronization process.
- **State**: `isOnline`, `queueSize`, `syncStatus` (idle, syncing, error).
- **Logic**:
  - Listens for `online` / `offline` window events.
  - On connection restore, triggers the `SyncManager`.

### 3. `authStore`
Manages user authentication.
- **State**: `user`, `token`, `isAuthenticated`.
- **Persistence**: Persists token to `localStorage` for session restoration.

## Offline Synchronization Strategy

### The Sync Queue
All write operations (creating events, updating matches) go through a unified pipeline:

1.  **Optimistic UI Update**: The UI reflects the change immediately.
2.  **Queueing**: The operation is wrapped in a `SyncItem` and stored in the `ingestion_items` table in IndexedDB.
    ```typescript
    interface SyncItem {
      id: string;
      type: 'create_event' | 'update_match';
      payload: any;
      timestamp: number;
      status: 'pending' | 'synced' | 'failed';
    }
    ```
3.  **Processing**:
    - If **Online**: The `SyncManager` attempts to send the item immediately via REST/WebSocket.
    - If **Offline**: The item remains `pending` in IndexedDB.

### Reconnection Flow
When the application detects a network restoration:
1.  `SyncManager` wakes up.
2.  Reads all `pending` items from IndexedDB sorted by timestamp.
3.  Processes items sequentially (FIFO).
4.  On success, marks item as `synced` (or deletes it).
5.  On failure (non-retryable), moves to `failed` state for manual resolution.
