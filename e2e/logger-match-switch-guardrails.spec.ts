import { test, expect, request, APIRequestContext } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  forceSocketDisconnect,
  getQueueSnapshot,
  getQueuedBadge,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from './utils/logger';

const MATCH_A_ID = 'E2E-MATCH-GUARD-A';
const MATCH_B_ID = 'E2E-MATCH-GUARD-B';

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
  const resetA = await backendRequest.post('/e2e/reset', {
    data: { matchId: MATCH_A_ID },
  });
  expect(resetA.ok()).toBeTruthy();

  const resetB = await backendRequest.post('/e2e/reset', {
    data: { matchId: MATCH_B_ID },
  });
  expect(resetB.ok()).toBeTruthy();
});

test.describe('Match switch guardrails', () => {
  test('keeps queued events scoped to their originating match', async ({ page }) => {
    test.setTimeout(120000);

    const queuedBadge = getQueuedBadge(page);
    await gotoLoggerPage(page, MATCH_A_ID);
    await resetHarnessFlow(page);

    await forceSocketDisconnect(page);
    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'disconnected', {
      timeout: 5000,
    });

    await submitStandardPass(page);

    await expect(queuedBadge).toBeVisible({ timeout: 10000 });
    await expect(queuedBadge).toContainText(/^1\D*/i);

    const queueSnapshotA = await getQueueSnapshot(page);
    expect(queueSnapshotA).not.toBeNull();
    expect(queueSnapshotA?.queuedEventsByMatch[MATCH_A_ID] ?? []).toHaveLength(1);

    await gotoLoggerPage(page, MATCH_B_ID);
    await expect(queuedBadge).toBeHidden();
    await expect(page.getByTestId('live-event-item')).toHaveCount(0);

    const queueSnapshotB = await getQueueSnapshot(page);
    expect(queueSnapshotB).not.toBeNull();
    expect(queueSnapshotB?.queuedEvents).toHaveLength(0);
    expect(queueSnapshotB?.queuedEventsByMatch[MATCH_A_ID] ?? []).toHaveLength(1);
    expect(queueSnapshotB?.queuedEventsByMatch[MATCH_B_ID] ?? []).toHaveLength(0);

    await gotoLoggerPage(page, MATCH_A_ID);
    await waitForPendingAckToClear(page);
    await expect(queuedBadge).toBeHidden({ timeout: 10000 });
    await page.reload();
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible();
    await expectLiveEventCount(page, 1);
  });
});
