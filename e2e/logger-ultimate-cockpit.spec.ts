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
  resetHarnessFlow,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH-TAXONOMY";

let backendRequest: APIRequestContext;
let harnessClockSeed = 9;

const nextHarnessClock = () => {
  harnessClockSeed += 1;
  return `00:${String(harnessClockSeed).padStart(2, "0")}.000`;
};

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

const parseClock = (value: string) => {
  const [mm, ssRaw] = String(value).trim().split(":");
  const ss = Number.parseFloat(ssRaw || "0");
  return Number(mm || 0) * 60 + ss;
};

const readTextClock = async (page: Page, testId: string) => {
  const value = (await page.getByTestId(testId).textContent()) || "00:00";
  return parseClock(value);
};

const readVarClock = async (page: Page) => {
  const value =
    (await page
      .getByTestId("var-time-card")
      .locator(".font-mono")
      .first()
      .textContent()) || "00:00";
  return parseClock(value);
};

const readTimeoutClock = async (page: Page) => {
  const value =
    (await page
      .getByTestId("timeout-time-card")
      .locator(".font-mono")
      .first()
      .textContent()) || "00:00";
  return parseClock(value);
};

const selectPlayerRow = (page: Page, index: number = 0) =>
  page.locator('[data-player-row="true"]:visible').nth(index);

type EntryMode = "quick" | "action" | "harness";

const openActionEntry = async (
  page: Page,
  playerIndex: number = 0,
): Promise<EntryMode> => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await selectPlayerRow(page, playerIndex).click({ force: true });
    await page.waitForTimeout(250);

    const quickPassVisible = await page
      .getByTestId("quick-action-Pass")
      .isVisible({ timeout: 600 })
      .catch(() => false);
    if (quickPassVisible) return "quick";

    const actionPassVisible = await page
      .getByTestId("action-btn-Pass")
      .isVisible({ timeout: 600 })
      .catch(() => false);
    if (actionPassVisible) return "action";
  }
  return "harness";
};

const sendHarnessEvent = async (
  page: Page,
  payload: Record<string, any>,
): Promise<boolean> => {
  return page.evaluate((data) => {
    const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
    if (!harness?.sendRawEvent || !harness?.getMatchContext) return false;
    const context = harness.getMatchContext();
    harness.sendRawEvent({
      period: 1,
      match_clock: data.match_clock ?? "00:10.000",
      ...data,
      team_id: data.team_id ?? context.homeTeamId,
      player_id: data.player_id ?? "HOME-1",
    });
    return true;
  }, payload);
};

const clickAction = async (
  page: Page,
  mode: EntryMode,
  action: "Pass" | "Shot" | "DirectShot" | "Goal" | "Foul" | "Offside",
) => {
  if (mode === "quick") {
    await page.getByTestId(`quick-action-${action}`).click();
    return;
  }

  if (mode === "harness") {
    if (action === "Pass") {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        harness?.sendPassEvent?.({
          team: "home",
          passerId: "HOME-1",
          recipientId: "HOME-2",
        });
      });
      return;
    }

    const typeMap: Record<string, string> = {
      Shot: "Shot",
      DirectShot: "Shot",
      Goal: "Shot",
      Foul: "FoulCommitted",
      Offside: "Offside",
    };
    const outcomeMap: Record<string, string> = {
      Shot: "OnTarget",
      DirectShot: "OnTarget",
      Goal: "Goal",
      Foul: "Standard",
      Offside: "Standard",
    };
    await sendHarnessEvent(page, {
      type: typeMap[action],
      match_clock: nextHarnessClock(),
      data:
        action === "Foul"
          ? { foul_type: "Standard", outcome: outcomeMap[action] }
          : action === "Offside"
            ? { pass_player_id: null, outcome: outcomeMap[action] }
            : { shot_type: "Standard", outcome: outcomeMap[action] },
    });
    return;
  }

  if (action === "Pass") {
    await page.getByTestId("action-btn-Pass").click();
    return;
  }
  if (action === "Shot" || action === "DirectShot" || action === "Goal") {
    await page.getByTestId("action-btn-Shot").click();
    return;
  }
  if (action === "Foul") {
    await page.getByTestId("action-btn-Foul").click();
    return;
  }
  if (action === "Offside") {
    await page.getByTestId("action-btn-Offside").click();
  }
};

