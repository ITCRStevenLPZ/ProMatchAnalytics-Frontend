import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TeamSelector from "./TeamSelector";

const t = ((key: string, fallback?: string) => fallback ?? key) as any;

describe("TeamSelector touch interactions", () => {
  it("triggers undo once for touch pointerup followed by synthetic click", () => {
    const onUndo = vi.fn();

    render(
      <TeamSelector
        isFlipped={false}
        onFlip={() => {}}
        onUndo={onUndo}
        undoDisabled={false}
        t={t}
      />,
    );

    const undoButton = screen.getByTestId("undo-button");

    fireEvent.pointerUp(undoButton, { pointerType: "touch" });
    fireEvent.click(undoButton);

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("keeps mouse click undo behavior", () => {
    const onUndo = vi.fn();

    render(
      <TeamSelector
        isFlipped={false}
        onFlip={() => {}}
        onUndo={onUndo}
        undoDisabled={false}
        t={t}
      />,
    );

    fireEvent.click(screen.getByTestId("undo-button"));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
