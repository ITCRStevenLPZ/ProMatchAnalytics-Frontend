/**
 * E2E: Player Statistics Table
 *
 * Validates the per-player analytics table inside the cockpit analytics view.
 * Covers: pass good/bad + received, shots + goals, duels, fouls committed/received,
 * defensive actions, cards, team filtering, and sorting.
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
  getHarnessMatchContext,
  gotoLoggerPage,
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-PLAYER-STATS";

let backendRequest: APIRequestContext;

/* ── helpers ────────────────────────────────────────────────── */

const setRole = async (page: Page, role: "admin" | "analyst") => {
  await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
  await page.evaluate((r) => {
    const store = (globalThis as any).__PROMATCH_AUTH_STORE__;
    const u = store?.getState?.().user || {
      uid: "e2e-user",
      email: "e2e@test.com",
      displayName: "E2E",
      photoURL: "",
    };
    store?.getState?.().setUser?.({ ...u, role: r });
  }, role);
  await page.waitForFunction(
    (r) =>
      (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === r,
    role,
  );
};

const send = async (
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
  await sendRawEventThroughHarness(page, { period: 1, ...payload });
  await waitForPendingAckToClear(page);
};

const openAnalytics = async (page: Page) => {
  await page.getByTestId("toggle-analytics").click();
  await expect(page.getByTestId("analytics-panel")).toBeVisible({
    timeout: 15000,
  });
};

/**
 * Read a cell value from the player stats grid.
 * Column abbreviations: # EVT PG PB PR SH SOT G DW DL FC FR INT REC CLR BLK YC RC
 */
const cellNum = async (
  page: Page,
  playerId: string,
  colAbbr: string,
): Promise<number> => {
  const cell = page.getByTestId(`ps-${playerId}-${colAbbr}`);
  await expect(cell).toBeVisible({ timeout: 10000 });
  const raw = ((await cell.textContent()) ?? "").trim();
  if (raw === "–" || raw === "") return 0;
  return Number(raw);
};

/* ── fixture lifecycle ──────────────────────────────────────── */

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
  const res = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATCH_ID },
  });
  expect(res.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

/* ── tests ──────────────────────────────────────────────────── */

test.describe("Player statistics table", () => {
  test.describe.configure({ mode: "serial" });

  test("PST-01: table appears after events are logged", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    await send(page, {
      match_clock: "01:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete", receiver_id: "HOME-2" },
    });

    await openAnalytics(page);
    await expect(page.getByTestId("player-stats-table")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("player-stats-grid")).toBeVisible();
  });

  test("PST-02: pass good/bad and received tallied correctly", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    // 2 complete passes HOME-1 → HOME-2, 1 incomplete pass HOME-1
    await send(page, {
      match_clock: "01:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete", receiver_id: "HOME-2" },
    });
    await send(page, {
      match_clock: "02:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete", receiver_id: "HOME-2" },
    });
    await send(page, {
      match_clock: "03:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Incomplete" },
    });

    await openAnalytics(page);

    // HOME-1: 2 good passes, 1 bad pass
    expect(await cellNum(page, "HOME-1", "PG")).toBe(2);
    expect(await cellNum(page, "HOME-1", "PB")).toBe(1);

    // HOME-2: 2 passes received (created implicitly by receiver_id)
    expect(await cellNum(page, "HOME-2", "PR")).toBe(2);
  });

  test("PST-03: shots, shots on target, and goals", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    await send(page, {
      match_clock: "10:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Shot",
      data: { outcome: "Goal" },
    });
    await send(page, {
      match_clock: "15:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Shot",
      data: { outcome: "Saved" },
    });
    await send(page, {
      match_clock: "20:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Shot",
      data: { outcome: "OffTarget" },
    });

    await openAnalytics(page);

    expect(await cellNum(page, "HOME-1", "SH")).toBe(3);
    expect(await cellNum(page, "HOME-1", "SOT")).toBe(2); // Goal + Saved
    expect(await cellNum(page, "HOME-1", "G")).toBe(1);
  });

  test("PST-04: duels won and lost", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    await send(page, {
      match_clock: "05:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Duel",
      data: { outcome: "Won" },
    });
    await send(page, {
      match_clock: "06:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Duel",
      data: { outcome: "Lost" },
    });

    await openAnalytics(page);

    expect(await cellNum(page, "HOME-1", "DW")).toBe(1);
    expect(await cellNum(page, "HOME-1", "DL")).toBe(1);
  });

  test("PST-05: fouls committed and received", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    // HOME-1 fouls AWAY-1
    await send(page, {
      match_clock: "12:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "FoulCommitted",
      data: { target_player_id: "AWAY-1" },
    });

    await openAnalytics(page);

    expect(await cellNum(page, "HOME-1", "FC")).toBe(1);
    expect(await cellNum(page, "AWAY-1", "FR")).toBe(1);
  });

  test("PST-06: cards tracked per player", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    await send(page, {
      match_clock: "30:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Card",
      data: { card_type: "Yellow" },
    });
    await send(page, {
      match_clock: "40:00",
      team_id: ctx!.awayTeamId,
      player_id: "AWAY-1",
      type: "Card",
      data: { card_type: "Red" },
    });

    await openAnalytics(page);

    expect(await cellNum(page, "HOME-1", "YC")).toBe(1);
    expect(await cellNum(page, "HOME-1", "RC")).toBe(0);
    expect(await cellNum(page, "AWAY-1", "RC")).toBe(1);
  });

  test("PST-07: defensive actions (interceptions, recoveries, clearances, blocks)", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    await send(page, {
      match_clock: "25:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Interception",
      data: { outcome: "Success" },
    });
    await send(page, {
      match_clock: "26:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Recovery",
      data: { recovery_type: "Tackle" },
    });
    await send(page, {
      match_clock: "27:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Clearance",
      data: { outcome: "Success" },
    });
    await send(page, {
      match_clock: "28:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Block",
      data: { block_type: "Shot", outcome: "Success" },
    });

    await openAnalytics(page);

    expect(await cellNum(page, "HOME-2", "INT")).toBe(1);
    expect(await cellNum(page, "HOME-2", "REC")).toBe(1);
    expect(await cellNum(page, "HOME-2", "CLR")).toBe(1);
    expect(await cellNum(page, "HOME-2", "BLK")).toBe(1);
    expect(await cellNum(page, "HOME-2", "EVT")).toBe(4);
  });

  test("PST-08: team filter shows only selected team rows", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    // One event per team
    await send(page, {
      match_clock: "01:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });
    await send(page, {
      match_clock: "02:00",
      team_id: ctx!.awayTeamId,
      player_id: "AWAY-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    // Default "all" → both rows visible
    await expect(page.getByTestId("player-stats-row-HOME-1")).toBeVisible();
    await expect(page.getByTestId("player-stats-row-AWAY-1")).toBeVisible();

    // Filter to home
    await page.getByTestId("player-stats-filter-home").click();
    await expect(page.getByTestId("player-stats-row-HOME-1")).toBeVisible();
    await expect(page.getByTestId("player-stats-row-AWAY-1")).not.toBeVisible();

    // Filter to away
    await page.getByTestId("player-stats-filter-away").click();
    await expect(page.getByTestId("player-stats-row-HOME-1")).not.toBeVisible();
    await expect(page.getByTestId("player-stats-row-AWAY-1")).toBeVisible();

    // Back to all
    await page.getByTestId("player-stats-filter-all").click();
    await expect(page.getByTestId("player-stats-row-HOME-1")).toBeVisible();
    await expect(page.getByTestId("player-stats-row-AWAY-1")).toBeVisible();
  });

  test("PST-09: sorting by column toggles sort direction", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    // HOME-1: 3 events, HOME-2: 1 event
    await send(page, {
      match_clock: "01:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });
    await send(page, {
      match_clock: "02:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });
    await send(page, {
      match_clock: "03:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete" },
    });
    await send(page, {
      match_clock: "04:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-2",
      type: "Pass",
      data: { outcome: "Complete" },
    });

    await openAnalytics(page);

    // Default sort is by EVT desc → HOME-1 should be first
    const grid = page.getByTestId("player-stats-grid");
    const firstRowBefore = grid.locator("tbody tr").first();
    await expect(firstRowBefore).toHaveAttribute(
      "data-testid",
      "player-stats-row-HOME-1",
    );

    // Click EVT header to toggle to ascending → HOME-2 (fewer events) first
    await page.getByTestId("player-stats-col-EVT").click();
    const firstRowAfter = grid.locator("tbody tr").first();
    await expect(firstRowAfter).toHaveAttribute(
      "data-testid",
      "player-stats-row-HOME-2",
    );
  });

  test("PST-10: mixed multi-player scenario aggregates correctly", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    const ctx = await getHarnessMatchContext(page);

    // HOME-1: 1 good pass → HOME-2, 1 shot goal, 1 foul on AWAY-1
    // AWAY-1: 1 duel won
    await send(page, {
      match_clock: "05:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: { outcome: "Complete", receiver_id: "HOME-2" },
    });
    await send(page, {
      match_clock: "10:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "Shot",
      data: { outcome: "Goal" },
    });
    await send(page, {
      match_clock: "15:00",
      team_id: ctx!.homeTeamId,
      player_id: "HOME-1",
      type: "FoulCommitted",
      data: { target_player_id: "AWAY-1" },
    });
    await send(page, {
      match_clock: "20:00",
      team_id: ctx!.awayTeamId,
      player_id: "AWAY-1",
      type: "Duel",
      data: { outcome: "Won" },
    });

    await openAnalytics(page);

    // HOME-1 totals
    expect(await cellNum(page, "HOME-1", "EVT")).toBe(3);
    expect(await cellNum(page, "HOME-1", "PG")).toBe(1);
    expect(await cellNum(page, "HOME-1", "G")).toBe(1);
    expect(await cellNum(page, "HOME-1", "FC")).toBe(1);

    // HOME-2 got a pass received
    expect(await cellNum(page, "HOME-2", "PR")).toBe(1);

    // AWAY-1: 1 duel won + 1 foul received
    expect(await cellNum(page, "AWAY-1", "DW")).toBe(1);
    expect(await cellNum(page, "AWAY-1", "FR")).toBe(1);
  });
});
