import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOnFieldRoster } from "./useOnFieldRoster";
import type { Match } from "../types";
import type { MatchEvent } from "../../../store/useMatchLogStore";

const match: Match = {
  id: "match-1",
  status: "Live_First_Half",
  match_time_seconds: 0,
  home_team: {
    id: "home-id",
    team_id: "home-external",
    name: "Home",
    short_name: "HOM",
    players: [
      {
        id: "h1",
        full_name: "Home Starter 1",
        jersey_number: 1,
        position: "DF",
        is_starter: true,
      },
      {
        id: "h2",
        full_name: "Home Starter 2",
        jersey_number: 2,
        position: "MF",
        is_starter: true,
      },
      {
        id: "h12",
        full_name: "Home Bench",
        jersey_number: 12,
        position: "FW",
        is_starter: false,
      },
    ],
  },
  away_team: {
    id: "away-id",
    team_id: "away-external",
    name: "Away",
    short_name: "AWY",
    players: [
      {
        id: "a1",
        full_name: "Away Starter 1",
        jersey_number: 1,
        position: "DF",
        is_starter: true,
      },
      {
        id: "a2",
        full_name: "Away Starter 2",
        jersey_number: 2,
        position: "MF",
        is_starter: true,
      },
    ],
  },
  period_timestamps: {},
};

const queuedSubstitutionEvent: MatchEvent = {
  match_id: "match-1",
  timestamp: "2026-02-21T10:03:00.000Z",
  client_id: "cid-queued-sub",
  match_clock: "10:03.000",
  period: 1,
  team_id: "home-id",
  player_id: "h1",
  type: "Substitution",
  data: {
    player_off_id: "h1",
    player_on_id: "h12",
  },
};

const noLiveEvents: MatchEvent[] = [];
const queuedEvents: MatchEvent[] = [queuedSubstitutionEvent];

describe("useOnFieldRoster", () => {
  it("replays queued substitutions when rebuilding on-field state", () => {
    const { result } = renderHook(() =>
      useOnFieldRoster(match, noLiveEvents, queuedEvents),
    );

    expect(result.current.onFieldIds.home.has("h1")).toBe(false);
    expect(result.current.onFieldIds.home.has("h12")).toBe(true);
  });
});
