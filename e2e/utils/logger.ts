import { expect, Page } from "@playwright/test";
import type { GameStoppageSummary } from "../../src/pages/logger/types";

interface HarnessApi {
  resetFlow?: () => void;
  setSelectedTeam?: (team: "home" | "away" | "both") => void;
  sendPassEvent?: (payload: {
    team: "home" | "away";
    passerId: string;
    recipientId: string;
  }) => void;
  sendRawEvent?: (payload: Record<string, any>) => void;
  getMatchContext?: () => HarnessMatchContext;
  undoLastEvent?: () => Promise<void> | void;
  getQueueSnapshot?: () => QueueSnapshot;
  getLiveEventSummary?: () => LiveEventSummary;
  getRecentGameStoppages?: () => GameStoppageSummary[];
  getCurrentStep?: () => string | null;
  getDriftSnapshot?: () => {
    computed: number;
    forced: number | null;
    effective: number;
    show: boolean;
  };
}

interface SocketHarnessApi {
  forceDisconnect?: () => void;
  reconnect?: () => void;
}

export interface HarnessMatchContext {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
}

interface QueuedEventSummary {
  match_id: string;
  timestamp: string;
  client_id?: string;
  type: string;
}

export interface QueueSnapshot {
  currentMatchId: string | null;
  queuedEvents: QueuedEventSummary[];
  queuedEventsByMatch: Record<string, QueuedEventSummary[]>;
}

export interface LiveEventSummary {
  liveCount: number;
  gameStoppageCount: number;
}

export const MATCH_ID = "E2E-MATCH";
export const BACKEND_BASE_URL =
  process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000";

export const gotoLoggerPage = async (
  page: Page,
  matchId: string = MATCH_ID,
): Promise<void> => {
  await page.goto(`/matches/${matchId}/logger`);
  try {
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
    return;
  } catch (err) {
    await page.reload();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
  }
};

export const resetHarnessFlow = async (
  page: Page,
  team: "home" | "away" | "both" = "home",
): Promise<void> => {
  await page.evaluate((selectedTeam) => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    harness?.setSelectedTeam?.(selectedTeam);
    harness?.resetFlow?.();
  }, team);
};

const playerIdForTeam = (team: "home" | "away"): string =>
  team === "home" ? "HOME-1" : "AWAY-1";

const recipientLocatorForTeam = (page: Page, team: "home" | "away") => {
  const prefix =
    team === "home" ? "recipient-card-HOME-" : "recipient-card-AWAY-";
  return page.locator(`[data-testid^="${prefix}"]`).first();
};

const getHarnessCurrentStep = async (page: Page): Promise<string | null> => {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getCurrentStep ? harness.getCurrentStep() : null;
  });
};

export const submitStandardPass = async (
  page: Page,
  team: "home" | "away" = "home",
): Promise<void> => {
  // Use the harness to dispatch the Pass event reliably.
  // Field-based destination interactions are validated in dedicated spec files
  // (logger-event-taxonomy, logger-ultimate-cockpit, etc.).
  const sent = await page.evaluate((selectedTeam) => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    if (!harness?.sendPassEvent) return false;
    if (selectedTeam === "home") {
      harness.sendPassEvent({
        team: "home",
        passerId: "HOME-1",
        recipientId: "HOME-2",
      });
    } else {
      harness.sendPassEvent({
        team: "away",
        passerId: "AWAY-1",
        recipientId: "AWAY-2",
      });
    }
    harness.resetFlow?.();
    return true;
  }, team);
  if (!sent) {
    throw new Error("submitStandardPass: harness not available");
  }
};

export const submitStandardShot = async (
  page: Page,
  team: "home" | "away" = "home",
  outcome: "Goal" | "OnTarget" | "OffTarget" | "Blocked" = "OnTarget",
): Promise<void> => {
  // Use the harness to dispatch the Shot event reliably.
  // Field-based destination interactions are validated in dedicated spec files.
  const sent = await page.evaluate(
    ({ selectedTeam, selectedOutcome }) => {
      const harness = (
        window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
      ).__PROMATCH_LOGGER_HARNESS__;
      if (!harness?.sendRawEvent || !harness.getMatchContext) return false;
      const ctx = harness.getMatchContext();
      const teamId = selectedTeam === "home" ? ctx.homeTeamId : ctx.awayTeamId;
      const playerId = selectedTeam === "home" ? "HOME-1" : "AWAY-1";
      harness.sendRawEvent({
        match_clock: "00:01",
        period: 1,
        team_id: teamId,
        player_id: playerId,
        type: "Shot",
        data: { outcome: selectedOutcome },
      });
      harness.resetFlow?.();
      return true;
    },
    { selectedTeam: team, selectedOutcome: outcome },
  );
  if (!sent) {
    throw new Error("submitStandardShot: harness not available");
  }
};

