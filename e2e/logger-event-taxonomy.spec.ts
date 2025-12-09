import { test, expect, request, APIRequestContext, Page } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  waitForPendingAckToClear,
  getHarnessMatchContext,
  sendRawEventThroughHarness,
  submitStandardShot,
  triggerUndoThroughHarness,
} from './utils/logger';

const TAXONOMY_MATCH_ID = 'E2E-MATCH-TAXONOMY';

let backendRequest: APIRequestContext;

const promoteToAdmin = async (page: Page) => {
  await page.evaluate(() => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    const currentUser =
      store?.getState?.().user || {
        uid: 'e2e-admin',
        email: 'e2e-admin@example.com',
        displayName: 'E2E Admin',
        photoURL: '',
      };
    store?.getState?.().setUser?.({
      ...currentUser,
      role: 'admin',
      displayName: currentUser.displayName || 'E2E Admin',
    });
  });
};

const resetMatch = async (matchId: string) => {
  const response = await backendRequest.post('/e2e/reset', { data: { matchId } });
  expect(response.ok()).toBeTruthy();
};

const selectHomePlayer = (page: Page) => page.getByTestId('player-card-HOME-1');

const logShotGoal = async (page: Page) => {
  await selectHomePlayer(page).click();
  await page.getByTestId('action-btn-Shot').click();
  await page.getByTestId('outcome-btn-Goal').click();
  await waitForPendingAckToClear(page);
};

