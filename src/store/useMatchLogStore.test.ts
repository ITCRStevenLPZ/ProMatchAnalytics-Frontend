import { beforeEach, describe, expect, it } from "vitest";
import { useMatchLogStore, type MatchEvent } from "./useMatchLogStore";

const makeEvent = (overrides: Partial<MatchEvent> = {}): MatchEvent => ({
  match_id: "m1",
  timestamp: "2026-02-21T10:00:00.000Z",
  match_clock: "10:00.000",
  period: 1,
  team_id: "home-team",
  type: "Substitution",
  data: {
    player_off_id: "p1",
    player_on_id: "p12",
  },
  ...overrides,
});

describe("useMatchLogStore setLiveEvents", () => {
  beforeEach(() => {
    useMatchLogStore.getState().resetStore();
  });

  it("keeps pending live optimistic events during hydration", () => {
    const serverEvent = makeEvent({
      _id: "evt-server",
      timestamp: "2026-02-21T10:01:00.000Z",
      type: "Pass",
      data: { outcome: "Complete" },
      client_id: undefined,
    });
    const pendingLiveEvent = makeEvent({
      client_id: "cid-sub-1",
      timestamp: "2026-02-21T10:02:00.000Z",
    });

    const store = useMatchLogStore.getState();
    store.setCurrentMatch("m1");
    store.upsertPendingAck("cid-sub-1", {
      event: pendingLiveEvent,
      source: "live",
    });

    useMatchLogStore.getState().setLiveEvents([serverEvent]);

    const liveEvents = useMatchLogStore.getState().liveEvents;
    expect(liveEvents).toHaveLength(2);
    expect(liveEvents.some((event) => event.client_id === "cid-sub-1")).toBe(
      true,
    );
    expect(liveEvents.some((event) => event._id === "evt-server")).toBe(true);
  });

  it("ignores pending live optimistic events from other matches", () => {
    const serverEvent = makeEvent({
      _id: "evt-server",
      timestamp: "2026-02-21T10:01:00.000Z",
      type: "Pass",
      data: { outcome: "Complete" },
      client_id: undefined,
    });
    const pendingOtherMatch = makeEvent({
      match_id: "m2",
      client_id: "cid-other-match",
      timestamp: "2026-02-21T10:02:00.000Z",
    });

    const store = useMatchLogStore.getState();
    store.setCurrentMatch("m1");
    store.upsertPendingAck("cid-other-match", {
      event: pendingOtherMatch,
      source: "live",
    });

    useMatchLogStore.getState().setLiveEvents([serverEvent]);

    const liveEvents = useMatchLogStore.getState().liveEvents;
    expect(liveEvents).toHaveLength(1);
    expect(
      liveEvents.some((event) => event.client_id === "cid-other-match"),
    ).toBe(false);
    expect(liveEvents[0]?._id).toBe("evt-server");
  });
});
