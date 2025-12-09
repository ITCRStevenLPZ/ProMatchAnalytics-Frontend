import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from './utils/logger';

const PERMISSIONS_MATCH_ID = 'E2E-MATCH-PERMISSIONS';

let backendRequest: APIRequestContext;

const setRole = async (page: Page, role: 'viewer' | 'analyst' | 'admin') => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate((newRole) => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const currentUser =
      store?.getState?.().user || {
        uid: 'e2e-user',
        email: 'e2e-user@example.com',
        displayName: 'E2E User',
        photoURL: '',
      };
    store?.getState?.().setUser?.({ ...currentUser, role: newRole });
  }, role);
  await page.waitForFunction(
    (r) => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === r,
    role,
  );
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

test.beforeEach(async () => {
  const response = await backendRequest.post('/e2e/reset', { data: { matchId: PERMISSIONS_MATCH_ID } });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger permissions', () => {
  test('enforces viewer/analyst/admin capabilities', async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    await gotoLoggerPage(page, PERMISSIONS_MATCH_ID);
    await expect(page.getByTestId('player-card-HOME-1')).toBeVisible({ timeout: 10000 });

    const analyticsToggle = page.getByTestId('toggle-analytics');
    const analyticsPanel = page.getByTestId('analytics-panel');

    // Seed one event as admin so analytics view has data to render
    await setRole(page, 'admin');
    await resetHarnessFlow(page);
    await submitStandardPass(page);
    await waitForPendingAckToClear(page);

    // Viewer: no reset button, transitions blocked, analytics still viewable
    await setRole(page, 'viewer');
    await expect(page.getByTestId('btn-reset-clock')).toBeHidden({ timeout: 2000 });
    await expect(page.getByTestId('btn-end-first-half')).toBeDisabled({ timeout: 2000 });
    await analyticsToggle.click();
    await expect(analyticsPanel).toBeVisible({ timeout: 15000 });

    // Analyst: still blocked on admin-only controls, analytics allowed
    await setRole(page, 'analyst');
    await expect(page.getByTestId('btn-reset-clock')).toBeHidden({ timeout: 2000 });
    await expect(page.getByTestId('btn-end-first-half')).toBeDisabled({ timeout: 2000 });
    await analyticsToggle.click();
    await expect(analyticsPanel).toBeVisible({ timeout: 15000 });

    // Admin: admin-only controls available/enabled
    await setRole(page, 'admin');
    await expect(page.getByTestId('btn-reset-clock')).toBeVisible({ timeout: 2000 });
    await expect(page.getByTestId('btn-end-first-half')).toBeEnabled({ timeout: 2000 });
  });
});