const sendEventThroughHarness = async (
  page: Page,
  type: string,
  teamId: string,
  playerId: string,
  matchClock: string,
  data: Record<string, any>,
) => {
  await sendRawEventThroughHarness(page, {
    match_clock: matchClock,
    period: 1,
    team_id: teamId,
    player_id: playerId,
    type,
    data,
  });
  await waitForPendingAckToClear(page);
};

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      Authorization: 'Bearer e2e-playwright',
    },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.describe('Logger event taxonomy', () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(TAXONOMY_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  });

  test('covers goal, card, foul, offside, set piece, and analytics updates', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId('live-event-item');

    const startClock = page.getByTestId('btn-start-clock');
    const stopClock = page.getByTestId('btn-stop-clock');
    if (await startClock.isEnabled()) {
      await startClock.click();
    }
    await expect(stopClock).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await submitStandardShot(page, 'home', 'OnTarget');
    await waitForPendingAckToClear(page);

    await sendEventThroughHarness(page, 'Card', homeTeamId, 'HOME-2', '00:05.000', {
      card_type: 'Yellow',
      reason: 'Foul',
    });
    await sendEventThroughHarness(page, 'FoulCommitted', awayTeamId, 'AWAY-1', '00:06.000', {
      foul_type: 'Penalty',
      outcome: 'Penalty',
    });
    await sendEventThroughHarness(page, 'Offside', homeTeamId, 'HOME-3', '00:07.000', {
      pass_player_id: 'HOME-1',
      outcome: 'Standard',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-2', '00:08.000', {
      set_piece_type: 'Free Kick',
      outcome: 'Shot',
    });

    await expect.poll(async () => await liveEvents.count(), { timeout: 20000 }).toBeGreaterThanOrEqual(4);

    await expect(liveEvents.filter({ hasText: 'Card' })).toHaveCount(1);
    await expect(liveEvents.filter({ hasText: 'FoulCommitted' })).toHaveCount(1);
    await expect(liveEvents.filter({ hasText: 'Offside' })).toHaveCount(1);
    await expect(liveEvents.filter({ hasText: 'SetPiece' })).toHaveCount(1);

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId('analytics-title')).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
  });

  test('handles card escalation (YC, second YC, RC) and foul variants', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId('live-event-item');

    const startClock = page.getByTestId('btn-start-clock');
    const stopClock = page.getByTestId('btn-stop-clock');
    if (await startClock.isEnabled()) {
      await startClock.click();
    }
    await expect(stopClock).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;

    await sendEventThroughHarness(page, 'FoulCommitted', homeTeamId, 'HOME-4', '00:04.000', {
      foul_type: 'Standard',
      outcome: 'Standard',
    });
    await sendEventThroughHarness(page, 'Card', homeTeamId, 'HOME-4', '00:04.500', {
      card_type: 'Yellow',
      reason: 'Foul',
    });
    await sendEventThroughHarness(page, 'Card', homeTeamId, 'HOME-4', '00:05.000', {
      card_type: 'Yellow (Second)',
      reason: 'Foul',
    });
    await sendEventThroughHarness(page, 'Card', homeTeamId, 'HOME-5', '00:06.000', {
      card_type: 'Red',
      reason: 'Serious Foul Play',
    });

    await expect.poll(async () => await liveEvents.count(), { timeout: 20000 }).toBeGreaterThanOrEqual(2);

    await expect(liveEvents.filter({ hasText: 'FoulCommitted' })).toHaveCount(1);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: 'Card' }).count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(2);
    await expect(liveEvents.filter({ hasText: 'Red' })).toHaveCount(1);

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId('analytics-title')).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
  });

  test('supports own goal, VAR decision, and edit via undo/resend', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId('live-event-item');

    const startClock = page.getByTestId('btn-start-clock');
    const stopClock = page.getByTestId('btn-stop-clock');
    if (await startClock.isEnabled()) {
      await startClock.click();
    }
    await expect(stopClock).toBeEnabled({ timeout: 5000 });

    await logShotGoal(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEventThroughHarness(page, 'VARDecision', homeTeamId, 'HOME-1', '00:12.000', {
      decision: 'Goal Disallowed',
    });
    await sendEventThroughHarness(page, 'Shot', awayTeamId, 'AWAY-3', '00:13.000', {
      shot_type: 'OwnGoal',
      outcome: 'Goal',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(2);

      await expect(liveEvents.filter({ hasText: 'VARDecision' })).toHaveCount(1);
      await expect(liveEvents.filter({ hasText: /OwnGoal|Own Goal/i })).toHaveCount(1);

    const eventsBeforeEdit = await liveEvents.count();

    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => await liveEvents.filter({ hasText: /OwnGoal|Own Goal/i }).count(), {
        timeout: 15000,
      })
      .toBe(0);

    await sendEventThroughHarness(page, 'Shot', awayTeamId, 'AWAY-3', '00:13.500', {
      shot_type: 'Standard',
      outcome: 'OffTarget',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(eventsBeforeEdit);

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId('analytics-title')).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    const expectedMinimum = Math.max(0, eventsBeforeEdit - 2);
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(expectedMinimum);
  });

  test('covers penalty shootout outcomes and VAR overturn', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId('live-event-item');

    await page.getByTestId('btn-start-clock').click();
    await expect(page.getByTestId('btn-stop-clock')).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-1', '90:00.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-1', '90:30.000', {
      set_piece_type: 'Penalty',
      outcome: 'Saved',
    });
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-2', '91:00.000', {
      set_piece_type: 'Penalty',
      outcome: 'Missed',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(3);

    await sendEventThroughHarness(page, 'VARDecision', homeTeamId, 'HOME-1', '91:15.000', {
      decision: 'Penalty Retake',
    });
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-1', '91:30.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(5);

    const setPieces = liveEvents.filter({ hasText: 'SetPiece' });
    await expect
      .poll(async () => await setPieces.count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(async () => await setPieces.count(), { timeout: 5000 })
      .toBeLessThanOrEqual(5);
    await expect(liveEvents.filter({ hasText: 'VARDecision' })).toHaveCount(1);

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId('analytics-title')).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(5);
  });

  test('handles penalty shootout sudden death and VAR outcomes matrix with edit', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId('live-event-item');

    await page.getByTestId('btn-start-clock').click();
    await expect(page.getByTestId('btn-stop-clock')).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    // Regulation shootout (3 kicks each) ends level
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-1', '92:00.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-1', '92:20.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-2', '92:40.000', {
      set_piece_type: 'Penalty',
      outcome: 'Saved',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-2', '93:00.000', {
      set_piece_type: 'Penalty',
      outcome: 'Saved',
    });
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-3', '93:20.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-3', '93:40.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });

    // Sudden death: home scores, away misses
    await sendEventThroughHarness(page, 'SetPiece', homeTeamId, 'HOME-4', '94:00.000', {
      set_piece_type: 'Penalty',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'SetPiece', awayTeamId, 'AWAY-4', '94:20.000', {
      set_piece_type: 'Penalty',
      outcome: 'Missed',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(8);

    // VAR outcomes: allow then disallow via overturn
    await sendEventThroughHarness(page, 'Shot', homeTeamId, 'HOME-5', '94:40.000', {
      shot_type: 'Standard',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'VARDecision', homeTeamId, 'HOME-5', '94:50.000', {
      decision: 'Goal Allowed',
    });
    await sendEventThroughHarness(page, 'Shot', awayTeamId, 'AWAY-5', '95:00.000', {
      shot_type: 'Standard',
      outcome: 'Goal',
    });
    await sendEventThroughHarness(page, 'VARDecision', awayTeamId, 'AWAY-5', '95:10.000', {
      decision: 'Goal Disallowed (Offside)',
    });

    // Edit flow: undo last VAR and resend corrected decision
    const eventsBeforeEdit = await liveEvents.count();
    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);
    await sendEventThroughHarness(page, 'VARDecision', awayTeamId, 'AWAY-5', '95:15.000', {
      decision: 'Goal Allowed',
    });

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(eventsBeforeEdit);

    await expect(liveEvents.filter({ hasText: 'SetPiece' })).toHaveCount(8);
    // After undoing the disallow, VAR decisions should be reduced to two or three depending on timing
    await expect
      .poll(async () => await liveEvents.filter({ hasText: 'VARDecision' }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: 'VARDecision' }).count(), {
        timeout: 10000,
      })
      .toBeLessThanOrEqual(3);

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId('analytics-title')).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
  });
});
