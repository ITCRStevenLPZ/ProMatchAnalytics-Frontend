import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { BACKEND_BASE_URL, gotoLoggerPage } from "./utils/logger";

const MATCH_ID = "E2E-PITCH-MARKINGS-SCALE";

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
};

const openAnalytics = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByTestId("toggle-analytics").click();
  await expect(panel).toBeVisible({ timeout: 15000 });
};

const readNumericAttr = async (
  page: Page,
  testId: string,
  attr: "x" | "y" | "width" | "height" | "rx" | "ry",
): Promise<number> => {
  const raw = await page.getByTestId(testId).getAttribute(attr);
  expect(raw).not.toBeNull();
  return Number(raw);
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

test.beforeEach(async () => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

test.describe("Pitch markings use IFAB-scaled geometry", () => {
  test.describe.configure({ mode: "serial" });

  test("analytics heat map markings are scaled from real dimensions", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await openAnalytics(page);

    // 105x68 reference mapped to 120x80
    // penalty depth: 16.5m -> 18.8571
    // penalty height: 40.32m -> 47.4353
    // goal area depth: 5.5m -> 6.2857
    // goal area height: 18.32m -> 21.5529
    // center circle radius: 9.15m -> rx 10.4571, ry 10.7647
    const paW = await readNumericAttr(
      page,
      "heatmap-home-penalty-left",
      "width",
    );
    const paH = await readNumericAttr(
      page,
      "heatmap-home-penalty-left",
      "height",
    );
    const gaW = await readNumericAttr(
      page,
      "heatmap-home-goalarea-left",
      "width",
    );
    const gaH = await readNumericAttr(
      page,
      "heatmap-home-goalarea-left",
      "height",
    );
    const ccRx = await readNumericAttr(
      page,
      "heatmap-home-center-circle",
      "rx",
    );
    const ccRy = await readNumericAttr(
      page,
      "heatmap-home-center-circle",
      "ry",
    );

    expect(paW).toBeCloseTo(18.8571, 2);
    expect(paH).toBeCloseTo(47.4353, 2);
    expect(gaW).toBeCloseTo(6.2857, 2);
    expect(gaH).toBeCloseTo(21.5529, 2);
    expect(ccRx).toBeCloseTo(10.4571, 2);
    expect(ccRy).toBeCloseTo(10.7647, 2);

    // Regression guard: these must be larger than old undersized hardcoded values.
    expect(paW).toBeGreaterThan(16.5);
    expect(paH).toBeGreaterThan(40.32);
    expect(gaW).toBeGreaterThan(5.5);
    expect(gaH).toBeGreaterThan(18.32);
  });

  test("tactical input field markings use the same scaled geometry", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");

    await expect(page.getByTestId("soccer-field")).toBeVisible();
    await expect(page.getByTestId("tactical-field-markings")).toBeVisible();

    const paW = await readNumericAttr(page, "tactical-penalty-left", "width");
    const paH = await readNumericAttr(page, "tactical-penalty-left", "height");
    const gaW = await readNumericAttr(page, "tactical-goalarea-left", "width");
    const gaH = await readNumericAttr(page, "tactical-goalarea-left", "height");
    const ccRx = await readNumericAttr(page, "tactical-center-circle", "rx");
    const ccRy = await readNumericAttr(page, "tactical-center-circle", "ry");

    expect(paW).toBeCloseTo(18.8571, 2);
    expect(paH).toBeCloseTo(47.4353, 2);
    expect(gaW).toBeCloseTo(6.2857, 2);
    expect(gaH).toBeCloseTo(21.5529, 2);
    expect(ccRx).toBeCloseTo(10.4571, 2);
    expect(ccRy).toBeCloseTo(10.7647, 2);
  });
});
