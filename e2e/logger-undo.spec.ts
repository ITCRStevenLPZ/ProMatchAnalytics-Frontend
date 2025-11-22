import { test, expect, request, APIRequestContext } from '@playwright/test';
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  submitStandardPass,
  waitForPendingAckToClear,
  expectLiveEventCount,
  triggerUndoThroughHarness,
} from './utils/logger';

let backendRequest: APIRequestContext;
const UNDO_MATCH_ID = 'E2E-MATCH-UNDO';

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
    data: { matchId: UNDO_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe('logger undo workflow', () => {
  test('clears the pending badge and removes the optimistic entry', async ({ page }) => {
    await gotoLoggerPage(page, UNDO_MATCH_ID);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);

    await triggerUndoThroughHarness(page);

    await expect(page.getByTestId('pending-ack-badge')).toBeHidden({ timeout: 10000 });
    await expect(page.getByTestId('queued-badge')).toBeHidden({ timeout: 10000 });
    await expectLiveEventCount(page, 0);
  });
});
