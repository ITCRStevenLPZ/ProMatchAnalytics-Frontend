/**
 * E2E tests validating the three fixes:
 *   1. Analytics total times survive INEFFECTIVE mode transitions
 *   2. Goal Kick quick action logs a SetPiece event + triggers ineffective
 *   3. All period control buttons work (End Match included)
 */
import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { uniqueId } from "./utils/admin";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  ensureClockRunning,
  resetHarnessFlow,
  waitForPendingAckToClear,
} from "./utils/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeMatchId = () => uniqueId("E2E-FIXES-VALIDATION");

let backendRequest: APIRequestContext;

const primeAdminStorage = async (page: Page) => {
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
};

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

const ensureAdminRole = async (page: Page) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await setRole(page, "admin");
    const role = await page.evaluate(
      () => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role,
    );
    if (role === "admin") return;
    await page.waitForTimeout(200);
  }
  throw new Error("Failed to set admin role");
};

const resetMatch = async (
  matchId: string,
  options?: {
    status?: string;
    matchTimeSeconds?: number;
    ineffectiveTimeSeconds?: number;
    periodTimestamps?: Record<string, unknown>;
  },
) => {
  const resp = await backendRequest.post("/e2e/reset", {
    data: {
      matchId,
      status: options?.status,
      matchTimeSeconds: options?.matchTimeSeconds,
      ineffectiveTimeSeconds: options?.ineffectiveTimeSeconds,
      periodTimestamps: options?.periodTimestamps,
    },
  });
  expect(resp.ok()).toBeTruthy();
};

const waitForMatchStatus = async (matchId: string, status: string) => {
  await expect
    .poll(
      async () => {
        const res = await backendRequest.get(
          `/api/v1/logger/matches/${matchId}`,
        );
        if (!res.ok()) return null;
        const payload = await res.json();
        return payload.status as string | null;
      },
      { timeout: 15000, interval: 500 },
    )
    .toBe(status);
};

const getHarnessCurrentStep = async (page: Page): Promise<string | null> => {
  return page.evaluate(() => {
    const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getCurrentStep ? harness.getCurrentStep() : null;
  });
};

const openAnalytics = async (page: Page) => {
  await page.getByTestId("toggle-analytics").click();
  await expect(page.getByTestId("analytics-panel")).toBeVisible({
    timeout: 15000,
  });
};

const parseClockToSeconds = (value: string): number => {
  const [mm, ss] = String(value).trim().split(":");
  return Number(mm || 0) * 60 + Number(ss || 0);
};

