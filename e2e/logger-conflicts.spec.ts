import { test, expect, request, type APIRequestContext } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  getHarnessMatchContext,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  submitStandardPass,
  waitForPendingAckToClear,
} from './utils/logger';

const CONFLICT_MATCH_ID = 'E2E-MATCH-CONFLICT';

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
  const response = await backendRequest.post('/e2e/reset', {
    data: { matchId: CONFLICT_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger conflicts and deduplication', () => {
  test('handles ingest vs live duplicate with banner, manual resolution, and deduped timeline', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, CONFLICT_MATCH_ID);
    await resetHarnessFlow(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;

    const operatorClock = page.getByTestId('operator-clock-input');
    await operatorClock.fill('00:15.000');

    // Seed an ingestion-like event (server-created) before the operator logs anything
    await sendRawEventThroughHarness(page, {
      match_clock: '00:15.000',
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
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    // Operator attempts to log the same event from the cockpit (twice to force the duplicate response path)
    await resetHarnessFlow(page);
    await operatorClock.fill('00:15.000');
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    await resetHarnessFlow(page);
    await operatorClock.fill('00:15.000');
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    const duplicateBanner = page.getByTestId('duplicate-banner');
    await expect(duplicateBanner).toBeVisible({ timeout: 10000 });

    // Timeline remains deduped and queue is clear
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId('queued-badge')).toBeHidden({ timeout: 5000 });

    // Manual resolution: dismiss banner and continue
    await duplicateBanner.getByRole('button').first().click();
    await expect(duplicateBanner).toBeHidden({ timeout: 5000 });

    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden({ timeout: 20000 });

    // Reload to ensure state stays deduped and banner does not reappear
    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId('duplicate-banner')).toBeHidden({ timeout: 5000 });
  });
});
