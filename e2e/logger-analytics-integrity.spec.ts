import { test, expect, request, type APIRequestContext, type Page } from '@playwright/test';

import {
  BACKEND_BASE_URL,
  getHarnessMatchContext,
  gotoLoggerPage,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
  triggerUndoThroughHarness,
} from './utils/logger';

const ANALYTICS_MATCH_ID = 'E2E-MATCH-ANALYTICS-INTEGRITY';

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

const sendEvent = async (
  page: Page,
  payload: { match_clock: string; period?: number; team_id: string; player_id: string; type: string; data: Record<string, any> },
) => {
  await sendRawEventThroughHarness(page, {
    period: payload.period ?? 1,
    ...payload,
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

test.beforeEach(async () => {
  const response = await backendRequest.post('/e2e/reset', { data: { matchId: ANALYTICS_MATCH_ID } });
  expect(response.ok()).toBeTruthy();
});

test.describe('Logger analytics integrity', () => {
  test('keeps KPIs consistent after mixed events, undo, and reload', async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    await gotoLoggerPage(page, ANALYTICS_MATCH_ID);
    await setRole(page, 'admin');

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    // Mixed event set to populate analytics
    await sendEvent(page, {
      match_clock: '00:05.000',
      team_id: homeTeamId,
      player_id: 'HOME-1',
      type: 'Pass',
      data: { pass_type: 'Standard', outcome: 'Complete', receiver_id: 'HOME-2', receiver_name: 'Home Player 2' },
    });
    await sendEvent(page, {
      match_clock: '00:06.000',
      team_id: awayTeamId,
      player_id: 'AWAY-1',
      type: 'Pass',
      data: { pass_type: 'Standard', outcome: 'Complete', receiver_id: 'AWAY-2', receiver_name: 'Away Player 2' },
    });
    await sendEvent(page, {
      match_clock: '00:07.000',
      team_id: homeTeamId,
      player_id: 'HOME-3',
      type: 'Shot',
      data: { shot_type: 'Standard', outcome: 'OnTarget' },
    });
    await sendEvent(page, {
      match_clock: '00:08.000',
      team_id: awayTeamId,
      player_id: 'AWAY-3',
      type: 'Shot',
      data: { shot_type: 'Standard', outcome: 'Goal' },
    });
    await sendEvent(page, {
      match_clock: '00:09.000',
      team_id: homeTeamId,
      player_id: 'HOME-4',
      type: 'FoulCommitted',
      data: { foul_type: 'Tackle', outcome: 'Yellow' },
    });
    await sendEvent(page, {
      match_clock: '00:10.000',
      team_id: awayTeamId,
      player_id: 'AWAY-4',
      type: 'Interception',
      data: { interception_type: 'Ground' },
    });

    // Toggle analytics and verify key summaries include expected totals
    await page.getByTestId('toggle-analytics').click();
    const analyticsPanel = page.getByTestId('analytics-panel');
    await expect(analyticsPanel).toBeVisible({ timeout: 15000 });

    await expect(analyticsPanel).toContainText(/6\s*(Eventos|Events)/i);
    await expect(analyticsPanel).toContainText(/Pass(es)?|Pases/i);
    await expect(analyticsPanel).toContainText(/Shot(s)?|Tiros?/i);
    await expect(analyticsPanel).toContainText(/Fouls?|Faltas?/i);
    await expect(analyticsPanel).toContainText(/Interceptions?|Intercepciones?/i);

    // Undo the last event and ensure totals drop
    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);
    await expect(analyticsPanel).toContainText(/5\s*(Eventos|Events)/i);

    // Reload and confirm analytics stay consistent
    await page.reload();
    await page.getByTestId('toggle-analytics').click();
    const analyticsPanelReloaded = page.getByTestId('analytics-panel');
    await expect(analyticsPanelReloaded).toBeVisible({ timeout: 15000 });
    await expect(analyticsPanelReloaded).toContainText(/5\s*(Eventos|Events)/i);
  });
});
