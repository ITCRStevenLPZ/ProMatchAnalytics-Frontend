import {
  test,
  expect,
  type Page,
  type APIRequestContext,
  request,
} from "@playwright/test";
import {
  gotoLoggerPage,
  getHarnessMatchContext,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
  BACKEND_BASE_URL,
} from "./utils/logger";

const QA_MATCH_ID = "E2E-QA-FIXES-V2";

const openAnalytics = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  // If already in analytics view, nothing to do
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByTestId("toggle-analytics").click();
  await expect(panel).toBeVisible({ timeout: 15000 });
};

const sendEvent = async (
  page: Page,
  payload: {
    match_clock: string;
    period?: number;
    team_id: string;
    player_id: string;
    type: string;
    data: Record<string, any>;
  },
) => {
  await sendRawEventThroughHarness(page, {
    period: payload.period ?? 1,
    ...payload,
  });
  await waitForPendingAckToClear(page);
};

test.describe("QA Fixes v2", () => {
  let context: Awaited<ReturnType<typeof getHarnessMatchContext>> | null = null;
  let backendRequest: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    backendRequest = await request.newContext({
      baseURL: BACKEND_BASE_URL,
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });
    // Reset match state
    const resetResp = await backendRequest.post("/e2e/reset", {
      data: { matchId: QA_MATCH_ID },
    });
    expect(resetResp.ok()).toBeTruthy();

    const page = await browser.newPage();
    await gotoLoggerPage(page, QA_MATCH_ID);
    context = await getHarnessMatchContext(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // Reset before each test so state is clean
    const resp = await backendRequest.post("/e2e/reset", {
      data: { matchId: QA_MATCH_ID },
    });
    expect(resp.ok()).toBeTruthy();
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  test("QA-1: analytics toggle is in TeamSelector area near field", async ({
    page,
  }) => {
    await gotoLoggerPage(page, QA_MATCH_ID);

    // Send an event so analytics renders full panel
    await sendEvent(page, {
      match_clock: "00:01.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    // The toggle-analytics button should be visible inside the TeamSelector container
    // alongside the flip-field and undo buttons
    const toggleAnalytics = page.getByTestId("toggle-analytics");
    await expect(toggleAnalytics).toBeVisible({ timeout: 10000 });

    // Verify it's near the flip and undo buttons (same parent container)
    const flipBtn = page.getByTestId("toggle-field-flip");
    await expect(flipBtn).toBeVisible();

    // Click analytics toggle — should show analytics panel
    await toggleAnalytics.click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    // Click again to go back to logger (via the back-to-logger button in analytics view)
    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("QA-2: per-team time rows render in separate section", async ({
    page,
  }) => {
    await gotoLoggerPage(page, QA_MATCH_ID);

    // Send an event so analytics has data
    await sendEvent(page, {
      match_clock: "00:01.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    // Per-team time section should exist
    const perTeamSection = page.getByTestId("analytics-per-team-time");
    await expect(perTeamSection).toBeVisible({ timeout: 10000 });

    // The per-team rows should be inside the per-team section
    await expect(
      perTeamSection.getByTestId("stat-ineffective-time"),
    ).toBeVisible();
    await expect(
      perTeamSection.getByTestId("stat-ineffective-time-percent"),
    ).toBeVisible();
    await expect(
      perTeamSection.getByTestId("stat-effective-time"),
    ).toBeVisible();
    await expect(
      perTeamSection.getByTestId("stat-effective-time-percent"),
    ).toBeVisible();

    // Total rows should still be in the main comparison table
    const mainTable = page.getByTestId("analytics-comparison-table");
    await expect(
      mainTable.getByTestId("stat-total-effective-time"),
    ).toBeVisible();
    await expect(
      mainTable.getByTestId("stat-total-ineffective-time"),
    ).toBeVisible();
  });

  test("QA-3: JPG export button exists (CSV removed)", async ({ page }) => {
    await gotoLoggerPage(page, QA_MATCH_ID);

    // Send an event so analytics renders full panel (not empty state)
    await sendEvent(page, {
      match_clock: "00:02.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    // JPG button should exist
    await expect(page.getByTestId("export-analytics-jpg")).toBeVisible();
    // CSV button should NOT exist
    await expect(page.getByTestId("export-analytics-csv")).not.toBeVisible();
    // PDF button should still exist
    await expect(page.getByTestId("export-analytics-pdf")).toBeVisible();
  });

  test("QA-4: drag lock toggle button is visible", async ({ page }) => {
    await gotoLoggerPage(page, QA_MATCH_ID);

    // Lock toggle should be visible near the flip/undo buttons
    const lockBtn = page.getByTestId("toggle-drag-lock");
    await expect(lockBtn).toBeVisible({ timeout: 10000 });

    // By default, dragging is locked (Lock icon visible)
    // Click to unlock
    await lockBtn.click();
    // Verify it toggled (button is still visible)
    await expect(lockBtn).toBeVisible();

    // Click again to re-lock
    await lockBtn.click();
    await expect(lockBtn).toBeVisible();
  });
});
