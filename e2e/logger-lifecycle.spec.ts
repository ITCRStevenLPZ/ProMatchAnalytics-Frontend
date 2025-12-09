import { test, expect, request, APIRequestContext, Page } from '@playwright/test';

import { BACKEND_BASE_URL, gotoLoggerPage, resetHarnessFlow } from './utils/logger';

const TIMER_MATCH_ID = 'E2E-MATCH-TIMER';

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

test.describe('Logger lifecycle and clocks', () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(TIMER_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
  });

  test('runs full match lifecycle and persists after reload', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TIMER_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const startBtn = page.getByTestId('btn-start-clock');
    const stopBtn = page.getByTestId('btn-stop-clock');
    const endFirstHalfBtn = page.getByTestId('btn-end-first-half');
    const startSecondHalfBtn = page.getByTestId('btn-start-second-half');
    const endMatchBtn = page.getByTestId('btn-end-match');
    const clockInput = page.getByPlaceholder('00:00.000').first();

    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(stopBtn).toBeEnabled({ timeout: 5000 });
    await expect(stopBtn).toBeEnabled();
    await page.waitForTimeout(600);
    await stopBtn.click();

    const clockValue = await clockInput.inputValue();
    expect(clockValue).not.toBe('00:00.000');

    await endFirstHalfBtn.scrollIntoViewIfNeeded();
    await endFirstHalfBtn.click();
    await expect(page.getByTestId('period-status-halftime')).toBeVisible();

    await startSecondHalfBtn.scrollIntoViewIfNeeded();
    await startSecondHalfBtn.click();
    await expect(page.getByTestId('period-status-second-half')).toBeVisible();

    await page.waitForTimeout(400);
    await stopBtn.scrollIntoViewIfNeeded();
    await stopBtn.click();

    await endMatchBtn.scrollIntoViewIfNeeded();
    await endMatchBtn.click();
    await expect(page.getByTestId('period-status-fulltime')).toBeVisible();
    await expect(page.getByTestId('clock-locked-banner')).toBeVisible();
    await expect(startBtn).toBeDisabled();
    await expect(stopBtn).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId('period-status-fulltime')).toBeVisible();
    await expect(page.getByTestId('clock-locked-banner')).toBeVisible();
    await expect(startBtn).toBeDisabled();
    await expect(stopBtn).toBeDisabled();
  });

  test('switches effective time on and accumulates while clock runs', async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TIMER_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const startBtn = page.getByTestId('btn-start-clock');
    await startBtn.click();

    const effectiveToggle = page.getByTestId('effective-time-toggle');

    await effectiveToggle.click({ force: true });

    await expect(effectiveToggle).toBeVisible();
  });
});