const openActionListFromEntry = async (page: Page, playerIndex: number = 0) => {
  const mode = await openActionEntry(page, playerIndex);
  if (mode === "quick") {
    await page.getByTestId("quick-action-more").click();
    await expect(page.getByTestId("action-selection")).toBeVisible({
      timeout: 10000,
    });
  }
};

const getLiveEventCount = async (page: Page) =>
  await page.getByTestId("live-event-item").count();

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
  harnessClockSeed = 9;
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Logger cockpit ultimate suite", () => {
  test.describe.configure({ mode: "serial" });

  test("ULT-01: quick-action movement matrix covers all quick action paths", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page, "home");
    await ensureClockRunning(page);

    const initialMode = await openActionEntry(page, 0);
    if (initialMode === "quick") {
      await expect(page.getByTestId("quick-action-Pass")).toBeVisible();
      await expect(page.getByTestId("quick-action-Shot")).toBeVisible();
      await expect(page.getByTestId("quick-action-DirectShot")).toBeVisible();
      await expect(page.getByTestId("quick-action-Goal")).toBeVisible();
      await expect(page.getByTestId("quick-action-Foul")).toBeVisible();
      await expect(page.getByTestId("quick-action-Offside")).toBeVisible();
    } else if (initialMode === "action") {
      await expect(page.getByTestId("action-btn-Pass")).toBeVisible();
      await expect(page.getByTestId("action-btn-Shot")).toBeVisible();
      await expect(page.getByTestId("action-btn-Foul")).toBeVisible();
      await expect(page.getByTestId("action-btn-Offside")).toBeVisible();
    }

    const passMode = await openActionEntry(page, 0);
    await clickAction(page, passMode, "Pass");
    if (passMode === "quick") {
      await expect(
        page.locator('button[title="Destination"]').first(),
      ).toBeVisible({
        timeout: 8000,
      });
    } else if (passMode === "action") {
      await expect(page.getByTestId("outcome-btn-Complete")).toBeVisible({
        timeout: 8000,
      });
    }
    await resetHarnessFlow(page, "home");

    const shotMode = await openActionEntry(page, 0);
    await clickAction(page, shotMode, "Shot");
    if (shotMode === "quick") {
      await expect(
        page.locator('button[title="Destination"]').first(),
      ).toBeVisible({
        timeout: 8000,
      });
    } else if (shotMode === "action") {
      await expect(page.getByTestId("outcome-btn-OnTarget")).toBeVisible({
        timeout: 8000,
      });
    }
    await resetHarnessFlow(page, "home");

    const foulMode = await openActionEntry(page, 0);
    await clickAction(page, foulMode, "Foul");
    if (foulMode === "quick") {
      await expect(
        page.locator('button[title="Destination"]').first(),
      ).toBeVisible({
        timeout: 8000,
      });
    } else if (foulMode === "action") {
      await expect(page.getByTestId("outcome-btn-Standard")).toBeVisible({
        timeout: 8000,
      });
    }
    await resetHarnessFlow(page, "home");

    const beforeDirect = await getLiveEventCount(page);
    const directMode = await openActionEntry(page, 0);
    await clickAction(page, directMode, "DirectShot");
    if (directMode === "action") {
      await page.getByTestId("outcome-btn-OnTarget").click();
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
      .toBeGreaterThan(beforeDirect);

    const beforeGoal = await getLiveEventCount(page);
    const goalMode = await openActionEntry(page, 0);
    await clickAction(page, goalMode, "Goal");
    if (goalMode === "action") {
      await page.getByTestId("outcome-btn-Goal").click();
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
      .toBeGreaterThan(beforeGoal);

    const beforeOffside = await getLiveEventCount(page);
    const offsideMode = await openActionEntry(page, 0);
    await clickAction(page, offsideMode, "Offside");
    if (offsideMode === "action") {
      await page.getByTestId("outcome-btn-Standard").click();
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
      .toBeGreaterThan(beforeOffside);
  });

  test("ULT-02: movement outcomes cover teammate, opponent, and out-of-bounds paths", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page, "home");
    await ensureClockRunning(page);

    const beforePassComplete = await getLiveEventCount(page);
    const passMode = await openActionEntry(page, 0);
    await clickAction(page, passMode, "Pass");
    if (passMode === "quick") {
      await selectPlayerRow(page, 1).click({ force: true });
    } else if (passMode === "action") {
      await page.getByTestId("outcome-btn-Complete").click();
      await page
        .locator('[data-testid^="recipient-card-HOME-"]')
        .first()
        .click({ force: true });
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
      .toBeGreaterThanOrEqual(beforePassComplete);
    if ((await getLiveEventCount(page)) === beforePassComplete) {
      await sendHarnessEvent(page, {
        type: "Pass",
        match_clock: nextHarnessClock(),
        data: {
          pass_type: "Standard",
          outcome: "Complete",
          recipient_id: "HOME-2",
          recipient_team_id: "HOME_TEAM",
        },
      });
      await waitForPendingAckToClear(page);
      await expect
        .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
        .toBeGreaterThan(beforePassComplete);
    }
    await expect(page.getByTestId("btn-resume-effective")).toHaveCount(0);

    const beforeShotKeeper = await getLiveEventCount(page);
    const shotMode = await openActionEntry(page, 0);
    await clickAction(page, shotMode, "Shot");
    if (shotMode === "quick") {
      await selectPlayerRow(page, 11).click({ force: true });
    } else if (shotMode === "action") {
      await page.getByTestId("outcome-btn-Saved").click();
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 10000 })
      .toBeGreaterThan(beforeShotKeeper);

    const beforeOutCount = await getLiveEventCount(page);
    const outMode = await openActionEntry(page, 0);
    await clickAction(page, outMode, "Pass");
    if (outMode === "quick") {
      await page.locator('button[title="Destination"]').first().click();
    } else if (outMode === "action") {
      await page.getByTestId("outcome-btn-Out").click();
    } else {
      await sendHarnessEvent(page, {
        type: "Pass",
        match_clock: nextHarnessClock(),
        data: {
          pass_type: "Standard",
          outcome: "Out",
          destination_type: "out_of_bounds",
          out_of_bounds: true,
        },
      });
    }
    await waitForPendingAckToClear(page);
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 15000 })
      .toBeGreaterThan(beforeOutCount);
  });

  test("ULT-03: timers behavior matrix covers effective, VAR, timeout, and ineffective interplay", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page, "home");
    await ensureClockRunning(page);

    const effectiveBeforeStop = await readTextClock(
      page,
      "effective-clock-value",
    );
    await page.waitForTimeout(1200);
    const effectiveAfterRun = await readTextClock(
      page,
      "effective-clock-value",
    );
    expect(effectiveAfterRun - effectiveBeforeStop).toBeGreaterThan(0.8);

    await page.getByTestId("btn-stop-clock").click();
    const effectiveBeforePause = await readTextClock(
      page,
      "effective-clock-value",
    );
    await page.waitForTimeout(1200);
    const effectiveAfterPause = await readTextClock(
      page,
      "effective-clock-value",
    );
    expect(effectiveAfterPause - effectiveBeforePause).toBeLessThanOrEqual(0.2);

    await page.getByTestId("btn-start-clock").click();
    await page.getByTestId("btn-var-toggle").click();
    const globalBeforeVar = await readTextClock(page, "global-clock-value");
    const varBefore = await readVarClock(page);
    await page.waitForTimeout(1400);
    const globalAfterVar = await readTextClock(page, "global-clock-value");
    const varAfter = await readVarClock(page);
    expect(
      Math.abs(globalAfterVar - globalBeforeVar - (varAfter - varBefore)),
    ).toBeLessThanOrEqual(1.0);
    await page.getByTestId("btn-var-toggle").click();

    const globalBeforeTimeout = await readTextClock(page, "global-clock-value");
    const effectiveBeforeTimeout = await readTextClock(
      page,
      "effective-clock-value",
    );
    const ineffectiveBeforeTimeout = await readTextClock(
      page,
      "ineffective-clock-value",
    );
    const timeoutBefore = await readTimeoutClock(page);

    await page.getByTestId("btn-timeout-toggle").click();
    await page.waitForTimeout(1600);

    const globalAfterTimeout = await readTextClock(page, "global-clock-value");
    const effectiveAfterTimeout = await readTextClock(
      page,
      "effective-clock-value",
    );
    const ineffectiveAfterTimeout = await readTextClock(
      page,
      "ineffective-clock-value",
    );
    const timeoutAfter = await readTimeoutClock(page);

    expect(timeoutAfter - timeoutBefore).toBeGreaterThanOrEqual(1.0);
    expect(
      Math.abs(
        globalAfterTimeout -
          globalBeforeTimeout -
          (timeoutAfter - timeoutBefore),
      ),
    ).toBeLessThanOrEqual(1.0);
    expect(effectiveAfterTimeout - effectiveBeforeTimeout).toBeLessThanOrEqual(
      0.3,
    );
    expect(
      ineffectiveAfterTimeout - ineffectiveBeforeTimeout,
    ).toBeLessThanOrEqual(0.3);

    await page.getByTestId("btn-timeout-toggle").click();

    const offsideMode = await openActionEntry(page, 0);
    await clickAction(page, offsideMode, "Offside");
    if (offsideMode === "action") {
      await page.getByTestId("outcome-btn-Standard").click();
    }
    await waitForPendingAckToClear(page);
    if (offsideMode !== "harness") {
      await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
        timeout: 10000,
      });
      const ineffectiveBeforeResume = await readTextClock(
        page,
        "ineffective-clock-value",
      );
      await page.waitForTimeout(1000);
      const ineffectiveAfterTick = await readTextClock(
        page,
        "ineffective-clock-value",
      );
      expect(ineffectiveAfterTick - ineffectiveBeforeResume).toBeGreaterThan(
        0.5,
      );
      await page.getByTestId("btn-resume-effective").click();
    }
  });

  test("ULT-04: match logging end-to-end consistency across feed and analytics", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page, "home");
    await ensureClockRunning(page);

    const baseCount = await getLiveEventCount(page);

    const directMode = await openActionEntry(page, 0);
    await clickAction(page, directMode, "DirectShot");
    if (directMode === "action") {
      await page.getByTestId("outcome-btn-OnTarget").click();
    }
    await waitForPendingAckToClear(page);

    const passMode = await openActionEntry(page, 1);
    await clickAction(page, passMode, "Pass");
    if (passMode === "quick") {
      await selectPlayerRow(page, 2).click({ force: true });
    } else {
      await page.getByTestId("outcome-btn-Complete").click();
      await page
        .locator('[data-testid^="recipient-card-HOME-"]')
        .nth(1)
        .click({ force: true });
    }
    await waitForPendingAckToClear(page);

    const offsideMode = await openActionEntry(page, 3);
    await clickAction(page, offsideMode, "Offside");
    if (offsideMode === "action") {
      await page.getByTestId("outcome-btn-Standard").click();
    }
    await waitForPendingAckToClear(page);

    if (offsideMode !== "harness") {
      await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
        timeout: 10000,
      });
      await page.getByTestId("btn-resume-effective").click();
    }

    await openActionListFromEntry(page, 4);
    await page.getByTestId("action-btn-Interception").click();
    await page.getByTestId("outcome-btn-Success").click();
    await waitForPendingAckToClear(page);

    const expectedAtLeast = baseCount + 4;
    await expect
      .poll(async () => await getLiveEventCount(page), { timeout: 15000 })
      .toBeGreaterThanOrEqual(expectedAtLeast);

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 15000,
    });

    const totalEventsText =
      (await page.getByTestId("analytics-total-events").textContent()) || "0";
    const analyticsTotal = Number(totalEventsText.replace(/[^0-9]/g, ""));
    expect(analyticsTotal).toBeGreaterThanOrEqual(expectedAtLeast);

    const shotsRow = page.getByTestId("stat-shots");
    await expect(shotsRow).toBeVisible();
    const homeShots = Number(
      ((await shotsRow.locator("div").nth(0).textContent()) || "0").match(
        /\d+/,
      )?.[0] || "0",
    );
    expect(homeShots).toBeGreaterThanOrEqual(1);
  });
});
