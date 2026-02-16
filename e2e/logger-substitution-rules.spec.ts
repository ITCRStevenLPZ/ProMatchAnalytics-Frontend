import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  getHarnessMatchContext,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";
import { uniqueId } from "./utils/admin";

const makeMatchId = () => uniqueId("E2E-MATCH-SUB");

let backendRequest: APIRequestContext;
let matchId: string;

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

const resetMatch = async (matchId: string) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId },
  });
  expect(response.ok()).toBeTruthy();
};

const freezeClientTime = async (page: Page, isoTimestamp: string) => {
  await page.evaluate((iso) => {
    const globalWindow = window as any;
    if (globalWindow.__PROMATCH_ORIGINAL_DATE__) {
      return;
    }

    const fixedMs = new Date(iso).getTime();
    const OriginalDate = Date;

    const FixedDate = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedMs);
          return;
        }
        super(...(args as [any]));
      }

      static now() {
        return fixedMs;
      }

      static parse = OriginalDate.parse;
      static UTC = OriginalDate.UTC;
    };

    Object.defineProperty(globalWindow, "Date", {
      configurable: true,
      writable: true,
      value: FixedDate,
    });
    globalWindow.__PROMATCH_ORIGINAL_DATE__ = OriginalDate;
  }, isoTimestamp);
};

const restoreClientTime = async (page: Page) => {
  await page.evaluate(() => {
    const globalWindow = window as any;
    const OriginalDate = globalWindow.__PROMATCH_ORIGINAL_DATE__;
    if (!OriginalDate) {
      return;
    }
    Object.defineProperty(globalWindow, "Date", {
      configurable: true,
      writable: true,
      value: OriginalDate,
    });
    delete globalWindow.__PROMATCH_ORIGINAL_DATE__;
  });
};