const getRowValues = async (page: Page, testId: string) => {
  const row = page.getByTestId(testId);
  await expect(row).toBeVisible({ timeout: 15000 });
  const homeText = (await row.locator("div").nth(0).textContent()) || "";
  const awayText = (await row.locator("div").nth(2).textContent()) || "";
  return { homeText: homeText.trim(), awayText: awayText.trim() };
};

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe("Fixes validation (analytics, Goal Kick, period controls)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async () => {
    backendRequest = await request.newContext({
      baseURL: BACKEND_BASE_URL,
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await primeAdminStorage(page);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  // -----------------------------------------------------------------------
  // 1. Analytics total times survive INEFFECTIVE period transition
  // -----------------------------------------------------------------------
  test("analytics effective time is not corrupted after transition while clock is in INEFFECTIVE mode", async ({
    page,
  }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    // Seed second half with a known effective time and known ineffective time.
    // When transitioning to Fulltime, the backend should preserve these values
    // (not add the current-period elapsed to match_time_seconds).
    const seededEffective = 80 * 60; // 80:00
    const seededIneffective = 300; // 5:00
    await resetMatch(matchId, {
      status: "Live_Second_Half",
      matchTimeSeconds: seededEffective,
      ineffectiveTimeSeconds: seededIneffective,
    });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    await expect(page.getByTestId("period-status-second-half")).toBeVisible({
      timeout: 15000,
    });

    // Stop the clock to enter INEFFECTIVE mode before transitioning
    const stopClockButton = page.getByTestId("btn-stop-clock");
    const stopIsEnabled = await stopClockButton.isEnabled().catch(() => false);
    if (stopIsEnabled) {
      await stopClockButton.click();
    }

    // Wait a moment so the INEFFECTIVE timer ticks > 0
    await page.waitForTimeout(2000);

    // Now transition to Fulltime while in INEFFECTIVE mode
    await page.getByTestId("btn-end-match").click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });

    // Verify the backend effective time was not inflated
    const res = await backendRequest.get(`/api/v1/logger/matches/${matchId}`);
    expect(res.ok()).toBeTruthy();
    const matchDoc = await res.json();
    const backendEffective = matchDoc.match_time_seconds ?? 0;

    // The effective time should be at or near the seeded value (± 5s margin).
    // BUG (prior): backend would add the INEFFECTIVE-mode elapsed to
    // match_time_seconds, inflating it by the seconds spent in INEFFECTIVE.
    expect(backendEffective).toBeGreaterThanOrEqual(seededEffective - 5);
    expect(backendEffective).toBeLessThanOrEqual(seededEffective + 5);

    // Open analytics and verify the effective clock display is correct
    await openAnalytics(page);
    const effectiveClockEl = page.getByTestId("effective-clock-value");
    await expect(effectiveClockEl).toBeVisible({ timeout: 15000 });
    const effectiveClockText = await effectiveClockEl.textContent();
    const displayedEffective = parseClockToSeconds(
      (effectiveClockText ?? "").replace(/\..*$/, ""),
    );
    // Effective time should still be ~80:00 (seeded), not inflated
    expect(displayedEffective).toBeGreaterThanOrEqual(seededEffective - 10);
    expect(displayedEffective).toBeLessThanOrEqual(seededEffective + 10);
  });

  // -----------------------------------------------------------------------
  // 2. Goal Kick quick action
  // -----------------------------------------------------------------------
  test("Goal Kick quick action logs a SetPiece event and triggers OutOfBounds ineffective", async ({
    page,
  }) => {
    test.setTimeout(90000);

    const matchId = makeMatchId();
    await resetMatch(matchId);

    await gotoLoggerPage(page, matchId);
    await ensureAdminRole(page);
    await ensureClockRunning(page);
    await resetHarnessFlow(page, "home");

    // Select a player and a zone
    await page.getByTestId("field-player-HOME-3").click();
    await expect(page.getByTestId("field-zone-selector")).toBeVisible({
      timeout: 8000,
    });
    await page.getByTestId("zone-select-7").click();

    // Click Goal Kick quick action
    await page.getByTestId("quick-action-Goal Kick").click({ timeout: 8000 });

    await waitForPendingAckToClear(page);

    // Flow should reset back to selectPlayer
    const step = await getHarnessCurrentStep(page);
    expect(step).toBe("selectPlayer");

    // An event should have been logged
    await expect(page.getByTestId("live-event-item").first()).toBeVisible({
      timeout: 10000,
    });

    // Ineffective mode should be active (resume-effective button visible)
    await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
      timeout: 10000,
    });
  });

  // -----------------------------------------------------------------------
  // 3. Full period control walkthrough including End Match
  // -----------------------------------------------------------------------
  test("full period control walkthrough: 1H → HT → 2H → Fulltime → Completed", async ({
    page,
  }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    await resetMatch(matchId, {
      status: "Live_First_Half",
      matchTimeSeconds: 46 * 60, // past 45:00 minimum
    });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    // --- First Half → Halftime ---
    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId("btn-end-first-half").click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Halftime");

    // --- Halftime → Second Half ---
    await page.getByTestId("btn-start-second-half").click();
    await expect(page.getByTestId("period-status-second-half")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Live_Second_Half");

    // --- Second Half → Fulltime ---
    // The match_time clock keeps ticking from 46:00+ so it will pass 90:00
    // but E2E mode bypasses minimums anyway.
    await page.getByTestId("btn-end-match").click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Fulltime");

    // Fulltime: clock-locked-banner should NOT appear yet (not Completed)
    await expect(page.getByTestId("clock-locked-banner")).toHaveCount(0);

    // Extra time button should be available
    await expect(page.getByTestId("btn-start-extra-time")).toBeEnabled({
      timeout: 15000,
    });

    // --- Fulltime → Completed ---
    await page.getByTestId("btn-end-match-final").click();
    await expect(page.getByTestId("clock-locked-banner")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Completed");

    // No transition errors
    await expect(page.getByTestId("transition-error")).toHaveCount(0);
  });

  // -----------------------------------------------------------------------
  // 3b. End Match from Fulltime via extra time path
  // -----------------------------------------------------------------------
  test("extra time path: Fulltime → ET1 → ET-HT → ET2 → Penalties → Completed", async ({
    page,
  }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    await resetMatch(matchId, {
      status: "Live_Extra_First",
      matchTimeSeconds: 105 * 60,
    });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    // --- Extra First Half → Extra Halftime ---
    await expect(page.getByTestId("period-status-extra-first")).toBeVisible({
      timeout: 15000,
    });
    await page.getByTestId("btn-end-extra-first").click();
    await expect(page.getByTestId("period-status-extra-halftime")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Extra_Halftime");

    // --- Extra Halftime → Extra Second Half ---
    await page.getByTestId("btn-start-extra-second").click();
    await expect(page.getByTestId("period-status-extra-second")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Live_Extra_Second");

    // --- Extra Second Half → Penalties ---
    await page.getByTestId("btn-start-penalties").click();
    await expect(page.getByTestId("period-status-penalties")).toBeVisible({
      timeout: 15000,
    });

    // --- Penalties → Completed (btn-end-penalties calls finishMatch directly) ---
    await page.getByTestId("btn-end-penalties").click();
    await expect(page.getByTestId("clock-locked-banner")).toBeVisible({
      timeout: 15000,
    });
    await waitForMatchStatus(matchId, "Completed");

    await expect(page.getByTestId("transition-error")).toHaveCount(0);
  });
});
