import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMatchLogStore, type MatchEvent } from './useMatchLogStore';

const baseEvent = (matchId: string, timestamp: string, overrides: Partial<MatchEvent> = {}): MatchEvent => ({
  match_id: matchId,
  timestamp,
  match_clock: '00:10.000',
  period: 1,
  team_id: 'HOME_TEAM',
  type: 'Pass',
  data: { outcome: 'Complete' },
  ...overrides,
});

const resetStoreState = async () => {
  useMatchLogStore.getState().resetStore();
  await useMatchLogStore.persist?.clearStorage();
  await useMatchLogStore.persist?.rehydrate();
};

describe('useMatchLogStore queue scoping', () => {
  beforeEach(async () => {
    await resetStoreState();
  });

  it('keeps queuedEvents scoped to the active match when switching contexts', () => {
    const store = useMatchLogStore.getState();
    store.setCurrentMatch('MATCH-A');
    store.addQueuedEvent(baseEvent('MATCH-A', 'ts-1'));

    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(1);
    expect(useMatchLogStore.getState().queuedEvents[0].match_id).toBe('MATCH-A');

    store.setCurrentMatch('MATCH-B');
    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(0);

    store.addQueuedEvent(baseEvent('MATCH-B', 'ts-2'));
    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(1);
    expect(useMatchLogStore.getState().queuedEvents[0].match_id).toBe('MATCH-B');

    store.setCurrentMatch('MATCH-A');
    const scopedQueue = useMatchLogStore.getState().queuedEvents;
    expect(scopedQueue).toHaveLength(1);
    expect(scopedQueue[0].match_id).toBe('MATCH-A');

    const byMatch = useMatchLogStore.getState().queuedEventsByMatch;
    expect(byMatch['MATCH-A']).toHaveLength(1);
    expect(byMatch['MATCH-B']).toHaveLength(1);
  });

  it('supports repeated offline retries until removeQueuedEvent clears the payload', () => {
    const store = useMatchLogStore.getState();
    store.setCurrentMatch('MATCH-A');
    const event = baseEvent('MATCH-A', 'ts-3');
    store.addQueuedEvent(event);

    store.setQueuedEventClientId('MATCH-A', 'ts-3', 'client-1');
    expect(useMatchLogStore.getState().queuedEvents[0].client_id).toBe('client-1');

    store.setQueuedEventClientId('MATCH-A', 'ts-3', 'client-2');
    expect(useMatchLogStore.getState().queuedEvents[0].client_id).toBe('client-2');

    store.removeQueuedEvent(event);
    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(0);
    expect(useMatchLogStore.getState().queuedEventsByMatch['MATCH-A']).toBeUndefined();
  });

  it('issues monotonic tokens when requesting timeline refresh', () => {
    const store = useMatchLogStore.getState();
    expect(store.lastTimelineRefreshRequest).toBe(0);
    store.requestTimelineRefresh();
    const first = useMatchLogStore.getState().lastTimelineRefreshRequest;
    expect(first).toBeGreaterThan(0);
    store.requestTimelineRefresh();
    const second = useMatchLogStore.getState().lastTimelineRefreshRequest;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it('manages undo stack entries with deduplication and clearing', () => {
    const store = useMatchLogStore.getState();
    store.pushUndoCandidate('client-1');
    store.pushUndoCandidate('client-2');
    expect(useMatchLogStore.getState().undoStack).toEqual(['client-1', 'client-2']);

    store.pushUndoCandidate('client-1');
    expect(useMatchLogStore.getState().undoStack).toEqual(['client-2', 'client-1']);

    store.removeUndoCandidate('client-2');
    expect(useMatchLogStore.getState().undoStack).toEqual(['client-1']);

    store.clearUndoStack();
    expect(useMatchLogStore.getState().undoStack).toHaveLength(0);
  });

  it('removes live and queued events by client id', () => {
    const store = useMatchLogStore.getState();
    store.setCurrentMatch('MATCH-A');
    const liveEvent = baseEvent('MATCH-A', 'ts-undo', { client_id: 'client-x' });
    const queuedEvent = baseEvent('MATCH-A', 'ts-q', { client_id: 'client-x' });

    store.addLiveEvent(liveEvent);
    store.addQueuedEvent(queuedEvent);
    expect(useMatchLogStore.getState().liveEvents).toHaveLength(1);
    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(1);

    store.removeLiveEventByClientId('client-x');
    store.removeQueuedEventByClientId('client-x');

    expect(useMatchLogStore.getState().liveEvents).toHaveLength(0);
    expect(useMatchLogStore.getState().queuedEvents).toHaveLength(0);
    expect(useMatchLogStore.getState().queuedEventsByMatch['MATCH-A']).toBeUndefined();
  });
});
