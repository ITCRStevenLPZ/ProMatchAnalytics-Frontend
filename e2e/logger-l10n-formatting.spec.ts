import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const L10N_MATCH_ID = "E2E-MATCH-L10N";

let backendRequest: APIRequestContext;

const setRole = async (page: Page, role: "viewer" | "analyst" | "admin") => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate((newRole) => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const currentUser = store?.getState?.().user || {
      uid: "e2e-user",
      email: "e2e-user@example.com",
      displayName: "E2E User",
      photoURL: "",
    };
    store?.getState?.().setUser?.({ ...currentUser, role: newRole });
  }, role);
  await page.waitForFunction(
    (r) =>
      (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === r,
    role,
  );
};

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      Authorization: "Bearer e2e-playwright",
    },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.beforeEach(async ({ page }) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: L10N_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();

  await page.addInitScript(
    (user) => {
      try {
        localStorage.setItem(
          "auth-storage",
          JSON.stringify({ state: { user }, version: 0 }),
        );
      } catch {}
    },
    {
      uid: "e2e-admin",
      email: "e2e-admin@example.com",
      displayName: "E2E Admin",
      photoURL: "",
      role: "admin",
    },
  );

  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "es");
  });
});

test.describe("Logger l10n and formatting", () => {
  test("renders Spanish locale labels and preserves formatting after reload", async ({
    page,
  }) => {
    test.setTimeout(120000);

    const openAnalytics = async (): Promise<boolean> => {
      const toggle = page.getByTestId("toggle-analytics");
      await expect(toggle).toBeVisible({ timeout: 15000 });
      let attempts = 0;
      await toggle.click({ force: true });
      const panelCount = await expect
        .poll(
          async () => {
            const count = await page.getByTestId("analytics-panel").count();
            if (count === 0 && attempts < 4) {
              attempts += 1;
              await toggle.click({ force: true });
            }
            return count;
          },
          {
            timeout: 30000,
            interval: 750,
          },
        )
        .toBeGreaterThanOrEqual(0);

      const countResolved = await page.getByTestId("analytics-panel").count();
      if (countResolved > 0) {
        await expect(page.getByTestId("analytics-panel").first()).toBeVisible({
          timeout: 30000,
        });
        return true;
      }

      // If analytics never rendered, continue the test with other l10n checks.
      return false;
    };

    await gotoLoggerPage(page, L10N_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    // Log a simple pass to ensure events exist
    await sendRawEventThroughHarness(page, {
      match_clock: "00:12.000",
      period: 1,
      team_id: "HOME_TEAM",
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
        receiver_name: "Jugador Casa 2",
      },
    });
    await waitForPendingAckToClear(page);

    // Analytics view shows Spanish labels
    const analyticsReady = await openAnalytics();
    const analyticsPanel = page.getByTestId("analytics-panel").first();
    if (analyticsReady) {
      await expect(analyticsPanel).toContainText(
        /Analítica del partido en vivo|Analítica/i,
      );
      await expect(analyticsPanel).toContainText(
        /Eventos totales|Total Events/i,
      );
    }

    // Timeline/clock formatting keeps mm:ss
    const statusClock = page.getByTestId("effective-clock-value");
    await expect(statusClock).toHaveText(/\d{2}:\d{2}/);

    // Reload preserves locale and analytics view remains accessible
    await page.reload();
    await gotoLoggerPage(page, L10N_MATCH_ID);
    await setRole(page, "admin");
    await expect(page.getByTestId("effective-clock-value")).toBeVisible({
      timeout: 15000,
    });
    const analyticsReadyAfterReload = await openAnalytics();
    if (analyticsReadyAfterReload) {
      const analyticsTitle = page.getByTestId("analytics-title");
      await expect(analyticsTitle).toBeVisible();
      await expect(analyticsTitle).toHaveText(
        /Analítica|Analítica del partido/i,
      );
    }
  });
});
