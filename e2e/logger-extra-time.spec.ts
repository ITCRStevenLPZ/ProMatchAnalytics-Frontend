import {
  test,
  expect,
  request,
  Page,
  APIRequestContext,
} from "@playwright/test";
import {
  createAdminApiContext,
  seedCompetition,
  seedVenue,
  seedReferee,
  seedTeam,
  rosterToMatchLineup,
  seedLoggerMatch,
} from "./utils/admin";

const MATCH_ID = "E2E-LOGGER-EXTRA-TIME";

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

const ensureAdminRole = async (page: Page) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await setRole(page, "admin");
    const role = await page.evaluate(
      () => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role,
    );
    if (role === "admin") return;
    await page.waitForTimeout(200);
  }
  throw new Error("Failed to set admin role");
};

const unlockStartStop = async (page: Page) => {
  await page.evaluate(() => {
    const start = document.querySelector(
      '[data-testid="btn-start-clock"]',
    ) as HTMLButtonElement | null;
    const stop = document.querySelector(
      '[data-testid="btn-stop-clock"]',
    ) as HTMLButtonElement | null;
    if (start) start.disabled = false;
    if (stop) stop.disabled = false;
  });
};

test.describe("Logger extra time transitions", () => {
  let backendRequest: APIRequestContext;
  let homeTeamId: string;
  let awayTeamId: string;

  test.beforeAll(async () => {
    const api = await createAdminApiContext();
    backendRequest = await request.newContext({
      baseURL: process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });

    const competition = await seedCompetition(api);
    const venue = await seedVenue(api);
    const referee = await seedReferee(api);
    const homeTeam = await seedTeam(api, {
      name: "ET Home",
      short_name: "ETH",
    });
    const awayTeam = await seedTeam(api, {
      name: "ET Away",
      short_name: "ETA",
    });
    homeTeamId = homeTeam.team_id;
    awayTeamId = awayTeam.team_id;

    await seedLoggerMatch(api, {
      match_id: MATCH_ID,
      competition_id: competition.competition_id,
      venue_id: venue.venue_id,
      referee_id: referee.referee_id,
      home_team: {
        team_id: homeTeam.team_id,
        name: "ET Home",
        lineup: rosterToMatchLineup(homeTeam.roster),
      },
      away_team: {
        team_id: awayTeam.team_id,
        name: "ET Away",
        lineup: rosterToMatchLineup(awayTeam.roster),
      },
    });
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  const resetMatch = async () => {
    const resp = await backendRequest.post("/e2e/reset", {
      data: { matchId: MATCH_ID },
    });
    expect(resp.ok()).toBeTruthy();
  };

  const setEffectiveSeconds = async (
    seconds: number,
    status: "Live_First_Half" | "Live_Second_Half",
  ) => {
    const resp = await backendRequest.patch(
      `/api/v1/logger/matches/${MATCH_ID}/clock-mode`,
      {
        data: {
          match_time_seconds: seconds,
          clock_seconds_at_period_start: seconds,
          clock_mode: "EFFECTIVE",
          current_period_start_timestamp: new Date().toISOString(),
        },
      },
    );
    expect(resp.ok()).toBeTruthy();

    const statusResp = await backendRequest.patch(
      `/api/v1/logger/matches/${MATCH_ID}/status`,
      { data: { status } },
    );
    expect(statusResp.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const res = await backendRequest.get(
            `/api/v1/logger/matches/${MATCH_ID}`,
          );
          if (!res.ok()) return 0;
          const body = await res.json();
          return body.match_time_seconds ?? 0;
        },
        { timeout: 10000, interval: 500 },
      )
      .toBeGreaterThanOrEqual(seconds);
  };

  test.beforeEach(async ({ page }) => {
    await resetMatch();
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await page.addInitScript(
      (user) => {
        try {
          localStorage.setItem(
            "auth-storage",
            JSON.stringify({ state: { user }, version: 0 }),
          );
        } catch {}
      },
      {
        uid: "e2e-admin",
        email: "e2e-admin@example.com",
        displayName: "E2E Admin",
        photoURL: "",
        role: "admin",
      },
    );
  });

  test("walks extra time for both halves via UI controls", async ({ page }) => {
    test.setTimeout(180000);

    await page.goto(`/matches/${MATCH_ID}/logger`);
    await ensureAdminRole(page);
    await unlockStartStop(page);
    await page.getByTestId("btn-start-clock").click({ timeout: 10000 });

    await setEffectiveSeconds(46 * 60 + 15, "Live_First_Half");

    await page.reload();
    await ensureAdminRole(page);

    await expect
      .poll(
        async () =>
          (
            await page.getByTestId("period-status-first-half").innerText()
          ).includes("+"),
        {
          timeout: 15000,
          interval: 500,
        },
      )
      .toBeTruthy();
    const endFirstHalfBtn = page.getByTestId("btn-end-first-half");
    await expect(endFirstHalfBtn).toBeEnabled({ timeout: 15000 });
    await endFirstHalfBtn.click();

    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByTestId("btn-start-second-half")).toBeEnabled({
      timeout: 15000,
    });
    await page.getByTestId("btn-start-second-half").click();

    await setEffectiveSeconds(91 * 60 + 10, "Live_Second_Half");

    await page.reload();
    await ensureAdminRole(page);

    await expect
      .poll(
        async () =>
          (
            await page.getByTestId("period-status-second-half").innerText()
          ).includes("+"),
        {
          timeout: 15000,
          interval: 500,
        },
      )
      .toBeTruthy();
    const endMatchBtn = page.getByTestId("btn-end-match");
    await expect(endMatchBtn).toBeEnabled({ timeout: 15000 });
    await endMatchBtn.click();

    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("btn-start-clock")).toBeDisabled({
      timeout: 10000,
    });
    await expect(page.getByTestId("btn-stop-clock")).toBeDisabled({
      timeout: 10000,
    });
  });
});
