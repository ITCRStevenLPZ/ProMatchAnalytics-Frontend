import { expect, Page } from "@playwright/test";

interface HarnessApi {
  resetFlow?: () => void;
  setSelectedTeam?: (team: "home" | "away") => void;
  sendRawEvent?: (payload: Record<string, any>) => void;
  getMatchContext?: () => HarnessMatchContext;
  undoLastEvent?: () => Promise<void> | void;
  getQueueSnapshot?: () => QueueSnapshot;
  getCurrentStep?: () => string | null;
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
  team: "home" | "away" = "home",
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
  const playerMarker = page.getByTestId(
    `field-player-${playerIdForTeam(team)}`,
  );
  await expect(playerMarker).toBeVisible({ timeout: 30000 });
  if (await playerMarker.isDisabled()) {
    const startBtn = page.getByTestId("btn-start-clock");
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const disabled = await startBtn.isDisabled().catch(() => false);
      if (!disabled) {
        await startBtn.click({ force: true });
        await page.waitForTimeout(200);
      }
    }
  }
  await playerMarker.click({ force: true });
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Pass").click();
  const outcomeBtn = page.getByTestId("outcome-btn-Complete");
  await expect(outcomeBtn).toBeVisible({ timeout: 10000 });
  await outcomeBtn.click({ force: true });
  let currentStep = await getHarnessCurrentStep(page);
  if (currentStep === "selectOutcome") {
    await page.waitForTimeout(50);
    currentStep = await getHarnessCurrentStep(page);
  }

  if (currentStep === "selectRecipient") {
    const recipient = recipientLocatorForTeam(page, team);
    await expect(recipient.first()).toBeVisible({ timeout: 5000 });
    await recipient.first().click();
  }
};

export const submitStandardShot = async (
  page: Page,
  team: "home" | "away" = "home",
  outcome: "Goal" | "OnTarget" | "OffTarget" | "Blocked" = "OnTarget",
): Promise<void> => {
  await page.getByTestId(`field-player-${playerIdForTeam(team)}`).click();
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Shot").click();
  await page.getByTestId(`outcome-btn-${outcome}`).click();
};

export const ensureClockRunning = async (page: Page): Promise<void> => {
  const stopClockButton = page.getByTestId("btn-stop-clock");
  const stopEnabled = await stopClockButton.isEnabled().catch(() => false);
  if (stopEnabled) return;

  const startClockButton = page.getByTestId("btn-start-clock");
  const startEnabled = await startClockButton.isEnabled().catch(() => false);
  if (startEnabled) {
    await startClockButton.click({ timeout: 15000 });
  } else {
    await page.getByTestId("effective-time-toggle").click({ timeout: 15000 });
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
