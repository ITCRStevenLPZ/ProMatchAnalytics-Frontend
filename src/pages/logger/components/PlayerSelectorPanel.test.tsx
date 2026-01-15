import { render, screen, fireEvent } from "@testing-library/react";
import PlayerSelectorPanel from "./PlayerSelectorPanel";
import { Match, Player } from "../types";
import { describe, it, expect, vi } from "vitest";

describe("PlayerSelectorPanel", () => {
  const mockPlayer1: Player = {
    id: "p1",
    full_name: "Starter Player",
    jersey_number: 10,
    position: "FW",
    is_starter: true,
  };

  const mockPlayer2: Player = {
    id: "p2",
    full_name: "Bench Player",
    jersey_number: 8,
    position: "MF",
    is_starter: false,
  };

  const mockMatch: Match = {
    id: "m1",
    home_team: {
      id: "t1",
      name: "Home Team",
      short_name: "HOM",
      players: [mockPlayer1, mockPlayer2],
    },
    away_team: {
      id: "t2",
      name: "Away Team",
      short_name: "AWY",
      players: [],
    },
    status: "Live",
    match_time_seconds: 0,
    period_timestamps: {},
  };

  const defaultProps = {
    match: mockMatch,
    selectedPlayer: null,
    selectedTeam: "home" as const,
    onFieldIds: {
      home: new Set(["p1"]), // p1 is on field
      away: new Set<string>(),
    },
    onPlayerClick: vi.fn(),
    t: (key: string) => key,
  };

  it("should enable on-field players and disable bench players", () => {
    render(<PlayerSelectorPanel {...defaultProps} />);

    // Player 1 (On Field)
    const card1 = screen.getByTestId("player-card-p1");
    expect(card1).not.toBeDisabled();

    // Player 2 (Bench)
    const card2 = screen.getByTestId("player-card-p2");
    expect(card2).toBeDisabled();
  });

  it("should call onPlayerClick only for interactive players", () => {
    render(<PlayerSelectorPanel {...defaultProps} />);

    // Click On Field Player
    fireEvent.click(screen.getByTestId("player-card-p1"));
    expect(defaultProps.onPlayerClick).toHaveBeenCalledWith(mockPlayer1);

    // Click Bench Player
    fireEvent.click(screen.getByTestId("player-card-p2"));
    expect(defaultProps.onPlayerClick).toHaveBeenCalledTimes(1); // Call count should not increase
  });

  it("should show correct section headers", () => {
    render(<PlayerSelectorPanel {...defaultProps} />);
    expect(screen.getByText("onPitch")).toBeInTheDocument();
    expect(screen.getByText("substitutes")).toBeInTheDocument();
  });
});
