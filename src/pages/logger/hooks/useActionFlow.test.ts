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
    position: "GK",
    is_starter: true,
  };

  const mockTeam: Team = {
    id: "t1",
    name: "Home Team",
    short_name: "HOM",
    players: [mockPlayer1, mockPlayer2],
  };

  const mockAwayPlayer1: Player = {
    id: "a1",
    full_name: "Away One",
    jersey_number: 9,
    position: "DF",
    is_starter: true,
  };

  const mockAwayKeeper: Player = {
    id: "a2",
    full_name: "Away Keeper",
    jersey_number: 1,
    position: "GK",
    is_starter: true,
  };

  const mockAwayTeam: Team = {
    id: "t2",
    name: "Away Team",
    short_name: "AWY",
    players: [mockAwayPlayer1, mockAwayKeeper],
  };

  const mockMatch: Match = {
    id: "m1",
    home_team: mockTeam,
    away_team: mockAwayTeam,
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

  it("should route quick Shot to destination and resolve keeper/defender outcomes", () => {
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 50,
        yPercent: 50,
      });
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("Shot");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(0);
    expect(result.current.currentStep).toBe("selectDestination");

    let destinationResult: any;
    act(() => {
      destinationResult = result.current.handleDestinationClick({
        destination: {
          xPercent: 90,
          yPercent: 50,
          statsbomb: [108, 40],
          isOutOfBounds: false,
          outOfBoundsEdge: null,
        },
        targetPlayer: mockAwayKeeper,
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Shot");
    expect(payload.data.outcome).toBe("Saved");
    expect(payload.data.shot_type).toBe("Standard");
    expect(destinationResult?.triggerContext).toBeNull();
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should log quick DirectShot as Shot with direct shot_type", () => {
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 52,
        yPercent: 44,
      });
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("DirectShot");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Shot");
    expect(payload.data.outcome).toBe("OnTarget");
    expect(payload.data.shot_type).toBe("Direct");
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should mark pass ineffective and auto-award corner when targeted to same-side keeper", () => {
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 48,
        yPercent: 52,
      });
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    let destinationResult: any;
    act(() => {
      destinationResult = result.current.handleDestinationClick({
        destination: {
          xPercent: 6,
          yPercent: 50,
          statsbomb: [7, 40],
          isOutOfBounds: false,
          outOfBoundsEdge: null,
        },
        targetPlayer: mockPlayer2,
      });
    });

    expect(destinationResult?.sent).toBe(true);
    expect(destinationResult?.triggerContext?.actionType).toBe("OutOfBounds");
    expect(props.sendEvent).toHaveBeenCalledTimes(2);

    const primaryPayload = (props.sendEvent as any).mock.calls[0][0];
    expect(primaryPayload.type).toBe("Pass");
    expect(primaryPayload.data.outcome).toBe("Incomplete");
    expect(primaryPayload.data.corner_awarded).toBe(true);

    const cornerPayload = (props.sendEvent as any).mock.calls[1][0];
    expect(cornerPayload.type).toBe("SetPiece");
    expect(cornerPayload.team_id).toBe("t2");
    expect(cornerPayload.data.set_piece_type).toBe("Corner");
  });

  it("should auto-award corner when pass goes behind own goalkeeper line", () => {
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 42,
        yPercent: 44,
      });
    });

    act(() => {
      result.current.handleQuickActionSelect("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    let destinationResult: any;
    act(() => {
      destinationResult = result.current.handleDestinationClick({
        destination: {
          xPercent: 0,
          yPercent: 48,
          statsbomb: [0, 38],
          isOutOfBounds: true,
          outOfBoundsEdge: "left",
        },
      });
    });

    expect(destinationResult?.sent).toBe(true);
    expect(destinationResult?.outOfBounds).toBe(true);
    expect(destinationResult?.triggerContext?.actionType).toBe("OutOfBounds");
    expect(props.sendEvent).toHaveBeenCalledTimes(2);

    const primaryPayload = (props.sendEvent as any).mock.calls[0][0];
    expect(primaryPayload.type).toBe("Pass");
    expect(primaryPayload.data.outcome).toBe("Out");
    expect(primaryPayload.data.corner_reason).toBe("behind_own_goal_line");

    const cornerPayload = (props.sendEvent as any).mock.calls[1][0];
    expect(cornerPayload.type).toBe("SetPiece");
    expect(cornerPayload.team_id).toBe("t2");
    expect(cornerPayload.data.set_piece_type).toBe("Corner");
  });

  it("should log Pass Out immediately and trigger ineffective without recipient step", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    expect(result.current.currentStep).toBe("selectAction");

    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectOutcome");

    act(() => {
      result.current.handleOutcomeClick("Out");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Pass");
    expect(payload.data.outcome).toBe("Out");
    expect(payload.data.out_of_bounds).toBe(true);

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "OutOfBounds",
        teamId: "t2",
      }),
    );
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should log quick Offside immediately without destination step", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 40,
        yPercent: 55,
      });
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("Offside");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Offside");
    expect(payload.data).toEqual(
      expect.objectContaining({ pass_player_id: null }),
    );

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "Offside",
        teamId: "t2",
      }),
    );
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should attribute foul ineffective trigger to opponent team", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    act(() => {
      result.current.handleActionClick("Foul");
    });
    act(() => {
      result.current.handleOutcomeClick("Standard");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("FoulCommitted");

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "Foul",
        teamId: "t2",
      }),
    );
  });

  it("should not trigger ineffective callback for card actions", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    act(() => {
      result.current.handleActionClick("Card");
    });
    act(() => {
      result.current.handleOutcomeClick("Yellow");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Card");
    expect(payload.data.card_type).toBe("Yellow");
    expect(onIneffectiveTrigger).not.toHaveBeenCalled();
  });

  it("should attribute ineffective trigger to acting player's team when selectedTeam differs", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      selectedTeam: "away" as const,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    expect(result.current.currentStep).toBe("selectAction");

    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectOutcome");

    act(() => {
      result.current.handleOutcomeClick("Out");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.team_id).toBe("t1");

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: "t2",
        actionType: "OutOfBounds",
      }),
    );
  });

  it("should attribute shot out-of-bounds ineffective to opponent team", () => {
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 52,
        yPercent: 51,
      });
    });
    act(() => {
      result.current.handleQuickActionSelect("Shot");
    });

    let destinationResult: any;
    act(() => {
      destinationResult = result.current.handleDestinationClick({
        destination: {
          xPercent: 100,
          yPercent: 40,
          statsbomb: [120, 32],
          isOutOfBounds: true,
          outOfBoundsEdge: "right",
        },
      });
    });

    expect(destinationResult?.sent).toBe(true);
    expect(destinationResult?.triggerContext).toEqual(
      expect.objectContaining({
        actionType: "OutOfBounds",
        teamId: "t2",
      }),
    );
  });
});
