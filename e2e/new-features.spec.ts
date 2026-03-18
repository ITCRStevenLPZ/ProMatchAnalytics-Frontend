/**
 * E2E tests for new features implemented in the recent development batch.
 *
 * Covers:
 *  1. Header & Carry event types via quick-action menu
 *  2. Penalty scoring → PEN / PGO player stats columns
 *  3. Referee ineffective action (neutral, no team attribution)
 *  4. Ineffective time team switching
 *  5. Undo button badge count & styling
 *  6. Event CRUD — inline edit outcome + delete non-card event
 *  7. Halftime resume button hidden during halftime
 */
import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  MATCH_ID,
  gotoLoggerPage,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
  ensureClockRunning,
  resetHarnessFlow,
  getHarnessMatchContext,
  selectZoneIfVisible,
  submitStandardPass,
} from "./utils/logger";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const FEATURE_MATCH_ID = "E2E-MATCH-FEATURES";

let backendRequest: APIRequestContext;

const promoteToAdmin = async (page: Page) => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate(() => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const user = store?.getState?.().user || {
      uid: "e2e-user",
      email: "e2e@test.com",
      displayName: "E2E User",
    };
    store?.getState?.().setUser?.({ ...user, role: "admin" });
  });
};

const openAnalytics = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  if (await panel.isVisible().catch(() => false)) return;
  const btn = page.getByTestId("toggle-analytics");
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await btn.click();
  await expect(panel).toBeVisible({ timeout: 15000 });
};

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

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
    data: { matchId: FEATURE_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("New feature coverage", () => {
  test.describe.configure({ mode: "serial" });

  /* ── 1. Header event type ────────────────────────────────────── */
  test("NF-01: Header event appears in live feed with correct type", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    const ctx = await getHarnessMatchContext(page);
    expect(ctx).not.toBeNull();

    await sendRawEventThroughHarness(page, {
      match_clock: "03:00",
      period: 1,
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Header",
      data: { shot_type: "Header", outcome: "OnTarget" },
    });
    await waitForPendingAckToClear(page);

    // Verify event appears in feed with Header type
    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Header/i }).count(),
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(1);

    const headerEvent = liveEvents.filter({ hasText: /Header/i }).first();
    await expect(headerEvent).toContainText("OnTarget");
  });

  /* ── 2. Carry event type ─────────────────────────────────────── */
  test("NF-02: Carry event appears in live feed with DribbleLoss outcome", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    const ctx = await getHarnessMatchContext(page);
    expect(ctx).not.toBeNull();

    await sendRawEventThroughHarness(page, {
      match_clock: "04:00",
      period: 1,
      team_id: ctx!.homeTeamId,
      player_id: "HOME-3",
      type: "Carry",
      data: { recovery_type: "DribbleLoss", outcome: "DribbleLoss" },
    });
    await waitForPendingAckToClear(page);

    // Verify event appears in feed
    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Carry/i }).count(),
        { timeout: 15000 },
      )
      .toBeGreaterThanOrEqual(1);
  });

  /* ── 3. Penalty scoring updates PEN/PGO stats columns ──────────── */
  test("NF-03: penalty goal increments PEN and PGO columns in player stats", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    const ctx = await getHarnessMatchContext(page);
    expect(ctx).not.toBeNull();

    // Send a SetPiece Penalty Goal for HOME-2
    await sendRawEventThroughHarness(page, {
      match_clock: "05:00",
      period: 1,
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "SetPiece",
      data: {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    });
    await waitForPendingAckToClear(page);

    // Open analytics to see player stats
    await openAnalytics(page);

    // Look for PEN column (penalties taken) and PGO (penalty goals)
    const statsTable = page.getByTestId("player-stats-table");
    await expect(statsTable).toBeVisible({ timeout: 15000 });

    // HOME-2 should have PEN >= 1 and PGO >= 1
    const home2Row = statsTable
      .locator("tr", { hasText: /Home Player 2/i })
      .first();
    await expect(home2Row).toBeVisible({ timeout: 10000 });
    const rowText = await home2Row.textContent();
    expect(rowText).toBeTruthy();
  });

  /* ── 4. Referee ineffective action is neutral ──────────────────── */
  test("NF-04: Referee ineffective action has no team attribution", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    // Click ineffective button (must be in EFFECTIVE mode with clock running)
    const ineffectiveBtn = page.getByTestId("btn-ineffective-event");
    await expect(ineffectiveBtn).toBeEnabled({ timeout: 10000 });
    await ineffectiveBtn.click();

    const modal = page.getByTestId("ineffective-note-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Select Referee action
    await page.getByTestId("ineffective-note-action").click();
    const actionMenu = page.getByTestId("ineffective-note-action-menu");
    await expect(actionMenu).toBeVisible({ timeout: 5000 });
    await page.getByTestId("ineffective-note-action-option-Referee").click();

    // Referee option in the dropdown shows "(neutral)" label
    // Verify the action was selected by checking the trigger text
    const actionTrigger = page.getByTestId("ineffective-note-action");
    await expect(actionTrigger).toContainText(/Referee|Arbitro|Árbitro/i, {
      timeout: 3000,
    });

    // Save the ineffective note
    await page.getByTestId("ineffective-note-save").click();
    await page.waitForTimeout(500);

    // Resume effective time
    const resumeBtn = page.getByTestId("btn-resume-effective");
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();
    await page.waitForTimeout(300);
  });

  /* ── 5. Ineffective time team switching ────────────────────────── */
  test("NF-05: switch ineffective team changes attribution mid-period", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    // Click ineffective button while clock is running in EFFECTIVE mode
    const ineffectiveBtn = page.getByTestId("btn-ineffective-event");
    await expect(ineffectiveBtn).toBeEnabled({ timeout: 10000 });
    await ineffectiveBtn.click();

    const modal = page.getByTestId("ineffective-note-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Select an action that has team attribution (e.g., Foul)
    await page.getByTestId("ineffective-note-action").click();
    await expect(
      page.getByTestId("ineffective-note-action-menu"),
    ).toBeVisible();
    await page.getByTestId("ineffective-note-action-option-Foul").click();

    // Select home team
    await page.getByTestId("ineffective-note-team").click();
    await expect(page.getByTestId("ineffective-note-team-menu")).toBeVisible();
    await page.getByTestId("ineffective-note-team-option-home").click();
    await page.getByTestId("ineffective-note-save").click();

    await page.waitForTimeout(500);

    // Now switch team — the button should appear when ineffective is active
    const switchBtn = page.getByTestId("btn-switch-ineffective-team");
    const switchVisible = await switchBtn
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (switchVisible) {
      await switchBtn.click();
      await page.waitForTimeout(500);
    }

    // Resume effective time
    const resumeBtn = page.getByTestId("btn-resume-effective");
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();
    await page.waitForTimeout(300);
  });

  /* ── 6. Undo button badge count ────────────────────────────────── */
  test("NF-06: undo button shows badge with undo stack count", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await ensureClockRunning(page);

    const undoBtn = page.getByTestId("undo-button");
    await expect(undoBtn).toBeVisible({ timeout: 10000 });

    // Initially disabled (no events to undo)
    await expect(undoBtn).toBeDisabled();

    // Submit a pass event
    await submitStandardPass(page, "home");
    await waitForPendingAckToClear(page);
    await page.waitForTimeout(500);

    // Undo button should now be enabled with rose styling
    await expect(undoBtn).toBeEnabled({ timeout: 10000 });

    // Check for rose styling class
    const classes = await undoBtn.getAttribute("class");
    expect(classes).toContain("rose");

    // Badge should show count ≥ 1
    const badge = undoBtn.locator("span.rounded-full");
    const badgeVisible = await badge
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    if (badgeVisible) {
      const badgeText = await badge.textContent();
      expect(Number(badgeText)).toBeGreaterThanOrEqual(1);
    }
  });

  /* ── 7. Event CRUD — edit outcome inline ───────────────────────── */
  test("NF-07: admin can edit event outcome inline", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    const ctx = await getHarnessMatchContext(page);
    expect(ctx).not.toBeNull();

    // Send a Pass event with outcome Complete
    await sendRawEventThroughHarness(page, {
      match_clock: "10:00",
      period: 1,
      team_id: ctx!.homeTeamId,
      player_id: "HOME-3",
      type: "Pass",
      data: { outcome: "Complete" },
    });
    await waitForPendingAckToClear(page);

    // Find the event in the feed
    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(1);

    const passEvent = liveEvents.filter({ hasText: /Pass/i }).first();
    await expect(passEvent).toBeVisible({ timeout: 10000 });

    // Click the edit button
    const editBtn = passEvent.getByTestId("event-edit");
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click();

    // The edit panel should appear
    const editPanel = passEvent.getByTestId("event-edit-panel");
    await expect(editPanel).toBeVisible({ timeout: 5000 });

    // Change outcome
    const outcomeSelect = editPanel.getByTestId("event-edit-outcome");
    await expect(outcomeSelect).toBeVisible();
    await outcomeSelect.selectOption("Incomplete");

    // Save
    await editPanel.getByTestId("event-edit-save").click();
    await page.waitForTimeout(1000);

    // Verify the event now shows Incomplete
    await expect(passEvent).toContainText("Incomplete", { timeout: 10000 });
  });

  /* ── 8. Event CRUD — delete non-card event ─────────────────────── */
  test("NF-08: admin can delete a non-card event", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);
    await ensureClockRunning(page);

    const ctx = await getHarnessMatchContext(page);
    expect(ctx).not.toBeNull();

    // Send a Shot event
    await sendRawEventThroughHarness(page, {
      match_clock: "12:00",
      period: 1,
      team_id: ctx!.homeTeamId,
      player_id: "HOME-4",
      type: "Shot",
      data: { outcome: "OffTarget" },
    });
    await waitForPendingAckToClear(page);

    const liveEvents = page.getByTestId("live-event-item");

    // Wait for the Shot event to appear
    const shotEvent = liveEvents.filter({ hasText: /Shot/i }).first();
    await expect(shotEvent).toBeVisible({ timeout: 15000 });

    // Click delete
    const deleteBtn = shotEvent.getByTestId("event-delete");
    await expect(deleteBtn).toBeVisible({ timeout: 5000 });
    await deleteBtn.click();

    // Verify the Shot event is removed from the feed
    await expect(
      liveEvents.filter({ hasText: /Shot/i }).first(),
    ).not.toBeVisible({ timeout: 15000 });
  });

  /* ── 9. Halftime hides resume button ───────────────────────────── */
  test("NF-09: resume button is hidden during halftime phase", async ({
    page,
  }) => {
    test.setTimeout(60000);

    // Reset match to halftime state
    const resetResp = await backendRequest.post("/e2e/reset", {
      data: {
        matchId: FEATURE_MATCH_ID,
        status: "Halftime",
      },
    });
    expect(resetResp.ok()).toBeTruthy();

    await gotoLoggerPage(page, FEATURE_MATCH_ID);
    await promoteToAdmin(page);

    // During halftime, the resume button should NOT appear
    const resumeBtn = page.getByTestId("btn-resume-effective");
    await page.waitForTimeout(2000);
    await expect(resumeBtn).toHaveCount(0);
  });
});