const openSubstitutionFlow = async (page: Page, id: string) => {
  await gotoLoggerPage(page, id);
  await promoteToAdmin(page);
  await resetHarnessFlow(page);

  await page.getByTestId("field-player-HOME-1").click();
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Substitution").click();

  const subModal = page.getByTestId("substitution-modal");
  await expect(subModal).toBeVisible();

  const offList = subModal.locator('[data-testid^="sub-off-"]');
  await expect(offList.first()).toBeVisible();
  await offList.first().click();

  const onList = subModal.locator('[data-testid^="sub-on-"]');
  await expect(onList.first()).toBeVisible();
  await onList.first().click();

  await expect(subModal.getByTestId("substitution-step-confirm")).toBeVisible({
    timeout: 10000,
  });

  return subModal;
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

test.describe("Logger substitution rules", () => {
  test.beforeEach(async ({ page }) => {
    matchId = makeMatchId();
    await resetMatch(matchId);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("allows extra-time window and shows updated counters", async ({
    page,
  }) => {
    test.setTimeout(120000);

    let validationCalled = false;

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) => {
        validationCalled = true;
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: true,
            team_status: {
              total_substitutions: 5,
              max_substitutions: 6,
              remaining_substitutions: 1,
              windows_used: 3,
              max_windows: 4,
              remaining_windows: 1,
              is_extra_time: true,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    const subModal = await openSubstitutionFlow(page, matchId);

    await expect.poll(() => validationCalled).toBe(true);
    await expect(
      subModal.getByText(/Substitutions|Sustituciones/i).locator(".."),
    ).toContainText("1/6");
    await expect(
      subModal.getByText(/Windows|Ventanas/i).locator(".."),
    ).toContainText("1/4");
    await expect(subModal.getByTestId("confirm-substitution")).toBeEnabled();
  });

  test("blocks re-entry of substituted-out player", async ({ page }) => {
    test.setTimeout(120000);

    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) => {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: false,
            error_message: "Player already substituted out",
            opens_new_window: false,
            team_status: {
              total_substitutions: 5,
              max_substitutions: 5,
              remaining_substitutions: 0,
              windows_used: 3,
              max_windows: 3,
              remaining_windows: 0,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    const subModal = await openSubstitutionFlow(page, matchId);

    await expect(
      subModal.getByText(/Invalid Substitution|Sustituci[oó]n inv[aá]lida/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      subModal.getByText(/already substituted out|ya fue sustituido/i),
    ).toBeVisible();
    await expect(subModal.getByTestId("confirm-substitution")).toBeDisabled();
  });

  test("does not start ineffective time when clock is stopped", async ({
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
              windows_used: 0,
              max_windows: 3,
              remaining_windows: 3,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const startClockButton = page.getByTestId("btn-start-clock");
    const stopClockButton = page.getByTestId("btn-stop-clock");
    await expect(startClockButton).toBeEnabled({ timeout: 15000 });
    await expect(stopClockButton).toBeDisabled();

    const ineffectiveClock = page.getByTestId("ineffective-clock-value");
    const initialIneffective = await ineffectiveClock.innerText();

    await page.getByTestId("field-player-HOME-1").click();
    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible();

    const offList = subModal.locator('[data-testid^="sub-off-"]');
    await expect(offList.first()).toBeVisible();
    await offList.first().click();

    const onList = subModal.locator('[data-testid^="sub-on-"]');
    await expect(onList.first()).toBeVisible();
    await onList.first().click();

    const confirmButton = subModal.getByTestId("confirm-substitution");
    await expect(confirmButton).toBeEnabled({ timeout: 10000 });
    await confirmButton.click();
    await expect(subModal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(1200);
    await expect
      .poll(async () => (await ineffectiveClock.innerText()).trim())
      .toBe(initialIneffective.trim());
  });

  test("does not start ineffective time when clock is running", async ({
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
              windows_used: 0,
              max_windows: 3,
              remaining_windows: 3,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const startClockButton = page.getByTestId("btn-start-clock");
    const stopClockButton = page.getByTestId("btn-stop-clock");
    await expect(startClockButton).toBeEnabled({ timeout: 15000 });
    await startClockButton.click();
    await expect(stopClockButton).toBeEnabled({ timeout: 15000 });

    const ineffectiveClock = page.getByTestId("ineffective-clock-value");
    const initialIneffective = await ineffectiveClock.innerText();

    await page.getByTestId("field-player-HOME-1").click();
    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible();

    const offList = subModal.locator('[data-testid^="sub-off-"]');
    await expect(offList.first()).toBeVisible();
    await offList.first().click();

    const onList = subModal.locator('[data-testid^="sub-on-"]');
    await expect(onList.first()).toBeVisible();
    await onList.first().click();

    const confirmButton = subModal.getByTestId("confirm-substitution");
    await expect(confirmButton).toBeEnabled({ timeout: 10000 });
    await confirmButton.click();
    await expect(subModal).toBeHidden({ timeout: 10000 });

    await page.waitForTimeout(1200);
    await expect(page.getByTestId("btn-resume-effective")).toHaveCount(0);
    await expect
      .poll(async () => (await ineffectiveClock.innerText()).trim())
      .toBe(initialIneffective.trim());
  });

  test("keeps substitution applied when duplicate ack shares the same timestamp", async ({
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
              windows_used: 0,
              max_windows: 3,
              remaining_windows: 3,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    await gotoLoggerPage(page, matchId);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await freezeClientTime(page, "2026-02-15T12:00:00.000Z");

    let substitutedOffId = "";
    let substitutedOnId = "";

    try {
      await page.getByTestId("field-player-HOME-1").click();
      await page.getByTestId("quick-action-more").click({ timeout: 8000 });
      await page.getByTestId("action-btn-Substitution").click();

      const subModal = page.getByTestId("substitution-modal");
      await expect(subModal).toBeVisible();

      const offOption = subModal.locator('[data-testid^="sub-off-"]').first();
      await expect(offOption).toBeVisible();
      const offTestId = (await offOption.getAttribute("data-testid")) || "";
      substitutedOffId = offTestId.replace("sub-off-", "");
      await offOption.click();

      const onOption = subModal.locator('[data-testid^="sub-on-"]').first();
      await expect(onOption).toBeVisible();
      const onTestId = (await onOption.getAttribute("data-testid")) || "";
      substitutedOnId = onTestId.replace("sub-on-", "");
      await onOption.click();

      await subModal.getByTestId("confirm-substitution").click();
      await expect(subModal).toBeHidden({ timeout: 10000 });
      await waitForPendingAckToClear(page);

      const context = await getHarnessMatchContext(page);
      expect(context).not.toBeNull();

      const duplicatePayload = {
        match_clock: "12:34.000",
        period: 1,
        team_id: context!.homeTeamId,
        player_id: "HOME-2",
        type: "Pass",
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: "HOME-3",
          receiver_name: "Home Player 3",
        },
      };

      await sendRawEventThroughHarness(page, duplicatePayload);
      await sendRawEventThroughHarness(page, duplicatePayload);
      await waitForPendingAckToClear(page);
    } finally {
      await restoreClientTime(page);
    }

    expect(substitutedOffId).not.toBe("");
    expect(substitutedOnId).not.toBe("");
    await expect(
      page.getByTestId(`field-player-${substitutedOffId}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`field-player-${substitutedOnId}`),
    ).toBeVisible();
  });
});
