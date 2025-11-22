import { expect, request, test } from '@playwright/test';
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from './utils/logger';

/**
 * Ensures logger-produced events surface in the viewer UI and pagination stays stable.
 */
const MATCH_ID = 'E2E-LOGGER-VIEWER';
let backendApi: Awaited<ReturnType<typeof request['newContext']>>;

test.beforeAll(async () => {
  backendApi = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      'x-playwright-e2e-secret': process.env.PLAYWRIGHT_E2E_SECRET ?? 'test-secret',
    },
  });
});

test.afterAll(async () => {
  await backendApi?.dispose();
});

test.beforeEach(async () => {
  const resetResponse = await backendApi.post('/e2e/reset', {
    data: { matchId: MATCH_ID },
  });
  expect(resetResponse.ok()).toBeTruthy();
});

test('logger events appear on viewer timeline', async ({ page, context }) => {
  await gotoLoggerPage(page, MATCH_ID);
  await resetHarnessFlow(page);
  await submitStandardPass(page);
  await waitForPendingAckToClear(page);

  const viewerPage = await context.newPage();
  await viewerPage.goto(`/matches/${MATCH_ID}/live`);
  await expect(viewerPage.getByRole('heading', { name: 'Match Log' })).toBeVisible();

  const eventItems = viewerPage.getByTestId('viewer-event-item');
  await expect(eventItems).toHaveCount(1, { timeout: 10_000 });
  await expect(eventItems.first()).toContainText('Pass');
});
