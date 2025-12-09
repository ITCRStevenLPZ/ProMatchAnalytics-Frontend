import { expect, Page } from '@playwright/test';

interface HarnessApi {
  resetFlow?: () => void;
  setSelectedTeam?: (team: 'home' | 'away') => void;
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

export const MATCH_ID = 'E2E-MATCH';
export const BACKEND_BASE_URL =
  process.env.PROMATCH_E2E_BACKEND_URL ?? 'http://127.0.0.1:8000';

export const gotoLoggerPage = async (
  page: Page,
  matchId: string = MATCH_ID,
): Promise<void> => {
  await page.goto(`/matches/${matchId}/logger`);
  await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
};

export const resetHarnessFlow = async (page: Page, team: 'home' | 'away' = 'home'): Promise<void> => {
  await page.evaluate((selectedTeam) => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    harness?.setSelectedTeam?.(selectedTeam);
    harness?.resetFlow?.();
  }, team);
};

const playerIdForTeam = (team: 'home' | 'away'): string =>
  team === 'home' ? 'HOME-1' : 'AWAY-1';

const recipientLocatorForTeam = (page: Page, team: 'home' | 'away') => {
  const prefix = team === 'home' ? 'recipient-card-HOME-' : 'recipient-card-AWAY-';
  return page.locator(`[data-testid^="${prefix}"]`).first();
};

const getHarnessCurrentStep = async (page: Page): Promise<string | null> => {
  return page.evaluate(() => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getCurrentStep ? harness.getCurrentStep() : null;
  });
};

export const submitStandardPass = async (
  page: Page,
  team: 'home' | 'away' = 'home',
): Promise<void> => {
  await page.getByTestId(`player-card-${playerIdForTeam(team)}`).click();
  await page.getByTestId('action-btn-Pass').click();
  await page.getByTestId('outcome-btn-Complete').click();
  let currentStep = await getHarnessCurrentStep(page);
  if (currentStep === 'selectOutcome') {
    await page.waitForTimeout(50);
    currentStep = await getHarnessCurrentStep(page);
  }

  if (currentStep === 'selectRecipient') {
    const recipient = recipientLocatorForTeam(page, team);
    await expect(recipient.first()).toBeVisible({ timeout: 5000 });
    await recipient.first().click();
  }
};

export const submitStandardShot = async (
  page: Page,
  team: 'home' | 'away' = 'home',
  outcome: 'Goal' | 'OnTarget' | 'OffTarget' | 'Blocked' = 'OnTarget',
): Promise<void> => {
  await page.getByTestId(`player-card-${playerIdForTeam(team)}`).click();
  await page.getByTestId('action-btn-Shot').click();
  await page.getByTestId(`outcome-btn-${outcome}`).click();
};

export const waitForPendingAckToClear = async (page: Page): Promise<void> => {
  const badge = page.getByTestId('pending-ack-badge');
  try {
    await badge.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    // Badge may resolve before we observe it; fall through to hidden assertion.
  }
  await expect(badge).toBeHidden({ timeout: 10000 });
};

export const expectLiveEventCount = async (
  page: Page,
  count: number,
): Promise<void> => {
  await expect(page.getByTestId('live-event-item')).toHaveCount(count, {
    timeout: 10000,
  });
};

export const getQueuedBadge = (page: Page) => page.getByTestId('queued-badge');

export const getHarnessMatchContext = async (page: Page): Promise<HarnessMatchContext | null> => {
  return page.evaluate(() => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getMatchContext ? harness.getMatchContext() : null;
  });
};

export const sendRawEventThroughHarness = async (page: Page, payload: Record<string, any>): Promise<void> => {
  await page.evaluate((data) => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    harness?.sendRawEvent?.(data);
  }, payload);
};

export const triggerUndoThroughHarness = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    if (harness?.undoLastEvent) {
      await harness.undoLastEvent();
    }
  });
};

export const getQueueSnapshot = async (page: Page): Promise<QueueSnapshot | null> => {
  return page.evaluate(() => {
    const harness = (window as unknown as { __PROMATCH_LOGGER_HARNESS__?: HarnessApi }).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getQueueSnapshot ? harness.getQueueSnapshot() : null;
  });
};

export const triggerInvalidPassEvent = async (
  page: Page,
  team: 'home' | 'away' = 'home',
): Promise<void> => {
  const context = await getHarnessMatchContext(page);
  if (!context) {
    throw new Error('Logger harness context unavailable');
  }
  const teamId = team === 'home' ? context.homeTeamId : context.awayTeamId;
  const playerId = team === 'home' ? 'HOME-1' : 'AWAY-1';
  await sendRawEventThroughHarness(page, {
    match_clock: 'invalid-clock',
    period: 1,
    team_id: teamId,
    player_id: playerId,
    type: 'Pass',
    data: {
      pass_type: 'Standard',
      outcome: 'Complete',
      receiver_id: `${team === 'home' ? 'HOME' : 'AWAY'}-2`,
      receiver_name: `${team === 'home' ? 'Home' : 'Away'} Player 2`,
    },
  });
};

export const forceSocketDisconnect = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const harness = (window as unknown as { __PROMATCH_SOCKET_TEST__?: SocketHarnessApi }).__PROMATCH_SOCKET_TEST__;
    harness?.forceDisconnect?.();
  });
};

export const forceSocketReconnect = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const harness = (window as unknown as { __PROMATCH_SOCKET_TEST__?: SocketHarnessApi }).__PROMATCH_SOCKET_TEST__;
    harness?.reconnect?.();
  });
};
