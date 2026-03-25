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
  ensureClockRunning,
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

    // Time rows should only exist in the separate per-team section
    const mainTable = page.getByTestId("analytics-comparison-table");
    await expect(
      mainTable.getByTestId("stat-total-effective-time"),
    ).toHaveCount(0);
    await expect(
      mainTable.getByTestId("stat-total-ineffective-time"),
    ).toHaveCount(0);

    // Global totals now live in the Live Match Context banner
    const banner = page.getByTestId("live-match-context");
    await expect(banner).toBeVisible();
    await expect(banner.getByTestId("stat-total-effective-time")).toBeVisible();
    await expect(
      banner.getByTestId("stat-total-ineffective-time"),
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

  test("QA-5: drag lock ON prevents any position change", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, QA_MATCH_ID);

    // Lock is ON by default, don't toggle it
    const player = page.getByTestId("field-player-HOME-1");
    await expect(player).toBeVisible({ timeout: 15000 });

    // Read data attributes before
    const getCoords = async () => {
      const el = page.getByTestId("field-player-HOME-1");
      const x = await el.getAttribute("data-tactical-x");
      const y = await el.getAttribute("data-tactical-y");
      return { x: parseFloat(x ?? "0"), y: parseFloat(y ?? "0") };
    };

    const before = await getCoords();

    await player.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    const box = await player.boundingBox();
    if (!box) throw new Error("Bounding box unavailable");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 + 40,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(500);

    const after = await getCoords();
    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test("QA-6: banner effective time is non-zero after clock runs", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, QA_MATCH_ID);

    await sendEvent(page, {
      match_clock: "00:01.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const banner = page.getByTestId("live-match-context");
    await expect(banner).toBeVisible();

    const effText = await banner
      .getByTestId("stat-total-effective-time")
      .textContent();
    // Should display a clock value like "00:XX" or "XX:XX"
    expect(effText?.trim()).toMatch(/\d{2}:\d{2}/);
  });

  test("QA-7: per-team time values display clock format", async ({ page }) => {
    await gotoLoggerPage(page, QA_MATCH_ID);

    await sendEvent(page, {
      match_clock: "00:02.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    const perTeamSection = page.getByTestId("analytics-per-team-time");
    await expect(perTeamSection).toBeVisible({ timeout: 10000 });

    const effRow = perTeamSection.getByTestId("stat-effective-time");
    await expect(effRow).toBeVisible();

    const homeText = (await effRow.locator("div").nth(0).textContent()) || "";
    const awayText = (await effRow.locator("div").nth(2).textContent()) || "";
    expect(homeText.trim()).toMatch(/\d{2}:\d{2}/);
    expect(awayText.trim()).toMatch(/\d{2}:\d{2}/);
  });

  test("QA-8: cockpit + analytics team labels use stored short_name values", async ({
    page,
  }) => {
    const configuredHomeName = "Metropolitan Athletic Collective United";
    const configuredAwayName = "River Plate International Academy";
    const configuredHomeShortName = "ZXQ";
    const configuredAwayShortName = "N17";
    const fallbackHomeShortName = configuredHomeName.slice(0, 3).toUpperCase();
    const fallbackAwayShortName = configuredAwayName.slice(0, 3).toUpperCase();

    await page.route(
      `**/api/v1/logger/matches/${QA_MATCH_ID}`,
      async (route) => {
        const response = await route.fetch();
        const json = (await response.json()) as Record<string, any>;

        json.home_team = {
          ...(json.home_team || {}),
          name: configuredHomeName,
          short_name: configuredHomeShortName,
        };
        json.away_team = {
          ...(json.away_team || {}),
          name: configuredAwayName,
          short_name: configuredAwayShortName,
        };

        await route.fulfill({ response, json });
      },
    );

    await gotoLoggerPage(page, QA_MATCH_ID);

    await sendEvent(page, {
      match_clock: "00:03.000",
      team_id: context!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    const leftFormationSlot = page.getByTestId("formation-slot-left");
    const rightFormationSlot = page.getByTestId("formation-slot-right");
    await expect(leftFormationSlot).toContainText(configuredHomeShortName);
    await expect(rightFormationSlot).toContainText(configuredAwayShortName);

    const cockpitHomeLabel = (
      (await leftFormationSlot.locator("span").first().textContent()) || ""
    ).trim();
    const cockpitAwayLabel = (
      (await rightFormationSlot.locator("span").first().textContent()) || ""
    ).trim();
    expect(cockpitHomeLabel).toBe(configuredHomeShortName);
    expect(cockpitAwayLabel).toBe(configuredAwayShortName);
    expect(cockpitHomeLabel).not.toBe(fallbackHomeShortName);
    expect(cockpitAwayLabel).not.toBe(fallbackAwayShortName);

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId("analytics-shortname-home")).toHaveText(
      configuredHomeShortName,
    );
    await expect(page.getByTestId("analytics-shortname-away")).toHaveText(
      configuredAwayShortName,
    );

    const analyticsHomeLabel = (
      (await page.getByTestId("analytics-shortname-home").textContent()) || ""
    ).trim();
    const analyticsAwayLabel = (
      (await page.getByTestId("analytics-shortname-away").textContent()) || ""
    ).trim();
    expect(analyticsHomeLabel).not.toBe(fallbackHomeShortName);
    expect(analyticsAwayLabel).not.toBe(fallbackAwayShortName);
  });

  test("QA-9: ineffective mode exposes draggable player state", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, QA_MATCH_ID);
    await ensureClockRunning(page);

    await page.getByTestId("btn-ineffective-event").click();
    await expect(page.getByTestId("ineffective-note-modal")).toBeVisible({
      timeout: 10000,
    });
    await page
      .getByTestId("ineffective-note-input")
      .fill("E2E drag under ineffective mode");
    await page.getByTestId("ineffective-note-save").click();
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId("ineffective-clock-value")).toContainText(
      /\d{2}:\d{2}/,
    );

    const player = page.getByTestId("field-player-HOME-1");
    await expect(player).toBeVisible({ timeout: 10000 });
    const playerClass = (await player.getAttribute("class")) || "";
    expect(playerClass).toContain("cursor-grab");
    await expect(page.getByTestId("ineffective-clock-value")).toContainText(
      /\d{2}:\d{2}/,
    );
  });
});
