import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlayerStats } from "./usePlayerStats";
import type { Match } from "../types";
import type { MatchEvent } from "../../../store/useMatchLogStore";

/* ── helpers ──────────────────────────────────────────────────── */

const makeMatch = (): Match => ({
  id: "m1",
  status: "Live",
  home_team: {
    id: "T-HOME",
    name: "Home FC",
    short_name: "HFC",
    players: [
      {
        id: "H1",
        full_name: "Alice Home",
        short_name: "Alice",
        jersey_number: 7,
        position: "FW",
        is_starter: true,
      },
      {
        id: "H2",
        full_name: "Bob Home",
        short_name: "Bob",
        jersey_number: 10,
        position: "MF",
        is_starter: true,
      },
      {
        id: "H3",
        full_name: "Charlie Home",
        short_name: "Charlie",
        jersey_number: 1,
        position: "GK",
        is_starter: true,
      },
    ],
  },
  away_team: {
    id: "T-AWAY",
    name: "Away United",
    short_name: "AWU",
    players: [
      {
        id: "A1",
        full_name: "Dave Away",
        short_name: "Dave",
        jersey_number: 9,
        position: "FW",
        is_starter: true,
      },
      {
        id: "A2",
        full_name: "Eve Away",
        short_name: "Eve",
        jersey_number: 5,
        position: "DF",
        is_starter: true,
      },
    ],
  },
});

const ev = (
  overrides: Partial<MatchEvent> & { type: string; player_id: string },
): MatchEvent => ({
  match_id: "m1",
  timestamp: new Date().toISOString(),
  match_clock: "05:00",
  period: 1,
  team_id: "T-HOME",
  data: {},
  ...overrides,
});

/* ── tests ────────────────────────────────────────────────────── */

describe("usePlayerStats", () => {
  it("returns empty array when no events", () => {
    const { result } = renderHook(() => usePlayerStats(makeMatch(), []));
    expect(result.current).toEqual([]);
  });

  it("counts good and bad passes for the author", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Complete", receiver_id: "H2" },
      }),
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Complete", receiver_id: "H2" },
      }),
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Incomplete" },
      }),
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Out" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const alice = result.current.find((p) => p.playerId === "H1")!;
    expect(alice.passesGood).toBe(2);
    expect(alice.passesBad).toBe(2);
    expect(alice.totalEvents).toBe(4);
  });

  it("credits passesReceived to the receiver", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Complete", receiver_id: "H2" },
      }),
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Complete", receiver_id: "H2" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const bob = result.current.find((p) => p.playerId === "H2")!;
    expect(bob.passesReceived).toBe(2);
  });

  it("counts shots, shots on target, and goals", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Shot",
        player_id: "H1",
        data: { outcome: "Goal" },
      }),
      ev({
        type: "Shot",
        player_id: "H1",
        data: { outcome: "Saved" },
      }),
      ev({
        type: "Shot",
        player_id: "H1",
        data: { outcome: "OffTarget" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const alice = result.current.find((p) => p.playerId === "H1")!;
    expect(alice.shots).toBe(3);
    expect(alice.shotsOnTarget).toBe(2); // Goal + Saved
    expect(alice.goals).toBe(1);
  });

  it("counts duels won and lost", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Duel",
        player_id: "H1",
        data: { outcome: "Won" },
      }),
      ev({
        type: "Duel",
        player_id: "H1",
        data: { outcome: "Lost" },
      }),
      ev({
        type: "Duel",
        player_id: "H1",
        data: { outcome: "Lost" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const alice = result.current.find((p) => p.playerId === "H1")!;
    expect(alice.duelsWon).toBe(1);
    expect(alice.duelsLost).toBe(2);
  });

  it("counts fouls committed and fouls received", () => {
    const events: MatchEvent[] = [
      ev({
        type: "FoulCommitted",
        player_id: "H1",
        data: { target_player_id: "A1" },
      }),
      ev({
        type: "FoulCommitted",
        player_id: "A2",
        team_id: "T-AWAY",
        data: { target_player_id: "H2" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const alice = result.current.find((p) => p.playerId === "H1")!;
    expect(alice.foulsCommitted).toBe(1);

    const dave = result.current.find((p) => p.playerId === "A1")!;
    expect(dave.foulsReceived).toBe(1);

    const bob = result.current.find((p) => p.playerId === "H2")!;
    expect(bob.foulsReceived).toBe(1);

    const eve = result.current.find((p) => p.playerId === "A2")!;
    expect(eve.foulsCommitted).toBe(1);
  });

  it("counts cards (yellow, red, ignores cancelled)", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Card",
        player_id: "H1",
        data: { card_type: "Yellow" },
      }),
      ev({
        type: "Card",
        player_id: "H1",
        data: { card_type: "Yellow (Second)" },
      }),
      ev({
        type: "Card",
        player_id: "H1",
        data: { card_type: "Red" },
      }),
      ev({
        type: "Card",
        player_id: "A1",
        team_id: "T-AWAY",
        data: { card_type: "Cancelled" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const alice = result.current.find((p) => p.playerId === "H1")!;
    expect(alice.yellowCards).toBe(2); // Yellow + Yellow (Second)
    expect(alice.redCards).toBe(1);

    // Cancelled card should NOT increment anything — but player still gets a totalEvents count
    const dave = result.current.find((p) => p.playerId === "A1")!;
    expect(dave.yellowCards).toBe(0);
    expect(dave.redCards).toBe(0);
  });

  it("counts defensive actions (interceptions, recoveries, clearances, blocks)", () => {
    const events: MatchEvent[] = [
      ev({ type: "Interception", player_id: "H2", data: {} }),
      ev({ type: "Recovery", player_id: "H2", data: {} }),
      ev({ type: "Clearance", player_id: "H2", data: {} }),
      ev({ type: "Block", player_id: "H2", data: {} }),
      ev({ type: "Block", player_id: "H2", data: {} }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const bob = result.current.find((p) => p.playerId === "H2")!;
    expect(bob.interceptions).toBe(1);
    expect(bob.recoveries).toBe(1);
    expect(bob.clearances).toBe(1);
    expect(bob.blocks).toBe(2);
    expect(bob.totalEvents).toBe(5);
  });

  it("sorts home before away, then by jersey number", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Pass",
        player_id: "A1",
        team_id: "T-AWAY",
        data: { outcome: "Complete" },
      }),
      ev({ type: "Pass", player_id: "H2", data: { outcome: "Complete" } }),
      ev({ type: "Pass", player_id: "H1", data: { outcome: "Complete" } }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const ids = result.current.map((p) => p.playerId);
    // Home players first (H1 jersey 7, H2 jersey 10), then away (A1 jersey 9)
    expect(ids).toEqual(["H1", "H2", "A1"]);
  });

  it("returns null match gracefully", () => {
    const { result } = renderHook(() => usePlayerStats(null, []));
    expect(result.current).toEqual([]);
  });

  it("handles recipient_id alias for backwards compat", () => {
    const events: MatchEvent[] = [
      ev({
        type: "Pass",
        player_id: "H1",
        data: { outcome: "Complete", recipient_id: "H2" },
      }),
    ];
    const { result } = renderHook(() => usePlayerStats(makeMatch(), events));
    const bob = result.current.find((p) => p.playerId === "H2")!;
    expect(bob.passesReceived).toBe(1);
  });
});
