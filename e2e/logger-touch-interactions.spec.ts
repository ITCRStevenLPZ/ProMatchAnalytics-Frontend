import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  MATCH_ID,
  gotoLoggerPage,
  ensureClockRunning,
  selectZoneIfVisible,
  waitForPendingAckToClear,
} from "./utils/logger";

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

let backendRequest: APIRequestContext;

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 1024, height: 1366 },
});

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
  await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.addInitScript((user) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, AUTH_USER);
});

const ensureAdminRole = async (page: Page) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    if (store?.getState) {
      store.getState().setUser(user);
    }
  }, AUTH_USER);
};

const tapLocator = async (page: Page, locator: Locator) => {
  await expect(locator).toBeVisible({ timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
};

test("touch taps support destination selection and undo", async ({ page }) => {
  await gotoLoggerPage(page, MATCH_ID);
  await ensureAdminRole(page);
  await ensureClockRunning(page);

  const initialCount = await page.getByTestId("live-event-item").count();

  await tapLocator(page, page.getByTestId("field-player-HOME-3"));
  await selectZoneIfVisible(page, 7);
  await tapLocator(page, page.getByTestId("quick-action-Pass"));

  await expect(page.getByTestId("field-cancel-btn")).toBeVisible({
    timeout: 10000,
  });

  const field = page.getByTestId("soccer-field");
  await expect(field).toBeVisible({ timeout: 10000 });
  const fieldBox = await field.boundingBox();
  expect(fieldBox).not.toBeNull();
  if (!fieldBox) {
    throw new Error("soccer-field bounding box unavailable");
  }

  // Pick an interior point away from control overlays to submit destination.
  await field.tap({
    position: {
      x: fieldBox.width * 0.68,
      y: fieldBox.height * 0.82,
    },
  });

  await waitForPendingAckToClear(page);
  await expect
    .poll(async () => page.getByTestId("live-event-item").count(), {
      timeout: 10000,
    })
    .toBeGreaterThan(initialCount);

  await tapLocator(page, page.getByTestId("undo-button"));
  await waitForPendingAckToClear(page);
  await expect
    .poll(async () => page.getByTestId("live-event-item").count(), {
      timeout: 10000,
    })
    .toBe(initialCount);
});
