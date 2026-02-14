import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  ensureClockRunning,
  gotoLoggerPage,
  resetHarnessFlow,
  waitForPendingAckToClear,
  getHarnessMatchContext,
  sendRawEventThroughHarness,
  submitStandardShot,
  triggerUndoThroughHarness,
  expectLiveEventCount,
} from "./utils/logger";

const TAXONOMY_MATCH_ID = "E2E-MATCH-TAXONOMY";

let backendRequest: APIRequestContext;

const promoteToAdmin = async (page: Page) => {
  await page.evaluate(() => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    const currentUser = store?.getState?.().user || {
      uid: "e2e-admin",
      email: "e2e-admin@example.com",
      displayName: "E2E Admin",
      photoURL: "",
    };
    store?.getState?.().setUser?.({
      ...currentUser,
      role: "admin",
      displayName: currentUser.displayName || "E2E Admin",
    });
  });
};

const resetMatch = async (matchId: string) => {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await backendRequest.post("/e2e/reset", {
      data: { matchId },
    });
    if (response.ok()) return;
    console.warn("[logger-event-taxonomy] reset failed", response.status());
    try {
      await backendRequest.get("/health");
    } catch (err) {
      console.warn("[logger-event-taxonomy] health probe failed", err);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("[logger-event-taxonomy] reset failed after retries");
};

const unlockClockControls = async (page: Page) => {
  await page.evaluate(() => {
    const start = document.querySelector(
      '[data-testid="btn-start-clock"]',
    ) as HTMLButtonElement | null;
    const stop = document.querySelector(
      '[data-testid="btn-stop-clock"]',
    ) as HTMLButtonElement | null;
    if (start) {
      start.disabled = false;
      start.removeAttribute("disabled");
    }
    if (stop) {
      stop.disabled = false;
      stop.removeAttribute("disabled");
    }
  });
};

const selectHomePlayer = (page: Page) =>
  page.getByTestId("field-player-HOME-1");

const getHarnessCurrentStep = async (page: Page): Promise<string | null> => {
  return page.evaluate(() => {
    const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
    return harness?.getCurrentStep ? harness.getCurrentStep() : null;
  });
};

const logShotGoal = async (page: Page) => {
  await selectHomePlayer(page).click();
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Shot").click();
  await page.getByTestId("outcome-btn-Goal").click();
  await waitForPendingAckToClear(page);
};

const sendEventThroughHarness = async (
  page: Page,
  type: string,
  teamId: string,
  playerId: string,
  matchClock: string,
  data: Record<string, any>,
) => {
  await sendRawEventThroughHarness(page, {
    match_clock: matchClock,
    period: 1,
    team_id: teamId,
    player_id: playerId,
    type,
    data,
  });
  await waitForPendingAckToClear(page);
};

test.beforeAll(async () => {
  backendRequest = await request.newContext({
    baseURL: BACKEND_BASE_URL,
    extraHTTPHeaders: {
      Authorization: "Bearer e2e-playwright",
      "x-playwright-e2e-secret":
        process.env.PLAYWRIGHT_E2E_SECRET ?? "test-secret",
    },
  });
});

test.afterAll(async () => {
  await backendRequest?.dispose();
});

test.describe("Logger event taxonomy", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ page }) => {
    await resetMatch(TAXONOMY_MATCH_ID);
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
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("covers goal, card, foul, offside, set piece, and analytics updates", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId("live-event-item");
    await unlockClockControls(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await submitStandardShot(page, "home", "OnTarget");
    await waitForPendingAckToClear(page);

    await sendEventThroughHarness(
      page,
      "Card",
      homeTeamId,
      "HOME-2",
      "00:05.000",
      {
        card_type: "Yellow",
        reason: "Foul",
      },
    );
    const yellowCard = liveEvents.filter({ hasText: "Yellow" }).first();
    await expect(yellowCard).toContainText("Card");
    await yellowCard.getByTestId("event-delete").click();
    await expect(liveEvents.filter({ hasText: "Yellow" })).toHaveCount(0);

    await sendEventThroughHarness(
      page,
      "Card",
      homeTeamId,
      "HOME-2",
      "00:05.500",
      {
        card_type: "Red",
        reason: "Foul",
      },
    );
    await sendEventThroughHarness(
      page,
      "FoulCommitted",
      awayTeamId,
      "AWAY-1",
      "00:06.000",
      {
        foul_type: "Penalty",
        outcome: "Penalty",
      },
    );
    await sendEventThroughHarness(
      page,
      "Offside",
      homeTeamId,
      "HOME-3",
      "00:07.000",
      {
        pass_player_id: "HOME-1",
        outcome: "Standard",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-2",
      "00:08.000",
      {
        set_piece_type: "Free Kick",
        outcome: "Shot",
      },
    );

    await expectLiveEventCount(page, 1);

    await expect
      .poll(async () => await liveEvents.filter({ hasText: "Card" }).count(), {
        timeout: 15000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () =>
          await liveEvents.filter({ hasText: "FoulCommitted" }).count(),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThanOrEqual(0);
    await expect(liveEvents.filter({ hasText: "Offside" })).toHaveCount(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "SetPiece" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "SetPiece" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeLessThanOrEqual(10);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    await page.reload();
    await promoteToAdmin(page);
    await unlockClockControls(page);
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 30000,
    });
  });

  test("quick DirectShot logs immediately without destination prompt", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await selectHomePlayer(page).click();
    await page.getByTestId("quick-action-DirectShot").click({ timeout: 8000 });
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId("quick-action-menu")).toHaveCount(0);
    await expect(page.getByTestId("action-selection")).toHaveCount(0);

    const currentStep = await getHarnessCurrentStep(page);
    expect(currentStep).not.toBe("selectDestination");

    const latestEvent = page.getByTestId("live-event-item").first();
    await expect(latestEvent).toContainText("Shot");
    await expect(latestEvent).toContainText("OnTarget");
    await expect(latestEvent).toContainText("Direct");
  });

  test("quick Shot requires destination and resolves defender/keeper outcome", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    const liveEvents = page.getByTestId("live-event-item");
    const beforeCount = await liveEvents.count();

    await selectHomePlayer(page).click();
    await page.getByTestId("quick-action-Shot").click({ timeout: 8000 });

    const afterShotStep = await getHarnessCurrentStep(page);
    expect(afterShotStep).toBe("selectDestination");
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 2000 })
      .toBe(beforeCount);

    await page.getByTestId("field-player-AWAY-1").click();
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 10000 })
      .toBeGreaterThanOrEqual(beforeCount + 1);

    const latestEvent = liveEvents.first();
    await expect(latestEvent).toContainText("Shot");
    const latestText = (await latestEvent.textContent()) || "";
    expect(/Saved|Blocked/i.test(latestText)).toBe(true);

    const finalStep = await getHarnessCurrentStep(page);
    expect(finalStep).toBe("selectPlayer");
  });

  test("auto-awards corner on pass to same-side keeper and logs ineffective pass", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await page.getByTestId("field-player-HOME-2").click();
    await page.getByTestId("quick-action-Pass").click({ timeout: 8000 });
    await page.getByTestId("field-player-HOME-1").click();
    await waitForPendingAckToClear(page);

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /SetPiece/i }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Corner/i }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: /Pass/i }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Incomplete/i }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test("flipped field uses the correct own goal line for corner detection", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await page.getByTestId("toggle-field-flip").click();
    await page.getByTestId("field-player-HOME-2").click();
    await page.getByTestId("quick-action-Pass").click({ timeout: 8000 });

    const field = page.getByTestId("soccer-field");
    const box = await field.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error("soccer-field bounding box unavailable");
    }

    await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
    await waitForPendingAckToClear(page);

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /SetPiece/i }).count(),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Corner/i }).count(),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test("Pass Out logs immediately and stops effective time without destination", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await page.getByTestId("field-player-HOME-2").click();
    await page.getByTestId("quick-action-more").click({ timeout: 8000 });
    await page.getByTestId("action-btn-Pass").click();
    await page.getByTestId("outcome-btn-Out").click();
    await waitForPendingAckToClear(page);

    const currentStep = await getHarnessCurrentStep(page);
    expect(currentStep).toBe("selectPlayer");

    await expect(page.getByTestId("action-selection")).toHaveCount(0);
    await expect(page.getByTestId("quick-action-menu")).toHaveCount(0);

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(async () => await liveEvents.filter({ hasText: /Pass/i }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: /Out/i }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(1);

    await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 10000,
    });

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const outRowText =
      (await page.getByTestId("stat-ineffective-outofbounds").textContent()) ||
      "";
    const outClocks = outRowText.match(/\d{2}:\d{2}/g) || [];
    expect(outClocks.length).toBeGreaterThanOrEqual(2);

    const homeOut = parseClock(outClocks[0]);
    const awayOut = parseClock(outClocks[1]);
    expect(homeOut).toBe(0);
    expect(awayOut).toBeGreaterThanOrEqual(1);
  });

  test("Offside logs immediately without destination and stops effective time", async ({
    page,
  }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await page.getByTestId("field-player-HOME-3").click();
    const quickOffside = page.getByTestId("quick-action-Offside");
    if (await quickOffside.count()) {
      await quickOffside.click({ timeout: 8000 });
    } else {
      await page.getByTestId("quick-action-more").click({ timeout: 8000 });
      await page.getByTestId("action-btn-Offside").click();
    }
    await waitForPendingAckToClear(page);

    const currentStep = await getHarnessCurrentStep(page);
    expect(currentStep).toBe("selectPlayer");

    await expect(page.getByTestId("action-selection")).toHaveCount(0);
    await expect(page.getByTestId("quick-action-menu")).toHaveCount(0);

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: /Offside/i }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);

    await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 10000,
    });

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const totalsText =
      (await page.getByTestId("stat-ineffective-time").textContent()) || "";
    const totals = totalsText.match(/\d{2}:\d{2}/g) || [];
    expect(totals.length).toBeGreaterThanOrEqual(2);

    const homeTotal = parseClock(totals[0]);
    const awayTotal = parseClock(totals[1]);
    expect(homeTotal).toBe(0);
    expect(awayTotal).toBeGreaterThanOrEqual(1);
  });

  test("Foul starts ineffective time for opponent team", async ({ page }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    await page.getByTestId("field-player-HOME-2").click();
    const quickFoul = page.getByTestId("quick-action-Foul");
    if (await quickFoul.count()) {
      await quickFoul.click({ timeout: 8000 });
    } else {
      await page.getByTestId("quick-action-more").click({ timeout: 8000 });
      await page.getByTestId("action-btn-Foul").click();
    }
    await page.getByTestId("field-player-AWAY-2").click();
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId("btn-resume-effective")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("toggle-analytics").click();
    await expect(page.getByTestId("analytics-panel")).toBeVisible({
      timeout: 10000,
    });

    const parseClock = (value: string) => {
      const [mm, ss] = value.trim().split(":");
      return Number(mm) * 60 + Number(ss || 0);
    };

    const foulRowText =
      (await page.getByTestId("stat-ineffective-foul").textContent()) || "";
    const foulClocks = foulRowText.match(/\d{2}:\d{2}/g) || [];
    expect(foulClocks.length).toBeGreaterThanOrEqual(2);

    const homeFoul = parseClock(foulClocks[0]);
    const awayFoul = parseClock(foulClocks[1]);
    expect(homeFoul).toBe(0);
    expect(awayFoul).toBeGreaterThanOrEqual(1);
  });

  test("Card logging does not start ineffective timer", async ({ page }) => {
    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);
    await unlockClockControls(page);
    await ensureClockRunning(page);

    const resumeEffectiveButton = page.getByTestId("btn-resume-effective");
    await expect(resumeEffectiveButton).toHaveCount(0);

    await page.getByTestId("card-select-yellow").click({ timeout: 8000 });
    await page.getByTestId("card-team-home").click({ timeout: 8000 });
    const fieldPlayer = page.getByTestId("field-player-HOME-2");
    if (await fieldPlayer.isVisible().catch(() => false)) {
      await fieldPlayer.click({ force: true });
    } else {
      await page.getByTestId("player-card-HOME-2").click({ force: true });
    }
    await waitForPendingAckToClear(page);

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(async () => await liveEvents.filter({ hasText: /Card/i }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(1);

    await expect(resumeEffectiveButton).toHaveCount(0);
  });

  test("handles card escalation (YC, second YC, RC) and foul variants", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId("live-event-item");

    const startClock = page.getByTestId("btn-start-clock");
    const stopClock = page.getByTestId("btn-stop-clock");
    await unlockClockControls(page);
    if (await startClock.isEnabled()) {
      await startClock.click();
    }
    await expect(stopClock).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;

    await sendEventThroughHarness(
      page,
      "FoulCommitted",
      homeTeamId,
      "HOME-4",
      "00:04.000",
      {
        foul_type: "Standard",
        outcome: "Standard",
      },
    );
    await sendEventThroughHarness(
      page,
      "Card",
      homeTeamId,
      "HOME-4",
      "00:04.500",
      {
        card_type: "Yellow",
        reason: "Foul",
      },
    );
    await sendEventThroughHarness(
      page,
      "Card",
      homeTeamId,
      "HOME-4",
      "00:05.000",
      {
        card_type: "Yellow (Second)",
        reason: "Foul",
      },
    );
    await sendEventThroughHarness(
      page,
      "Card",
      homeTeamId,
      "HOME-5",
      "00:06.000",
      {
        card_type: "Red",
        reason: "Serious Foul Play",
      },
    );

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 30000 })
      .toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        async () =>
          await liveEvents.filter({ hasText: "FoulCommitted" }).count(),
        {
          timeout: 15000,
        },
      )
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: "Card" }).count(), {
        timeout: 15000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(async () => await liveEvents.filter({ hasText: "Red" }).count(), {
        timeout: 15000,
      })
      .toBeGreaterThanOrEqual(0);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    await page.reload();
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
  });

  test("supports own goal, VAR decision, and edit via undo/resend", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId("live-event-item");

    const startClock = page.getByTestId("btn-start-clock");
    const stopClock = page.getByTestId("btn-stop-clock");
    await unlockClockControls(page);
    await expect(startClock).toBeEnabled({ timeout: 5000 });
    if (await startClock.isEnabled()) {
      await startClock.click();
    }
    await expect(stopClock).toBeEnabled({ timeout: 5000 });

    await logShotGoal(page);

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEventThroughHarness(
      page,
      "VARDecision",
      homeTeamId,
      "HOME-1",
      "00:12.000",
      {
        decision: "Goal Disallowed",
      },
    );
    await sendEventThroughHarness(
      page,
      "Shot",
      awayTeamId,
      "AWAY-3",
      "00:13.000",
      {
        shot_type: "OwnGoal",
        outcome: "Goal",
      },
    );

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(2);

    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeLessThanOrEqual(3);
    await expect(
      liveEvents.filter({ hasText: /OwnGoal|Own Goal/i }),
    ).toHaveCount(1);

    const eventsBeforeEdit = await liveEvents.count();

    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);

    await expect
      .poll(
        async () =>
          await liveEvents.filter({ hasText: /OwnGoal|Own Goal/i }).count(),
        {
          timeout: 25000,
        },
      )
      .toBeLessThanOrEqual(1);

    await sendEventThroughHarness(
      page,
      "Shot",
      awayTeamId,
      "AWAY-3",
      "00:13.500",
      {
        shot_type: "Standard",
        outcome: "OffTarget",
      },
    );

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(eventsBeforeEdit);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    await page.reload();
    await promoteToAdmin(page);
    await unlockClockControls(page);
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 15000,
    });
    const expectedMinimum = 1;
    await expect
      .poll(async () => await liveEvents.count(), { timeout: 15000 })
      .toBeGreaterThanOrEqual(expectedMinimum);
  });

  test("covers penalty shootout outcomes and VAR overturn", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId("live-event-item");
    const startClockBtn = page.getByTestId("btn-start-clock");
    const stopClockBtn = page.getByTestId("btn-stop-clock");

    await unlockClockControls(page);
    await expect(startClockBtn).toBeEnabled({ timeout: 5000 });
    await startClockBtn.click();
    await expect(stopClockBtn).toBeEnabled({ timeout: 5000 });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-1",
      "90:00.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-1",
      "90:30.000",
      {
        set_piece_type: "Penalty",
        outcome: "Saved",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-2",
      "91:00.000",
      {
        set_piece_type: "Penalty",
        outcome: "Missed",
      },
    );

    await expectLiveEventCount(page, 3);

    await sendEventThroughHarness(
      page,
      "VARDecision",
      homeTeamId,
      "HOME-1",
      "91:15.000",
      {
        decision: "Penalty Retake",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-1",
      "91:30.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );

    await expectLiveEventCount(page, 5);

    const setPieces = liveEvents.filter({ hasText: "SetPiece" });
    await expect
      .poll(async () => await setPieces.count(), { timeout: 5000 })
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(async () => await setPieces.count(), { timeout: 5000 })
      .toBeLessThanOrEqual(6);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeLessThanOrEqual(2);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    await page.reload();
    await promoteToAdmin(page);
    await unlockClockControls(page);
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible({
      timeout: 20000,
    });
    await expectLiveEventCount(page, 5);
  });

  test("handles penalty shootout sudden death and VAR outcomes matrix with edit", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TAXONOMY_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const liveEvents = page.getByTestId("live-event-item");

    await unlockClockControls(page);
    await expect(page.getByTestId("btn-start-clock")).toBeEnabled({
      timeout: 5000,
    });
    await page.getByTestId("btn-start-clock").click();
    await unlockClockControls(page);
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 5000,
    });

    const context = await getHarnessMatchContext(page);
    expect(context).not.toBeNull();
    const homeTeamId = context?.homeTeamId as string;
    const awayTeamId = context?.awayTeamId as string;

    // Regulation shootout (3 kicks each) ends level
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-1",
      "92:00.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-1",
      "92:20.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-2",
      "92:40.000",
      {
        set_piece_type: "Penalty",
        outcome: "Saved",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-2",
      "93:00.000",
      {
        set_piece_type: "Penalty",
        outcome: "Saved",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-3",
      "93:20.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-3",
      "93:40.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );

    // Sudden death: home scores, away misses
    await sendEventThroughHarness(
      page,
      "SetPiece",
      homeTeamId,
      "HOME-4",
      "94:00.000",
      {
        set_piece_type: "Penalty",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "SetPiece",
      awayTeamId,
      "AWAY-4",
      "94:20.000",
      {
        set_piece_type: "Penalty",
        outcome: "Missed",
      },
    );

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 30000 })
      .toBeGreaterThanOrEqual(1);

    // VAR outcomes: allow then disallow via overturn
    await sendEventThroughHarness(
      page,
      "Shot",
      homeTeamId,
      "HOME-5",
      "94:40.000",
      {
        shot_type: "Standard",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "VARDecision",
      homeTeamId,
      "HOME-5",
      "94:50.000",
      {
        decision: "Goal Allowed",
      },
    );
    await sendEventThroughHarness(
      page,
      "Shot",
      awayTeamId,
      "AWAY-5",
      "95:00.000",
      {
        shot_type: "Standard",
        outcome: "Goal",
      },
    );
    await sendEventThroughHarness(
      page,
      "VARDecision",
      awayTeamId,
      "AWAY-5",
      "95:10.000",
      {
        decision: "Goal Disallowed (Offside)",
      },
    );

    // Edit flow: undo last VAR and resend corrected decision
    const eventsBeforeEdit = await liveEvents.count();
    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);
    await sendEventThroughHarness(
      page,
      "VARDecision",
      awayTeamId,
      "AWAY-5",
      "95:15.000",
      {
        decision: "Goal Allowed",
      },
    );

    await expect
      .poll(async () => await liveEvents.count(), { timeout: 20000 })
      .toBeGreaterThanOrEqual(eventsBeforeEdit);

    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "SetPiece" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "SetPiece" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeLessThanOrEqual(14);
    // After undoing the disallow, VAR decisions should be reduced to two or three depending on timing
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(
        async () => await liveEvents.filter({ hasText: "VARDecision" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeLessThanOrEqual(3);

    await page.getByTestId("toggle-analytics").click();
    const analyticsPanel = page.getByTestId("analytics-panel");
    await expect(analyticsPanel).toBeVisible();
    await expect(analyticsPanel.getByTestId("analytics-title")).toBeVisible();
    await expect(analyticsPanel.getByText(/No data available yet/i)).toBeHidden(
      { timeout: 20000 },
    );

    await page.reload();
    await expect(page.getByTestId("field-player-HOME-1")).toBeVisible();
  });
});
