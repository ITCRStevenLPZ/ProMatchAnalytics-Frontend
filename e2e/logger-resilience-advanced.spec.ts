import { test, expect, request, type APIRequestContext } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  forceSocketDisconnect,
  forceSocketReconnect,
  getQueuedBadge,
  getHarnessMatchContext,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  submitStandardPass,
  submitStandardShot,
  waitForPendingAckToClear,
} from './utils/logger';

const RES_MATCH_ID = 'E2E-MATCH-RES-ADVANCED';

let backendRequest: APIRequestContext;

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

test.beforeEach(async () => {
  const response = await backendRequest.post('/e2e/reset', { data: { matchId: RES_MATCH_ID } });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger resilience advanced', () => {
  test('recovers from drop with queued flush, out-of-order reconciliation, and duplicate suppression', async ({ page }) => {
    test.setTimeout(120000);

    const queuedBadge = getQueuedBadge(page);

    await gotoLoggerPage(page, RES_MATCH_ID);
    await resetHarnessFlow(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    // Initial online event
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    // Drop connection and queue optimistic events
    await forceSocketDisconnect(page);
    await resetHarnessFlow(page, 'home');
    await submitStandardPass(page, 'home'); // queued #1
    await resetHarnessFlow(page, 'away');
    await submitStandardShot(page, 'away', 'OnTarget'); // queued #2

    await expect(queuedBadge).toBeVisible({ timeout: 10000 });
    await expect(queuedBadge).toContainText(/^2\D*/i);

    // Reconnect to flush queue
    await forceSocketReconnect(page);
    await waitForPendingAckToClear(page);
    await expect(queuedBadge).toBeHidden({ timeout: 10000 });

    // Inject out-of-order server event (earlier clock) after reconnect
    await sendRawEventThroughHarness(page, {
      match_clock: '00:01.000',
      period: 1,
      team_id: homeTeamId,
      player_id: 'HOME-3',
      type: 'FoulCommitted',
      data: {
        foul_type: 'Handball',
        outcome: 'FreeKick',
      },
    });

    // Inject a duplicate of the first pass to ensure suppression and clearable banner
    await sendRawEventThroughHarness(page, {
      match_clock: '00:00.500',
      period: 1,
      team_id: homeTeamId,
      player_id: 'HOME-1',
      type: 'Pass',
      data: {
        pass_type: 'Standard',
        outcome: 'Complete',
        receiver_id: 'HOME-2',
        receiver_name: 'Home Player 2',
      },
    });

    const duplicateBanner = page.getByTestId('duplicate-banner');
    await expect(duplicateBanner).toBeVisible({ timeout: 5000 });
    await duplicateBanner.getByRole('button').first().click();
    await expect(duplicateBanner).toBeHidden({ timeout: 5000 });

    await expect
      .poll(async () => await page.getByTestId('live-event-item').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(4);

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    await expect
      .poll(async () => await page.getByTestId('live-event-item').count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(4);
  });
});
