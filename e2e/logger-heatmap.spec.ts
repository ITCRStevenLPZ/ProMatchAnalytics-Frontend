/**
 * E2E: Heat-map section in cockpit analytics view.
 *
 * Tests:
 *  1. Heat-map section renders with three maps (home, away, combined)
 *  2. Events without location do NOT add to heat-map counts
 *  3. Events WITH location are reflected in correct zones
 *  4. Toggling analytics ↔ logger preserves heat-map state
 *  5. Heat-map colour gradient scales with event density
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

const HEATMAP_MATCH_ID = "E2E-MATCH-HEATMAP";

let backendRequest: APIRequestContext;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

const sendEvent = async (
  page: Page,
  payload: {
    match_clock: string;
    period?: number;
    team_id: string;
    player_id: string;
    type: string;
    data: Record<string, any>;
    location?: [number, number];
  },
) => {
  await sendRawEventThroughHarness(page, {
    period: payload.period ?? 1,
    ...payload,
  });
  await waitForPendingAckToClear(page);
};

const openAnalytics = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  if (await panel.isVisible().catch(() => false)) return;
  const btn = page.getByTestId("toggle-analytics");
  await expect(btn).toBeVisible({ timeout: 10000 });
  await btn.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await btn.click();
  await expect(panel).toBeVisible({ timeout: 15000 });
};

const switchToLogger = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  if (!(await panel.isVisible().catch(() => false))) return;
  // Click the "Logger" button inside the analytics toggle
  await page.getByTestId("toggle-analytics").click();
  await expect(panel).not.toBeVisible({ timeout: 5000 });
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
    data: { matchId: HEATMAP_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

test.describe("Heat-map analytics", () => {
  test.describe.configure({ mode: "serial" });

  test("renders heat-map section with three maps on analytics view", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, HEATMAP_MATCH_ID);
    await setRole(page, "admin");

    await openAnalytics(page);

    // The heat-map section container should be visible
    const section = page.getByTestId("heatmap-section");
    await expect(section).toBeVisible({ timeout: 15000 });

    // Three SVG fields: home, away, combined
    await expect(page.getByTestId("heatmap-home")).toBeVisible();
    await expect(page.getByTestId("heatmap-away")).toBeVisible();
    await expect(page.getByTestId("heatmap-match")).toBeVisible();

    // Each should have an SVG element
    await expect(page.getByTestId("heatmap-home-svg")).toBeVisible();
    await expect(page.getByTestId("heatmap-away-svg")).toBeVisible();
    await expect(page.getByTestId("heatmap-match-svg")).toBeVisible();
  });

  test("events with location populate the correct heat-map zones", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, HEATMAP_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context!.homeTeamId;
    const awayTeamId = context!.awayTeamId;

    // Send home events with locations covering different zones
    // Zone 0: x=10, y=10 → col 0, row 0
    await sendEvent(page, {
      match_clock: "01:00.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
      },
      location: [10, 10],
    });

    // Zone 0 again (same spot, should increment count)
    await sendEvent(page, {
      match_clock: "01:05.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-3",
      },
      location: [15, 15],
    });

    // Zone 15: x=65, y=45 → col 3, row 2
    await sendEvent(page, {
      match_clock: "01:10.000",
      team_id: homeTeamId,
      player_id: "HOME-3",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
      location: [65, 45],
    });

    // Away event in zone 23: x=110, y=70 → col 5, row 3
    await sendEvent(page, {
      match_clock: "01:15.000",
      team_id: awayTeamId,
      player_id: "AWAY-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "AWAY-2",
      },
      location: [110, 70],
    });

    await openAnalytics(page);

    // Home heat map should show zone 0 with count 2
    const homeZone0 = page.getByTestId("heatmap-home-zone-0");
    await expect(homeZone0).toBeVisible();
    await expect(homeZone0).toHaveAttribute("data-zone-count", "2");

    // Home zone 15 should have count 1
    const homeZone15 = page.getByTestId("heatmap-home-zone-15");
    await expect(homeZone15).toHaveAttribute("data-zone-count", "1");

    // Away heat map zone 23 should have count 1
    const awayZone23 = page.getByTestId("heatmap-away-zone-23");
    await expect(awayZone23).toHaveAttribute("data-zone-count", "1");

    // Combined map should have all events
    const matchZone0 = page.getByTestId("heatmap-match-zone-0");
    await expect(matchZone0).toHaveAttribute("data-zone-count", "2");

    const matchZone23 = page.getByTestId("heatmap-match-zone-23");
    await expect(matchZone23).toHaveAttribute("data-zone-count", "1");
  });

  test("events without location are excluded from heat map", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, HEATMAP_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context!.homeTeamId;

    // Send event WITHOUT location
    await sendEvent(page, {
      match_clock: "02:00.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
      },
    });

    // Send event WITH location
    await sendEvent(page, {
      match_clock: "02:05.000",
      team_id: homeTeamId,
      player_id: "HOME-2",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
      location: [60, 40],
    });

    await openAnalytics(page);

    // The combined map should only show 1 event (the one with location)
    // Zone 15 (centre of pitch): should have count 1
    const matchZone15 = page.getByTestId("heatmap-match-zone-15");
    await expect(matchZone15).toHaveAttribute("data-zone-count", "1");

    // Zone 0 should have count 0 (the event without location was excluded)
    const matchZone0 = page.getByTestId("heatmap-match-zone-0");
    await expect(matchZone0).toHaveAttribute("data-zone-count", "0");
  });

  test("heat map state persists when toggling analytics → logger → analytics", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, HEATMAP_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context!.homeTeamId;

    // Send events with location
    await sendEvent(page, {
      match_clock: "03:00.000",
      team_id: homeTeamId,
      player_id: "HOME-1",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-2",
      },
      location: [30, 30],
    });

    // Open analytics and verify heat map
    await openAnalytics(page);
    const section = page.getByTestId("heatmap-section");
    await expect(section).toBeVisible({ timeout: 15000 });

    // Zone 7: x=30, y=30 → col 1, row 1
    const homeZone7 = page.getByTestId("heatmap-home-zone-7");
    await expect(homeZone7).toHaveAttribute("data-zone-count", "1");

    // Switch back to logger
    await switchToLogger(page);

    // Add another event while in logger view
    await sendEvent(page, {
      match_clock: "03:05.000",
      team_id: homeTeamId,
      player_id: "HOME-2",
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: "HOME-3",
      },
      location: [30, 35],
    });

    // Switch back to analytics — heat map should reflect both events
    await openAnalytics(page);
    await expect(section).toBeVisible({ timeout: 15000 });

    // Zone 7 should now have count 2
    const homeZone7Again = page.getByTestId("heatmap-home-zone-7");
    await expect(homeZone7Again).toHaveAttribute("data-zone-count", "2");
  });

  test("heat map zones use colour gradient based on density", async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, HEATMAP_MATCH_ID);
    await setRole(page, "admin");

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context!.homeTeamId;

    // Create a density gradient: zone 0 gets 5 events, zone 7 gets 2, zone 15 gets 1
    for (let i = 0; i < 5; i++) {
      await sendEvent(page, {
        match_clock: `04:${String(i).padStart(2, "0")}.000`,
        team_id: homeTeamId,
        player_id: "HOME-1",
        type: "Pass",
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: "HOME-2",
        },
        location: [10, 10],
      });
    }
    for (let i = 0; i < 2; i++) {
      await sendEvent(page, {
        match_clock: `04:1${i}.000`,
        team_id: homeTeamId,
        player_id: "HOME-2",
        type: "Pass",
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          receiver_id: "HOME-3",
        },
        location: [30, 30],
      });
    }
    await sendEvent(page, {
      match_clock: "04:20.000",
      team_id: homeTeamId,
      player_id: "HOME-3",
      type: "Shot",
      data: { shot_type: "Standard", outcome: "OnTarget" },
      location: [65, 45],
    });

    await openAnalytics(page);

    // Zone 0 (max density = 5) should have a fill colour (not transparent)
    const zone0 = page.getByTestId("heatmap-home-zone-0");
    await expect(zone0).toBeVisible();
    const fill0 = await zone0.getAttribute("fill");
    expect(fill0).not.toBe("rgba(0,0,0,0)");
    // The hottest zone should have red-ish fill (intensity = 1.0)
    expect(fill0).toMatch(/^rgba\(220,40,0,/);

    // Zone 7 (2/5 = 0.4 intensity) should be yellow-ish
    const zone7 = page.getByTestId("heatmap-home-zone-7");
    const fill7 = await zone7.getAttribute("fill");
    expect(fill7).not.toBe("rgba(0,0,0,0)");
    // Green channel should be higher than zone 0 (more yellow)
    const g7 = parseInt((fill7 ?? "").split(",")[1]);
    expect(g7).toBeGreaterThan(100);

    // Zone 15 (1/5 = 0.2 intensity) should be most yellow
    const zone15 = page.getByTestId("heatmap-home-zone-15");
    const fill15 = await zone15.getAttribute("fill");
    expect(fill15).not.toBe("rgba(0,0,0,0)");

    // An unfilled zone should be transparent
    const zone23 = page.getByTestId("heatmap-home-zone-23");
    const fill23 = await zone23.getAttribute("fill");
    expect(fill23).toBe("rgba(0,0,0,0)");
  });
});
