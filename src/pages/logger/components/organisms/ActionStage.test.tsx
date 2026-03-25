import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ActionStage from "./ActionStage";

const playerSelectorPanelSpy = vi.fn((props: any) => props);

vi.mock("../molecules/PlayerSelectorPanel", () => ({
  default: (props: any) => {
    playerSelectorPanelSpy(props);
    return null;
  },
}));

vi.mock("../molecules/QuickActionMenu", () => ({ default: () => null }));
vi.mock("../molecules/QuickSubstitutionPanel", () => ({ default: () => null }));
vi.mock("../molecules/QuickCardPanel", () => ({ default: () => null }));
vi.mock("../molecules/ActionSelectionPanel", () => ({ default: () => null }));
vi.mock("../molecules/OutcomeSelectionPanel", () => ({ default: () => null }));
vi.mock("../molecules/RecipientSelectionPanel", () => ({
  default: () => null,
}));
vi.mock("../molecules/FieldZoneSelector", () => ({ default: () => null }));

describe("ActionStage", () => {
  const baseProps = {
    match: {
      home_team: { short_name: "HOM", players: [] },
      away_team: { short_name: "AWY", players: [] },
    },
    manualFieldFlip: false,
    selectedPlayer: null,
    selectedTeam: "home" as const,
    expelledPlayerIds: new Set<string>(),
    cardDisciplinaryStatus: {},
    pendingCardType: null,
    setSelectedTeam: vi.fn(),
    onFieldIds: { home: new Set<string>(), away: new Set<string>() },
    handlePlayerSelection: vi.fn(),
    handleFieldPlayerSelection: vi.fn(),
    handleFieldDestination: vi.fn(),
    handleZoneSelect: vi.fn(),
    currentStep: "selectPlayer",
    cockpitLocked: false,
    fieldAnchor: null,
    handleQuickActionSelect: vi.fn(),
    handleOpenMoreActions: vi.fn(),
    resetFlow: vi.fn(),
    showFieldResume: false,
    handleModeSwitchGuarded: vi.fn(),
    priorityPlayerId: null,
    isGlobalClockRunning: true,
    clockMode: "EFFECTIVE" as const,
    isVarActive: false,
    handleQuickSubstitution: vi.fn(),
    handleCardSelection: vi.fn(),
    cancelCardSelection: vi.fn(),
    availableActions: [],
    isSubmitting: false,
    handleActionClickOverride: vi.fn(),
    selectedAction: null,
    availableOutcomes: [],
    handleOutcomeSelect: vi.fn(),
    currentTeam: null,
    eligibleRecipients: [],
    handleRecipientSelect: vi.fn(),
    positionMode: "manual" as const,
    onPositionModeChange: vi.fn(),
    t: (_key: string, fallback?: string) => fallback || "",
  };

  beforeEach(() => {
    playerSelectorPanelSpy.mockClear();
  });

  it("keeps drag lock enabled when ineffective time is not active", () => {
    render(
      <ActionStage
        {...baseProps}
        dragLocked={true}
        hasActiveIneffective={false}
      />,
    );

    expect(playerSelectorPanelSpy).toHaveBeenCalled();
    const firstCall = playerSelectorPanelSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callProps = (firstCall as [any])[0];
    expect(callProps.dragLocked).toBe(true);
  });

  it("unlocks tactical dragging while ineffective time is active", () => {
    render(
      <ActionStage
        {...baseProps}
        dragLocked={true}
        hasActiveIneffective={true}
      />,
    );

    expect(playerSelectorPanelSpy).toHaveBeenCalled();
    const firstCall = playerSelectorPanelSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callProps = (firstCall as [any])[0];
    expect(callProps.dragLocked).toBe(false);
  });

  it("unlocks tactical dragging when clock mode is INEFFECTIVE", () => {
    render(
      <ActionStage
        {...baseProps}
        dragLocked={true}
        hasActiveIneffective={false}
        clockMode="INEFFECTIVE"
      />,
    );

    expect(playerSelectorPanelSpy).toHaveBeenCalled();
    const firstCall = playerSelectorPanelSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callProps = (firstCall as [any])[0];
    expect(callProps.dragLocked).toBe(false);
  });

  it("unlocks tactical dragging when resume overlay is visible", () => {
    render(
      <ActionStage
        {...baseProps}
        dragLocked={true}
        hasActiveIneffective={false}
        showFieldResume={true}
      />,
    );

    expect(playerSelectorPanelSpy).toHaveBeenCalled();
    const firstCall = playerSelectorPanelSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    const callProps = (firstCall as [any])[0];
    expect(callProps.dragLocked).toBe(false);
  });
});