export const ensureClockRunning = async (page: Page): Promise<void> => {
  const stopClockButton = page.getByTestId("btn-stop-clock");

  // Stop button enabled = clock is already running (ball may be in play or out)
  const alreadyRunning = await stopClockButton.isEnabled().catch(() => false);
  if (alreadyRunning) return;

  const startClockButton = page.getByTestId("btn-start-clock");
  const startEnabled = await startClockButton.isEnabled().catch(() => false);
  if (startEnabled) {
    await startClockButton.click({ timeout: 15000 });
  }

  await expect(stopClockButton).toBeEnabled({ timeout: 15000 });
};

export const waitForPendingAckToClear = async (page: Page): Promise<void> => {
  const badge = page.getByTestId("pending-ack-badge");
  try {
    await badge.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    // Badge may resolve before we observe it; fall through to hidden assertion.
  }
  await expect(badge).toBeHidden({ timeout: 10000 });
};

export const expectLiveEventCount = async (
  page: Page,
  count: number,
): Promise<void> => {
  await expect
    .poll(async () => await page.getByTestId("live-event-item").count(), {
      timeout: 30000,
    })
    .toBeGreaterThanOrEqual(count);
};

export const getQueuedBadge = (page: Page) => page.getByTestId("queued-badge");

export const getHarnessMatchContext = async (
  page: Page,
): Promise<HarnessMatchContext | null> => {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getMatchContext ? harness.getMatchContext() : null;
  });
};

export const sendRawEventThroughHarness = async (
  page: Page,
  payload: Record<string, any>,
): Promise<void> => {
  await page.evaluate((data) => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    harness?.sendRawEvent?.(data);
  }, payload);
};

export const triggerUndoThroughHarness = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    if (harness?.undoLastEvent) {
      await harness.undoLastEvent();
    }
  });
};

export const getQueueSnapshot = async (
  page: Page,
): Promise<QueueSnapshot | null> => {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getQueueSnapshot ? harness.getQueueSnapshot() : null;
  });
};

export const getLiveEventSummary = async (
  page: Page,
): Promise<LiveEventSummary | null> => {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getLiveEventSummary ? harness.getLiveEventSummary() : null;
  });
};

export const getRecentGameStoppages = async (
  page: Page,
): Promise<GameStoppageSummary[]> => {
  return page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }
    ).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getRecentGameStoppages
      ? harness.getRecentGameStoppages()
      : [];
  });
};

export const triggerInvalidPassEvent = async (
  page: Page,
  team: "home" | "away" = "home",
): Promise<void> => {
  const context = await getHarnessMatchContext(page);
  if (!context) {
    throw new Error("Logger harness context unavailable");
  }
  const teamId = team === "home" ? context.homeTeamId : context.awayTeamId;
  const playerId = team === "home" ? "HOME-1" : "AWAY-1";
  await sendRawEventThroughHarness(page, {
    match_clock: "invalid-clock",
    period: 1,
    team_id: teamId,
    player_id: playerId,
    type: "Pass",
    data: {
      pass_type: "Standard",
      outcome: "Complete",
      receiver_id: `${team === "home" ? "HOME" : "AWAY"}-2`,
      receiver_name: `${team === "home" ? "Home" : "Away"} Player 2`,
    },
  });
};

export const forceSocketDisconnect = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_SOCKET_TEST__?: SocketHarnessApi }
    ).__PROMATCH_SOCKET_TEST__;
    harness?.forceDisconnect?.();
  });
};

export const forceSocketReconnect = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const harness = (
      window as unknown as { __PROMATCH_SOCKET_TEST__?: SocketHarnessApi }
    ).__PROMATCH_SOCKET_TEST__;
    harness?.reconnect?.();
  });
};

/**
 * After clicking a field player, select zone 7 (center of field) if the zone
 * selector is visible. This handles the mandatory zone selection step that
 * appears between player selection and action selection.
 */
export const selectZoneIfVisible = async (
  page: Page,
  zoneId = 7,
): Promise<void> => {
  const zoneSelector = page.getByTestId("field-zone-selector");
  const visible = await zoneSelector
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (visible) {
    await page.getByTestId(`zone-select-${zoneId}`).click();
  }
};
