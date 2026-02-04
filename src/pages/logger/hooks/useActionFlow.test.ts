import { renderHook, act } from "@testing-library/react";
import { useActionFlow } from "./useActionFlow";
import { Match, Player, Team } from "../types";
import { describe, it, expect, vi } from "vitest";

describe("useActionFlow", () => {
  const mockPlayer1: Player = {
    id: "p1",
    full_name: "Player One",
    jersey_number: 10,
    position: "FW",
    is_starter: true,
  };

  const mockPlayer2: Player = {
    id: "p2",
    full_name: "Player Two",
    jersey_number: 8,
    position: "MF",
    is_starter: true,
  };

  const mockTeam: Team = {
    id: "t1",
    name: "Home Team",
    short_name: "HOM",
    players: [mockPlayer1, mockPlayer2],
  };

  const mockMatch: Match = {
    id: "m1",
    home_team: mockTeam,
    away_team: { ...mockTeam, id: "t2", name: "Away Team" },
    status: "Live",
    match_time_seconds: 100,
    period_timestamps: {},
  };

  const defaultProps = {
    match: mockMatch,
    globalClock: "00:10.000",
    operatorPeriod: 1,
    selectedTeam: "home" as const,
    isSubmitting: false,
    cardYellowCounts: {},
    expelledPlayerIds: new Set<string>(),
    recentEvents: [],
    onIneffectiveTrigger: undefined,
    sendEvent: vi.fn(),
  };

  it("should transition to selectRecipient when action requires recipient", () => {
    const { result } = renderHook(() => useActionFlow(defaultProps));

    // 1. Select Player
    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    expect(result.current.currentStep).toBe("selectAction");
    expect(result.current.selectedPlayer?.id).toBe(mockPlayer1.id);

    // 2. Select Action that requires recipient (e.g., 'Pass')
    // Note: In the actual code, handleActionClick just sets action, flow waits for outcome
    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectOutcome");
    expect(result.current.selectedAction).toBe("Pass");

    // 3. Select Outcome
    act(() => {
      result.current.handleOutcomeClick("Complete");
    });

    // BEFORE FIX: This might fail if it auto-resolves to mockPlayer2
    expect(result.current.currentStep).toBe("selectRecipient");

    // Ensure no event was sent yet
    expect(defaultProps.sendEvent).not.toHaveBeenCalled();
  });

  it('should use globalClock when operatorClock is default "00:00.000"', () => {
    const props = {
      ...defaultProps,
      globalClock: "12:34.000",
    };

    // We need to invoke buildEventPayload logic, which is internal.
    // We can test this by triggering an event dispatch.

    const { result } = renderHook(() => useActionFlow(props));

    // 1. Select Player
    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });

    // 2. Select Action (e.g. Clearance which doesn't need recipient)
    act(() => {
      result.current.handleActionClick("Clearance");
    });

    // 3. Select Outcome
    act(() => {
      result.current.handleOutcomeClick("Success");
    });

    // Check dispatched event
    expect(props.sendEvent).toHaveBeenCalled();
    const lastCall = (props.sendEvent as any).mock.calls[0][0];
    expect(lastCall.match_clock).toBe("12:34.000");
  });
});
