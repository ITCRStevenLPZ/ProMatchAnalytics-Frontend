import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  submitStandardShot,
  waitForPendingAckToClear,
} from "./utils/logger";

const SUB_MATCH_ID = "E2E-MATCH-SUB";
const TURBO_MATCH_ID = "E2E-MATCH-TURBO";
const ANALYTICS_MATCH_ID = "E2E-MATCH-ANALYTICS";
const TIMER_MATCH_ID = "E2E-MATCH-TIMER";

let backendRequest: APIRequestContext;

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

const resetMatch = async (matchId: string) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId },
  });
  expect(response.ok()).toBeTruthy();
};

const promoteToAdmin = async (page: Page) => {
  await page.evaluate(() => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    const currentUser = store?.getState?.().user || {
      uid: "e2e-admin",
      email: "e2e-admin@example.com",
      displayName: "E2E Admin",
      photoURL: "",
    };
    store?.getState?.().setUser?.({
      ...currentUser,
      role: "admin",
      displayName: currentUser.displayName || "E2E Admin",
    });
  });
};

test.describe("Logger substitutions", () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(SUB_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("runs substitution wizard and logs substitution event", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: false,
            team_status: {
              total_substitutions: 1,
              max_substitutions: 5,
              remaining_substitutions: 4,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    await gotoLoggerPage(page, SUB_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await page.getByTestId("field-player-HOME-1").click();
    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible();
    await expect(subModal.getByTestId("substitution-heading")).toBeVisible();
    const offList = subModal.locator('[data-testid^="sub-off-"]');
    await expect(offList.first()).toBeVisible();
    await offList.first().click();

    const onList = subModal.locator('[data-testid^="sub-on-"]');
    await expect(onList.first()).toBeVisible();
    await onList.first().click();

    const confirmBtn = subModal.getByTestId("confirm-substitution");
    await expect(confirmBtn).toBeEnabled({ timeout: 10000 });
    await confirmBtn.click();

    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 2);
    const substitutionEvent = page
      .getByTestId("live-event-item")
      .filter({ hasText: /Substitution/i })
      .first();
    await expect(substitutionEvent).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Logger turbo mode & audio", () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(TURBO_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("logs turbo pass with recipient and records audio trigger", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => {
      class StubOscillator {
        context: any;
        type: OscillatorType;
        frequency: { setValueAtTime: () => void };
        constructor(ctx: any) {
          this.context = ctx;
          this.type = "sine";
          this.frequency = { setValueAtTime: () => {} };
        }
        connect() {}
        start() {
          (window as any).__AUDIO_EVENTS__ =
            ((window as any).__AUDIO_EVENTS__ || 0) + 1;
        }
        stop() {}
      }
      class StubGain {
        connect() {}
        gain = {
          setValueAtTime: () => {},
          exponentialRampToValueAtTime: () => {},
        };
      }
      class StubAudioContext {
        state = "running";
        destination = {};
        createOscillator() {
          return new StubOscillator(this);
        }
        createGain() {
          return new StubGain();
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          return Promise.resolve();
        }
      }
      (window as any).AudioContext = StubAudioContext as any;
      (window as any).webkitAudioContext = StubAudioContext as any;
      (window as any).__AUDIO_EVENTS__ = 0;
    });

    await gotoLoggerPage(page, TURBO_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await page.getByText("Turbo").click();
    const turboPanel = page.getByTestId("turbo-mode-input");
    await expect(turboPanel).toBeVisible();

    const turboInput = turboPanel.getByRole("textbox");
    await turboInput.fill("h1p1");
    await expect(
      turboPanel.getByText(/Pass needs a recipient/i).first(),
    ).toBeVisible();

    await turboInput.fill("h1p1>2");
    await turboPanel.getByRole("button", { name: /LOG/i }).click();

    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 1);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      "Pass",
    );

    const audioCount = await page.evaluate(
      () => (window as any).__AUDIO_EVENTS__,
    );
    expect(audioCount).toBeGreaterThan(0);
  });
});

test.describe("Logger analytics view", () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(ANALYTICS_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("shows analytics after logging events", async ({ page }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, ANALYTICS_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await submitStandardPass(page, "home");
    await waitForPendingAckToClear(page);
    await resetHarnessFlow(page, "away");
    await submitStandardShot(page, "away");
    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 2);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(
      analyticsPanel.getByTestId("analytics-total-events"),
    ).toHaveText("2");
    await expect(
      analyticsPanel.getByTestId("analytics-home-total"),
    ).toContainText("1");
    await expect(
      analyticsPanel.getByTestId("analytics-away-total"),
    ).toContainText("1");
    await expect(
      analyticsPanel.getByTestId("analytics-event-type-pass"),
    ).toContainText("1");
    await expect(
      analyticsPanel.getByTestId("analytics-event-type-shot"),
    ).toContainText("1");
    await expect(analyticsPanel.locator("svg").first()).toBeVisible();

    await page.reload();
    await promoteToAdmin(page);
    await expectLiveEventCount(page, 2);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanelReload = page.getByTestId("analytics-panel");
    await expect(
      analyticsPanelReload.getByTestId("analytics-total-events"),
    ).toHaveText("2");
    await expect(
      analyticsPanelReload.getByTestId("analytics-event-type-pass"),
    ).toContainText("1");
    await expect(
      analyticsPanelReload.getByTestId("analytics-event-type-shot"),
    ).toContainText("1");
  });
});

test.describe("Logger timers, transitions, and lock state", () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(TIMER_MATCH_ID);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("walks halftime/fulltime transitions and enforces lock", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TIMER_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await page.getByTestId("btn-start-clock").click();
    await page.waitForTimeout(200);
    const endFirstHalfBtn = page.getByTestId("btn-end-first-half");
    await endFirstHalfBtn.scrollIntoViewIfNeeded();
    await expect(endFirstHalfBtn).toBeEnabled({ timeout: 10000 });
    await endFirstHalfBtn.click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible();

    const startSecondHalfBtn = page.getByTestId("btn-start-second-half");
    await startSecondHalfBtn.scrollIntoViewIfNeeded();
    await expect(startSecondHalfBtn).toBeEnabled({ timeout: 10000 });
    await startSecondHalfBtn.click();
    await expect(page.getByTestId("period-status-second-half")).toBeVisible();

    const endMatchBtn = page.getByTestId("btn-end-match");
    await endMatchBtn.scrollIntoViewIfNeeded();
    await expect(endMatchBtn).toBeEnabled({ timeout: 10000 });
    await endMatchBtn.click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible();
    await expect(page.getByTestId("clock-locked-banner")).toHaveCount(0);
    await expect(page.getByTestId("btn-start-extra-time")).toBeEnabled({
      timeout: 10000,
    });

    const endMatchFinalBtn = page.getByTestId("btn-end-match-final");
    await endMatchFinalBtn.scrollIntoViewIfNeeded();
    await expect(endMatchFinalBtn).toBeEnabled({ timeout: 10000 });
    await endMatchFinalBtn.click();
    await expect(page.getByTestId("clock-locked-banner")).toBeVisible();
    await expect(page.getByTestId("btn-start-clock")).toBeDisabled();
    await expect(page.getByTestId("btn-stop-clock")).toBeDisabled();
  });
});
