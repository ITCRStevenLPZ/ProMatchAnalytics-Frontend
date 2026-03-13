import { describe, expect, it } from "vitest";
import { computeIneffectiveBreakdown } from "./utils";

describe("computeIneffectiveBreakdown", () => {
  it("keeps neutral referee stoppages in the neutral Other bucket", () => {
    const start = new Date("2026-03-01T12:00:00.000Z").toISOString();
    const stop = new Date("2026-03-01T12:00:02.000Z").toISOString();

    const breakdown = computeIneffectiveBreakdown(
      [
        {
          type: "GameStoppage",
          timestamp: start,
          period: 1,
          team_id: "NEUTRAL",
          data: {
            stoppage_type: "ClockStop",
            reason: "Referee",
            trigger_action: "Referee",
            trigger_team_id: null,
            trigger_player_id: null,
          },
        },
        {
          type: "GameStoppage",
          timestamp: stop,
          period: 1,
          team_id: "NEUTRAL",
          data: {
            stoppage_type: "ClockStart",
            reason: "Referee",
            trigger_action: "Referee",
            trigger_team_id: null,
            trigger_player_id: null,
          },
        },
      ] as any,
      ["HOME_TEAM"],
      ["AWAY_TEAM"],
      new Date(stop).getTime(),
    );

    expect(breakdown.totals.neutral).toBeGreaterThanOrEqual(1.9);
    expect(breakdown.totals.byAction.Other.neutral).toBeGreaterThanOrEqual(1.9);
    expect(breakdown.totals.byAction.Referee.neutral).toBe(0);
    expect(breakdown.totals.home).toBe(0);
    expect(breakdown.totals.away).toBe(0);
  });

  it("computes active tail for single ClockStop (throw-in E2E scenario)", () => {
    const clockStopTime = new Date("2026-03-01T12:00:05.000Z");
    const nowMs = clockStopTime.getTime() + 3000; // 3 seconds after stoppage

    const events = [
      {
        type: "Pass",
        timestamp: new Date("2026-03-01T12:00:03.000Z").toISOString(),
        period: 1,
        team_id: "E2E_HOME",
        player_id: "HOME-2",
        data: { pass_type: "Throw-in" },
      },
      {
        type: "GameStoppage",
        timestamp: clockStopTime.toISOString(),
        period: 1,
        team_id: "E2E_AWAY",
        data: {
          stoppage_type: "ClockStop",
          reason: "OutOfBounds",
          trigger_action: "OutOfBounds",
          trigger_team_id: "E2E_AWAY",
          trigger_player_id: null,
        },
      },
    ] as any;

    const breakdown = computeIneffectiveBreakdown(
      events,
      ["E2E_HOME"],
      ["E2E_AWAY"],
      nowMs,
    );

    // Active tail should attribute 3 seconds to away OutOfBounds
    expect(breakdown.totals.away).toBeGreaterThanOrEqual(2.9);
    expect(breakdown.totals.byAction.OutOfBounds.away).toBeGreaterThanOrEqual(
      2.9,
    );
    expect(breakdown.totals.home).toBe(0);
    expect(breakdown.active).toEqual({
      teamKey: "away",
      action: "OutOfBounds",
      startMs: clockStopTime.getTime(),
    });
  });

  it("handles timezone-naive ISO timestamps from server", () => {
    // Server returns timestamps without "Z" suffix, e.g. "2026-03-13T16:34:02.772000"
    const clockStopTimestamp = "2026-03-13T16:34:02.772000"; // no Z!
    const expectedMs = new Date("2026-03-13T16:34:02.772000Z").getTime(); // should parse as UTC
    const nowMs = expectedMs + 5000; // 5 seconds after stoppage

    const events = [
      {
        type: "GameStoppage",
        timestamp: clockStopTimestamp,
        period: 1,
        team_id: "E2E_AWAY",
        data: {
          stoppage_type: "ClockStop",
          reason: "OutOfBounds",
          trigger_action: "OutOfBounds",
          trigger_team_id: "E2E_AWAY",
          trigger_player_id: null,
        },
      },
    ] as any;

    const breakdown = computeIneffectiveBreakdown(
      events,
      ["E2E_HOME"],
      ["E2E_AWAY"],
      nowMs,
    );

    expect(breakdown.totals.away).toBeGreaterThanOrEqual(4.9);
    expect(breakdown.totals.byAction.OutOfBounds.away).toBeGreaterThanOrEqual(
      4.9,
    );
    expect(breakdown.active?.startMs).toBe(expectedMs);
  });
});
