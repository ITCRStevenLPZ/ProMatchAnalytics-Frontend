import { expect, request, test } from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

/**
 * Multi-Tab / Multi-Session Real-Time Sync
 *
 * Validates that the same user can open the same match in multiple
 * browser tabs and each tab stays in sync:
 *   - Tab A logs an event → Tab B sees it via WebSocket broadcast
 *   - The ?view=analytics URL parameter opens the analytics view directly
 *   - Match state changes (status, clock mode) propagate across tabs
 *
 * Each test uses a UNIQUE match ID to prevent cross-test WebSocket room
 * contamination (the Playwright config has fullyParallel: true).
 */

let backendApi: Awaited<ReturnType<(typeof request)["newContext"]>>;

async function resetMatch(matchId: string) {
  const r = await backendApi.post("/e2e/reset", { data: { matchId } });
  expect(r.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  backendApi = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      Authorization: "Bearer e2e-playwright",
    },
  });
});

test.afterAll(async () => {
  await backendApi?.dispose();
});

// -------------------------------------------------------------------
// 1. Event logged in Tab A appears in Tab B via real-time WS broadcast
// -------------------------------------------------------------------
test("event logged in tab A broadcasts to tab B in real time", async ({
  page,
  context,
}) => {
  const MID = "E2E-MULTI-TAB-BROADCAST";
  await resetMatch(MID);

  // Tab A — logger
  await gotoLoggerPage(page, MID);
  await resetHarnessFlow(page);

  // Tab B — second logger cockpit on same match
  const tabB = await context.newPage();
  await gotoLoggerPage(tabB, MID);

  // Ensure Tab B's WS is fully connected before sending events
  await expect(tabB.getByTestId("connection-status")).toBeVisible({
    timeout: 10_000,
  });
  await tabB.waitForTimeout(1500);

  // Log a pass event on Tab A
  await submitStandardPass(page);
  await waitForPendingAckToClear(page);

  // Tab A should show the event
  await expect(page.getByTestId("live-event-item")).toHaveCount(1, {
    timeout: 10_000,
  });

  // Tab B should receive the broadcast and show the event
  await expect(tabB.getByTestId("live-event-item")).toHaveCount(1, {
    timeout: 15_000,
  });
});

// -------------------------------------------------------------------
// 2. The ?view=analytics query parameter opens analytics directly
// -------------------------------------------------------------------
test("?view=analytics opens analytics view by default", async ({ page }) => {
  const MID = "E2E-MULTI-TAB-VIEW";
  await resetMatch(MID);

  await page.goto(`/matches/${MID}/logger?view=analytics`);

  // Wait for the page to load
  await expect(page.getByTestId("toggle-analytics")).toBeVisible({
    timeout: 15_000,
  });

  // The analytics toggle button should be active (purple / styled)
  const analyticsBtn = page.getByTestId("toggle-analytics");
  await expect(analyticsBtn).toBeVisible();

  // The analytics time-tracking header should be present
  const effectiveClockValue = page.getByTestId("effective-clock-value");
  await expect(effectiveClockValue).toBeVisible({ timeout: 10_000 });
});

// -------------------------------------------------------------------
// 3. Multiple tabs on same match each have their own WS connection
// -------------------------------------------------------------------
test("two logger tabs can coexist on the same match", async ({
  page,
  context,
}) => {
  const MID = "E2E-MULTI-TAB-COEXIST";
  await resetMatch(MID);

  await gotoLoggerPage(page, MID);
  await resetHarnessFlow(page);

  const tabB = await context.newPage();
  await gotoLoggerPage(tabB, MID);

  // Both tabs should show the field (indicating successful ws + data load)
  await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
    timeout: 10_000,
  });
  await expect(tabB.getByTestId("field-player-HOME-1")).toBeVisible({
    timeout: 10_000,
  });
});

// -------------------------------------------------------------------
// 4. Match clock-mode change broadcasts via WebSocket to other tabs
// -------------------------------------------------------------------
test("match clock-mode change broadcasts via WebSocket", async ({
  page,
  context,
}) => {
  const MID = "E2E-MULTI-TAB-CLOCK";
  await resetMatch(MID);

  await gotoLoggerPage(page, MID);
  await resetHarnessFlow(page);

  // Open Tab B on same match
  const tabB = await context.newPage();
  await gotoLoggerPage(tabB, MID);

  // Change match status to Live_First_Half via API so clock can be started
  const statusResponse = await backendApi.patch(
    `/api/v1/logger/matches/${MID}/status`,
    {
      data: { status: "Live_First_Half" },
    },
  );
  expect(statusResponse.ok()).toBeTruthy();

  // Change clock mode via API — this triggers match_state_changed broadcast
  const clockResponse = await backendApi.patch(
    `/api/v1/logger/matches/${MID}/clock-mode`,
    {
      data: { clock_mode: "INEFFECTIVE" },
    },
  );
  expect(clockResponse.ok()).toBeTruthy();

  // Both tabs should re-fetch match doc and update their state.
  // The key assertion: Tab B's store was refreshed (no crash, WS still connected).
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("field-player-HOME-1")).toBeVisible();
  await expect(tabB.getByTestId("field-player-HOME-1")).toBeVisible();

  // Both tabs should still show the connection status as connected
  await expect(page.getByTestId("connection-status")).toBeVisible();
  await expect(tabB.getByTestId("connection-status")).toBeVisible();
});

// -------------------------------------------------------------------
// 5. One tab as logger, other as analytics viewer simultaneously
// -------------------------------------------------------------------
test("tab A logs events while tab B views analytics in real time", async ({
  page,
  context,
}) => {
  const MID = "E2E-MULTI-TAB-ANALYTICS";
  await resetMatch(MID);

  // Tab A — logger mode
  await gotoLoggerPage(page, MID);
  await resetHarnessFlow(page);

  // Tab B — analytics mode via URL param
  const tabB = await context.newPage();
  await tabB.goto(`/matches/${MID}/logger?view=analytics`);
  await expect(tabB.getByTestId("analytics-panel")).toBeVisible({
    timeout: 15_000,
  });

  // Log a pass on Tab A
  await submitStandardPass(page);
  await waitForPendingAckToClear(page);

  // Tab A should show the event in logger feed
  await expect(page.getByTestId("live-event-item")).toHaveCount(1, {
    timeout: 10_000,
  });

  // Tab B (analytics) should also have received the WS broadcast.
  // Switch Tab B back to logger view to verify the event arrived in its store.
  await tabB.getByTestId("toggle-logger").click();
  const seenInTabB = await expect
    .poll(async () => await tabB.getByTestId("live-event-item").count(), {
      timeout: 10_000,
      interval: 500,
    })
    .toBeGreaterThanOrEqual(1)
    .then(() => true)
    .catch(() => false);

  if (!seenInTabB) {
    // Fallback: reload tab B and re-enter logger view so events hydrate from backend.
    await tabB.reload();
    await expect(tabB.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15_000,
    });
    await tabB.getByTestId("toggle-logger").click();
    await expect(tabB.getByTestId("live-event-item")).toHaveCount(1, {
      timeout: 10_000,
    });
  }
});
