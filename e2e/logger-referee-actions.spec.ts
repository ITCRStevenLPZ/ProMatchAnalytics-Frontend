import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  waitForPendingAckToClear,
  ensureClockRunning,
  resetHarnessFlow,
  getRecentGameStoppages,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH-REFEREE-ACTIONS";

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

const getMatchId = (testInfo: TestInfo): string => {
  return testInfo.title.includes("switch team control")
    ? "E2E-REF-SWITCH"
    : "E2E-REF-ACTION";
};

let backendRequest: APIRequestContext;

const setRole = async (page: Page, role: "admin" | "logger") => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate((nextRole) => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const user = store?.getState?.().user || {
      uid: "e2e-user",
      email: "e2e@test.com",
      displayName: "E2E User",
    };
    store?.getState?.().setUser?.({ ...user, role: nextRole });
  }, role);
};

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.beforeEach(async ({ page }, testInfo) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: getMatchId(testInfo) },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.addInitScript((user) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, AUTH_USER);
});

test.describe("Logger referee neutral actions", () => {
  test("referee shortcut actions start neutral ineffective time and roll into Other analytics", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, getMatchId(testInfo));
    await resetHarnessFlow(page);
    await setRole(page, "admin");
    await ensureClockRunning(page);
    const recentNeutralStoppages = async () =>
      (await getRecentGameStoppages(page)).filter(
        (event) => event.team_id === "NEUTRAL",
      );

    const refereeBar = page.getByTestId("referee-action-bar");
    await expect(refereeBar).toBeVisible({ timeout: 10000 });

    await page.getByTestId("referee-action-discussion").click();
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => {
        const stoppages = await recentNeutralStoppages();
        const last = stoppages.at(-1);
        if (!last) return null;
        return {
          stoppage_type: last.stoppage_type,
          reason: last.reason,
          trigger_action: last.trigger_action,
          hasNotes: Boolean(last.notes),
        };
      })
      .toEqual({
        stoppage_type: "ClockStop",
        reason: "Other",
        trigger_action: "Other",
        hasNotes: true,
      });

    const resumeButton = page.getByTestId("btn-resume-effective");
    await expect(resumeButton).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(1200);
    await resumeButton.click();
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => {
        const stoppages = await recentNeutralStoppages();
        return stoppages.slice(-2).map((event) => ({
          stoppage_type: event.stoppage_type,
          reason: event.reason,
          trigger_action: event.trigger_action,
          hasNotes: Boolean(event.notes),
        }));
      })
      .toEqual([
        {
          stoppage_type: "ClockStop",
          reason: "Other",
          trigger_action: "Other",
          hasNotes: true,
        },
        {
          stoppage_type: "ClockStart",
          reason: "Other",
          trigger_action: "Other",
          hasNotes: false,
        },
      ]);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible({ timeout: 10000 });

    const otherRow = page.getByTestId("stat-ineffective-other");
    await expect(otherRow).toBeVisible({ timeout: 10000 });
    const neutralValue = otherRow.locator("div").nth(2);
    await expect
      .poll(async () => (await neutralValue.textContent()) || "", {
        timeout: 10000,
      })
      .toMatch(/00:0[1-9]/);
  });

  test("switch team control in referee panel updates attribution immediately during ineffective time", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, getMatchId(testInfo));
    await resetHarnessFlow(page);
    await setRole(page, "admin");
    await ensureClockRunning(page);
    const matchContext = await page.evaluate(() => {
      const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
      return harness?.getMatchContext ? harness.getMatchContext() : null;
    });
    expect(matchContext).not.toBeNull();

    const switchButton = page.getByTestId("referee-switch-ineffective-team");
    await expect(switchButton).toBeVisible({ timeout: 10000 });
    await expect(switchButton).toBeDisabled();

    await page.getByTestId("btn-ineffective-event").click();
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("ineffective-note-action").click();
    await page.getByTestId("ineffective-note-action-option-Foul").click();
    await page.getByTestId("ineffective-note-team").click();
    await page.getByTestId("ineffective-note-team-option-home").click();
    await page.getByTestId("ineffective-note-save").click();
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => {
        const stoppages = await getRecentGameStoppages(page);
        const last = stoppages.at(-1);
        if (!last) return null;
        return {
          team_id: last.team_id,
          stoppage_type: last.stoppage_type,
          reason: last.reason,
          trigger_team_id: last.trigger_team_id ?? null,
        };
      })
      .toEqual({
        team_id: matchContext.homeTeamId,
        stoppage_type: "ClockStop",
        reason: "Foul",
        trigger_team_id: matchContext.homeTeamId,
      });

    await expect(switchButton).toBeEnabled({ timeout: 10000 });

    await switchButton.click();
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => {
        const stoppages = await getRecentGameStoppages(page);
        return stoppages.slice(-2).map((event) => ({
          team_id: event.team_id,
          stoppage_type: event.stoppage_type,
          reason: event.reason,
          trigger_team_id: event.trigger_team_id ?? null,
        }));
      })
      .toEqual([
        {
          team_id: matchContext.homeTeamId,
          stoppage_type: "ClockStart",
          reason: "Foul",
          trigger_team_id: matchContext.homeTeamId,
        },
        {
          team_id: matchContext.awayTeamId,
          stoppage_type: "ClockStop",
          reason: "Foul",
          trigger_team_id: matchContext.awayTeamId,
        },
      ]);

    await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
      timeout: 10000,
    });
  });
});
