import { test, expect, request, APIRequestContext } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from './utils/logger';

let backendRequest: APIRequestContext;
const BASIC_MATCH_ID = 'E2E-MATCH-BASIC';

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
    data: { matchId: BASIC_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger core flows', () => {
  test.describe.configure({ mode: 'serial' });

  test('records a pass event and clears pending acknowledgments', async ({ page }) => {
    await gotoLoggerPage(page, BASIC_MATCH_ID);
    await resetHarnessFlow(page);

    await submitStandardPass(page);

    const pendingBadge = page.getByTestId('pending-ack-badge');

    await waitForPendingAckToClear(page);
    await expect(pendingBadge).toBeHidden({ timeout: 10000 });

    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId('live-event-item').first()).toContainText('Pass');
  });

  test('rehydrates persisted events after a reload', async ({ page }) => {
    await gotoLoggerPage(page, BASIC_MATCH_ID);
    await resetHarnessFlow(page);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId('live-event-item').first()).toContainText('Pass');
  });
});
