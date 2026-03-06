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
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
    };
    const { result } = renderHook(() => useActionFlow(props));

    // 1. Select Player
    act(() => {
      result.current.handlePlayerClick(mockPlayer1);
    });
    expect(result.current.currentStep).toBe("selectZone");
    expect(result.current.selectedPlayer?.id).toBe(mockPlayer1.id);

    // 1b. Select Zone
    act(() => {
      result.current.handleZoneSelect(7);
    });
    expect(result.current.currentStep).toBe("selectAction");

    // 2. Select Action that requires recipient (e.g., 'Pass')
    // Pass now goes to selectDestination — field-based flow
    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");
    expect(result.current.selectedAction).toBe("Pass");

    // 3. Click a teammate on the field → outcome = Complete → selectRecipient
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 60,
          yPercent: 40,
          statsbomb: [72, 40],
          isOutOfBounds: false,
        },
        targetPlayer: mockPlayer2,
      });
    });

    // Pass to teammate dispatches immediately
    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Pass");
    expect(payload.data.outcome).toBe("Complete");
    expect(result.current.currentStep).toBe("selectPlayer");
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

    // 1b. Select Zone
    act(() => {
      result.current.handleZoneSelect(7);
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

  it("should route quick Shot to destination selection and dispatch via field click", () => {
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(7);
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("Shot");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(0);
    expect(result.current.currentStep).toBe("selectDestination");

    // Click empty field area — Shot resolves to OffTarget
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 80,
          yPercent: 50,
          statsbomb: [96, 50],
          isOutOfBounds: false,
        },
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Shot");
    expect(payload.data.outcome).toBe("OffTarget");
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(10);
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

  it("should route quick Pass to destination and complete via teammate click", () => {
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(7);
    });
    expect(result.current.currentStep).toBe("selectQuickAction");

    act(() => {
      result.current.handleQuickActionSelect("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    // Click a teammate → Complete pass
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 60,
          yPercent: 40,
          statsbomb: [72, 40],
          isOutOfBounds: false,
        },
        targetPlayer: mockPlayer2,
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Pass");
    expect(payload.data.outcome).toBe("Complete");
    expect(payload.data.receiver_id).toBe("p2");
  });

  it("should dispatch Pass Out from quick action destination and trigger ineffective", () => {
    const onIneffectiveTrigger = vi.fn();
    const props = {
      ...defaultProps,
      sendEvent: vi.fn(),
      onIneffectiveTrigger,
    };

    const { result } = renderHook(() => useActionFlow(props));

    act(() => {
      result.current.handlePlayerClick(mockPlayer1, {
        xPercent: 42,
        yPercent: 44,
      });
    });

    act(() => {
      result.current.handleZoneSelect(7);
    });

    act(() => {
      result.current.handleQuickActionSelect("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    // Click out-of-bounds border zone
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 100,
          yPercent: 50,
          statsbomb: [120, 50],
          isOutOfBounds: true,
          outOfBoundsEdge: "right",
        },
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Pass");
    expect(payload.data.outcome).toBe("Out");
    expect(payload.data.out_of_bounds).toBe(true);
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should log Pass Out via destination click and trigger ineffective without recipient step", () => {
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(7);
    });
    expect(result.current.currentStep).toBe("selectAction");

    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    // Click out-of-bounds border zone
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 0,
          yPercent: 50,
          statsbomb: [0, 50],
          isOutOfBounds: true,
          outOfBoundsEdge: "top",
        },
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Pass");
    expect(payload.data.outcome).toBe("Out");
    expect(payload.data.out_of_bounds).toBe(true);
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(7);
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

  it("should dispatch Corner quick action and trigger OutOfBounds ineffective", () => {
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
    act(() => {
      result.current.handleZoneSelect(7);
    });
    act(() => {
      result.current.handleQuickActionSelect("Corner");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("SetPiece");
    expect(payload.data).toEqual(
      expect.objectContaining({
        set_piece_type: "Corner",
        outcome: "Complete",
      }),
    );

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "OutOfBounds",
        teamId: "t2",
      }),
    );
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should dispatch Throw-in quick action and trigger OutOfBounds ineffective", () => {
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
    act(() => {
      result.current.handleZoneSelect(7);
    });
    act(() => {
      result.current.handleQuickActionSelect("Throw-in");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("SetPiece");
    expect(payload.data).toEqual(
      expect.objectContaining({
        set_piece_type: "Throw-in",
        outcome: "Complete",
      }),
    );

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "OutOfBounds",
        teamId: "t2",
      }),
    );
    expect(result.current.currentStep).toBe("selectPlayer");
  });

  it("should dispatch Shot Out quick action as Shot OffTarget with OutOfBounds ineffective", () => {
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
    act(() => {
      result.current.handleZoneSelect(7);
    });
    act(() => {
      result.current.handleQuickActionSelect("Shot Out");
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.type).toBe("Shot");
    expect(payload.data).toEqual(
      expect.objectContaining({
        shot_type: "Standard",
        outcome: "OffTarget",
        destination_type: "out_of_bounds",
        out_of_bounds: true,
      }),
    );

    expect(onIneffectiveTrigger).toHaveBeenCalledTimes(1);
    expect(onIneffectiveTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: "OutOfBounds",
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
      result.current.handleZoneSelect(7);
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
      result.current.handleZoneSelect(7);
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
    expect(result.current.currentStep).toBe("selectZone");

    act(() => {
      result.current.handleZoneSelect(7);
    });
    expect(result.current.currentStep).toBe("selectAction");

    act(() => {
      result.current.handleActionClick("Pass");
    });
    expect(result.current.currentStep).toBe("selectDestination");

    // Click out-of-bounds border zone
    act(() => {
      result.current.handleDestinationClick({
        destination: {
          xPercent: 100,
          yPercent: 50,
          statsbomb: [120, 50],
          isOutOfBounds: true,
          outOfBoundsEdge: "right",
        },
      });
    });

    expect(props.sendEvent).toHaveBeenCalledTimes(1);
    const payload = (props.sendEvent as any).mock.calls[0][0];
    expect(payload.team_id).toBe("t1");
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
      result.current.handleZoneSelect(7);
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
