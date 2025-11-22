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
const DUPLICATE_MATCH_ID = 'E2E-MATCH-DUPLICATE';

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
  const response = await backendRequest.post('/e2e/reset', { data: { matchId: DUPLICATE_MATCH_ID } });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger duplicate handling', () => {
  test('surfaces duplicate notice when submitting the same event twice', async ({ page }) => {
    test.setTimeout(120000);
    page.on('console', (message) => {
      console.log(`[console:${message.type()}] ${message.text()}`);
    });
    page.on('pageerror', (err) => {
      console.log('[pageerror]', err.message);
    });

    await gotoLoggerPage(page, DUPLICATE_MATCH_ID);
    await resetHarnessFlow(page);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId('duplicate-banner')).toBeVisible({ timeout: 10000 });
    await expectLiveEventCount(page, 1);
  });
});
