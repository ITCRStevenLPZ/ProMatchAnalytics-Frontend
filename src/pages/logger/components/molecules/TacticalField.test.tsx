import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TacticalField from "./TacticalField";
import { PITCH_HEIGHT, PITCH_WIDTH } from "../../utils/heatMapZones";

const baseProps = {
  homeTeamName: "HOME",
  awayTeamName: "AWAY",
  homePlayers: [],
  awayPlayers: [],
  getDisplayPosition: () => ({ x: 50, y: 50 }),
  onPlayerDragEnd: vi.fn(),
  onPlayerClick: vi.fn(),
};

describe("TacticalField markings", () => {
  it("renders the bottom sideline fully inside the viewBox to prevent clipping", () => {
    render(<TacticalField {...baseProps} />);

    expect(screen.getByTestId("soccer-field")).toBeInTheDocument();
    expect(screen.getByTestId("tactical-field-markings")).toBeInTheDocument();

    const boundary = screen.getByTestId("tactical-field-boundary");
    expect(boundary).toHaveAttribute("x", "0.2");
    expect(boundary).toHaveAttribute("y", "0.2");
    expect(boundary).toHaveAttribute("width", String(PITCH_WIDTH - 0.4));
    expect(boundary).toHaveAttribute("height", String(PITCH_HEIGHT - 0.4));

    const bottomSideline = screen.getByTestId("tactical-bottom-sideline");
    expect(bottomSideline).toHaveAttribute("x1", "0.2");
    expect(bottomSideline).toHaveAttribute("x2", String(PITCH_WIDTH - 0.2));
    expect(bottomSideline).toHaveAttribute("y1", String(PITCH_HEIGHT - 0.2));
    expect(bottomSideline).toHaveAttribute("y2", String(PITCH_HEIGHT - 0.2));
  });
});
