import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
} from "./utils/logger";

const SUB_MATCH_ID = "E2E-MATCH-SUB";

let backendRequest: APIRequestContext;

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

const openSubstitutionFlow = async (page: Page) => {
  await gotoLoggerPage(page, SUB_MATCH_ID);
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
    await resetMatch(SUB_MATCH_ID);
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

    const subModal = await openSubstitutionFlow(page);

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

    const subModal = await openSubstitutionFlow(page);

    await expect(
      subModal.getByText(/Invalid Substitution|Sustituci[oó]n inv[aá]lida/i),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      subModal.getByText(/already substituted out|ya fue sustituido/i),
    ).toBeVisible();
    await expect(subModal.getByTestId("confirm-substitution")).toBeDisabled();
  });
});
