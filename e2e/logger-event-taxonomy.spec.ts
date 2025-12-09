import { test, expect, request, APIRequestContext, Page } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  waitForPendingAckToClear,
  getHarnessMatchContext,
  sendRawEventThroughHarness,
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

    const startBtn = page.getByTestId('btn-start-clock');
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(page.getByTestId('btn-stop-clock')).toBeEnabled({ timeout: 5000 });

    await logShotGoal(page);
    await expect.poll(async () => await liveEvents.count(), { timeout: 15000 }).toBe(1);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

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

    await expect.poll(async () => await liveEvents.count(), { timeout: 20000 }).toBeGreaterThanOrEqual(5);

    await expect(liveEvents.filter({ hasText: 'Goal' })).toHaveCount(1);
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
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(5);
  });
});
