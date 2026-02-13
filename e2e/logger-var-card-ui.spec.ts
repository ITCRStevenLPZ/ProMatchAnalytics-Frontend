import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  ensureClockRunning,
  gotoLoggerPage,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH-VAR-CARD-UI";

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

const parseClockToSeconds = (clock: string) => {
  const [mm, ss] = String(clock).trim().split(":");
  return Number(mm || 0) * 60 + Number(ss || 0);
};

const readVarSeconds = async (page: Page) => {
  const value =
    (await page
      .getByTestId("var-time-card")
      .locator(".font-mono")
      .first()
      .textContent()) || "00:00";
  return parseClockToSeconds(value);
};

const readGlobalSeconds = async (page: Page) => {
  const value =
    (await page.getByTestId("global-clock-value").textContent()) || "00:00";
  return parseClockToSeconds(value);
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
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Logger VAR and card UI guards", () => {
  test.describe.configure({ mode: "serial" });

  test("VAR time pauses when global clock is stopped", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    await page.getByTestId("btn-var-toggle").click();
    const globalBefore = await readGlobalSeconds(page);
    const varBefore = await readVarSeconds(page);
    await page.waitForTimeout(1400);
    const globalAfter = await readGlobalSeconds(page);
    const varAfter = await readVarSeconds(page);
    const globalDelta = globalAfter - globalBefore;
    const varDelta = varAfter - varBefore;
    expect(globalAfter - globalBefore).toBeGreaterThanOrEqual(1);
    expect(globalAfter - globalBefore).toBeLessThanOrEqual(2);
    expect(Math.abs(varDelta - globalDelta)).toBeLessThanOrEqual(1);

    const beforeStop = varAfter;

    await page.getByTestId("btn-stop-clock").click();
    await page.waitForTimeout(2400);
    const whileStopped = await readVarSeconds(page);
    expect(whileStopped - beforeStop).toBeLessThanOrEqual(1);

    await page.getByTestId("btn-start-clock").click();
    await page.waitForTimeout(1400);
    const afterRestart = await readVarSeconds(page);
    expect(afterRestart).toBeGreaterThanOrEqual(whileStopped);
  });

  test("Field actions are blocked during VAR and card team selector is colocated", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    await page.getByTestId("btn-var-toggle").click();

    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toHaveCount(0);
    const toast = page.getByTestId("logger-toast");
    if ((await toast.count()) > 0) {
      await expect(toast).toContainText(/VAR/i);
    }

    await page.getByTestId("btn-var-toggle").click();

    await page.getByTestId("card-select-yellow").click();
    const playerGrid = page.getByTestId("player-grid");
    await expect(playerGrid.getByTestId("card-team-home")).toBeVisible();
    await expect(playerGrid.getByTestId("card-team-away")).toBeVisible();

    await playerGrid.getByTestId("card-team-away").click();
    const awayBenchPlayer = page
      .getByTestId("bench-section-away")
      .locator("[data-testid^='player-card-']")
      .first();
    await expect(awayBenchPlayer).toBeVisible({ timeout: 10000 });
  });

  test("Card team selector labels are localized in Spanish", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "es"));
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");

    await page.getByTestId("card-select-yellow").click();
    const playerGrid = page.getByTestId("player-grid");

    await expect(playerGrid.getByTestId("card-team-home")).toHaveText("Local");
    await expect(playerGrid.getByTestId("card-team-away")).toHaveText(
      "Visitante",
    );
  });
});
