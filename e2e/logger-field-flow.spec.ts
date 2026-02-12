import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  ensureClockRunning,
  gotoLoggerPage,
  resetHarnessFlow,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH";

let backendRequest: APIRequestContext;

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
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
});

const clickOutOfBounds = async (page: any) => {
  const field = page.getByTestId("soccer-field");
  const box = await field.boundingBox();
  if (!box) throw new Error("Field bounding box not available");
  const x = box.x + box.width * 0.01;
  const y = box.y + box.height * 0.5;
  await page.mouse.click(x, y);
};

const parseClockToSeconds = (value: string) => {
  const [mm, ssWithMs] = String(value).trim().split(":");
  const [ss] = String(ssWithMs || "0").split(".");
  return Number(mm || 0) * 60 + Number(ss || 0);
};

const expectMenuWithinField = async (page: any) => {
  const field = page.getByTestId("soccer-field");
  const menu = page.getByTestId("quick-action-menu");
  const fieldBox = await field.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(fieldBox).toBeTruthy();
  expect(menuBox).toBeTruthy();
  if (!fieldBox || !menuBox) return;

  const padding = 4;
  expect(menuBox.x).toBeGreaterThanOrEqual(fieldBox.x + padding);
  expect(menuBox.y).toBeGreaterThanOrEqual(fieldBox.y + padding);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(
    fieldBox.x + fieldBox.width - padding,
  );
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(
    fieldBox.y + fieldBox.height - padding,
  );
};

const expectMenuCentered = async (page: any) => {
  const field = page.getByTestId("soccer-field");
  const menu = page.getByTestId("quick-action-menu");
  const fieldBox = await field.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(fieldBox).toBeTruthy();
  expect(menuBox).toBeTruthy();
  if (!fieldBox || !menuBox) return;

  const fieldCenterX = fieldBox.x + fieldBox.width / 2;
  const fieldCenterY = fieldBox.y + fieldBox.height / 2;
  const menuCenterX = menuBox.x + menuBox.width / 2;
  const menuCenterY = menuBox.y + menuBox.height / 2;

  const toleranceX = fieldBox.width * 0.12;
  const toleranceY = fieldBox.height * 0.12;

  expect(Math.abs(menuCenterX - fieldCenterX)).toBeLessThanOrEqual(toleranceX);
  expect(Math.abs(menuCenterY - fieldCenterY)).toBeLessThanOrEqual(toleranceY);
};

test.describe("Logger field-based action flow", () => {
  test.describe.configure({ mode: "serial" });
  test("requires note for ineffective time and supports note CRUD", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);

    await ensureClockRunning(page);

    await page.getByTestId("btn-ineffective-event").scrollIntoViewIfNeeded();
    await page.getByTestId("btn-ineffective-event").click({ timeout: 15000 });
    const modal = page.getByTestId("ineffective-note-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    await page.getByTestId("ineffective-note-input").fill("Injury stoppage");
    await page.getByTestId("ineffective-note-save").click();
    await expect(modal).toBeHidden({ timeout: 10000 });
    await waitForPendingAckToClear(page);

    await expect
      .poll(async () => await page.getByTestId("live-event-item").count(), {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    const firstEvent = page.getByTestId("live-event-item").first();
    await expect(firstEvent).toContainText("Injury stoppage");

    await firstEvent.getByTestId("event-note-edit").click();
    await expect(page.getByTestId("event-note-textarea")).toBeVisible({
      timeout: 10000,
    });
    await page
      .getByTestId("event-note-textarea")
      .fill("Injury stoppage updated");
    await page.getByTestId("event-note-save").click();
    await expect
      .poll(async () => (await firstEvent.textContent()) || "")
      .toContain("Injury stoppage updated");

    await firstEvent.getByTestId("event-note-edit").click();
    await expect(page.getByTestId("event-note-textarea")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("event-note-remove").click();
    await expect
      .poll(async () => (await firstEvent.textContent()) || "")
      .toMatch(/No notes|Sin notas/);

    await page.getByTestId("btn-stop-clock").click({ timeout: 10000 });
    const fieldResumeBtn = page
      .getByTestId("soccer-field")
      .getByTestId("btn-resume-effective");
    await expect(fieldResumeBtn).toBeVisible({ timeout: 10000 });
    await fieldResumeBtn.click();
    await waitForPendingAckToClear(page);
  });
  test("stops clock on manual stop and completion", async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);

    await ensureClockRunning(page);
    const effectiveClock = page.getByTestId("effective-clock-value").first();
    const startClock = (await effectiveClock.textContent()) || "00:00.000";
    await page.waitForTimeout(1200);
    const runningClock = (await effectiveClock.textContent()) || "00:00.000";
    expect(parseClockToSeconds(runningClock)).toBeGreaterThan(
      parseClockToSeconds(startClock),
    );

    await page.getByTestId("btn-stop-clock").click({ timeout: 10000 });
    await waitForPendingAckToClear(page);
    const stoppedClock = (await effectiveClock.textContent()) || "00:00.000";
    await page.waitForTimeout(1200);
    const stoppedClockLater =
      (await effectiveClock.textContent()) || "00:00.000";
    expect(parseClockToSeconds(stoppedClockLater)).toBe(
      parseClockToSeconds(stoppedClock),
    );

    const fulltimeReset = await backendRequest.post("/e2e/reset", {
      data: { matchId: MATCH_ID, status: "Fulltime", matchTimeSeconds: 120 },
    });
    expect(fulltimeReset.ok()).toBeTruthy();
    const fulltimeClockSeed = await backendRequest.patch(
      `/api/v1/logger/matches/${MATCH_ID}/clock-mode`,
      { data: { current_period_start_timestamp: new Date().toISOString() } },
    );
    expect(fulltimeClockSeed.ok()).toBeTruthy();
    await gotoLoggerPage(page, MATCH_ID);

    const fulltimeClock = (await effectiveClock.textContent()) || "00:00.000";
    await page.waitForTimeout(1200);
    const fulltimeClockLater =
      (await effectiveClock.textContent()) || "00:00.000";
    expect(parseClockToSeconds(fulltimeClockLater)).toBe(
      parseClockToSeconds(fulltimeClock),
    );

    const completedReset = await backendRequest.post("/e2e/reset", {
      data: { matchId: MATCH_ID, status: "Completed", matchTimeSeconds: 120 },
    });
    expect(completedReset.ok()).toBeTruthy();
    const completedClockSeed = await backendRequest.patch(
      `/api/v1/logger/matches/${MATCH_ID}/clock-mode`,
      { data: { current_period_start_timestamp: new Date().toISOString() } },
    );
    expect(completedClockSeed.ok()).toBeTruthy();
    await gotoLoggerPage(page, MATCH_ID);

    const completedClock = (await effectiveClock.textContent()) || "00:00.000";
    await page.waitForTimeout(1200);
    const completedClockLater =
      (await effectiveClock.textContent()) || "00:00.000";
    expect(parseClockToSeconds(completedClockLater)).toBe(
      parseClockToSeconds(completedClock),
    );
  });
  test("logs quick pass with destination and stops effective time on out-of-bounds", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);

    await ensureClockRunning(page);

    await expect(page.getByTestId("toggle-field-flip")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("undo-button")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("card-select-yellow").click({ timeout: 8000 });
    await expect(page.getByTestId("card-team-home")).toBeVisible({
      timeout: 8000,
    });
    await expect(page.getByTestId("card-team-away")).toBeVisible({
      timeout: 8000,
    });
    const homeBench = page
      .getByTestId("bench-section-home")
      .locator("[data-testid^='player-card-']")
      .first();
    await expect(homeBench).toBeVisible({ timeout: 10000 });
    await homeBench.click({ force: true });
    await waitForPendingAckToClear(page);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      /Card|Tarjeta/i,
    );
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      /Yellow|Amarilla/i,
    );
    await expect(
      page.getByTestId("live-event-item").filter({ hasText: /FoulCommitted/i }),
    ).toHaveCount(0);

    await page.getByTestId("card-select-cancelled").click({ timeout: 8000 });
    await page.getByTestId("card-team-away").click({ timeout: 8000 });
    const awayBench = page
      .getByTestId("bench-section-away")
      .locator("[data-testid^='player-card-']")
      .first();
    await expect(awayBench).toBeVisible({ timeout: 10000 });
    await awayBench.click({ force: true });
    await waitForPendingAckToClear(page);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      /Cancelled/i,
    );
    await expect(
      page.getByTestId("live-event-item").filter({ hasText: /FoulCommitted/i }),
    ).toHaveCount(0);

    await page.getByTestId("field-player-HOME-11").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await expectMenuWithinField(page);
    await expectMenuCentered(page);
    await expect(page.getByTestId("quick-action-DirectShot")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("quick-action-Carry")).toHaveCount(0);
    await expect(page.getByTestId("quick-action-Duel")).toHaveCount(0);
    await expect(page.getByTestId("quick-action-Save")).toHaveCount(0);
    await page.getByTestId("quick-action-cancel").click({ timeout: 8000 });

    // Quick pass to teammate
    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-Pass").click({ timeout: 8000 });
    await page.getByTestId("field-player-HOME-2").click({ force: true });
    await waitForPendingAckToClear(page);

    const lastEvent = page.getByTestId("live-event-item").first();
    await expect(lastEvent).toContainText(/Pass|Pase/i);
    await expect(lastEvent).toContainText(/Complete|Completo/i);

    // Quick goal action logs a goal outcome
    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-Goal").click({ timeout: 8000 });
    await page.getByTestId("soccer-field").click({ force: true });
    await waitForPendingAckToClear(page);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      /Goal|Gol/i,
    );
    await expect(page.getByTestId("goal-log-board")).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-DirectShot").click({ timeout: 8000 });
    await waitForPendingAckToClear(page);
    await expect(page.getByTestId("live-event-item").first()).toContainText(
      /Shot|Disparo|Goal|Gol/i,
    );

    const resumeAfterGoal = page
      .getByTestId("soccer-field")
      .getByTestId("btn-resume-effective");
    if (await resumeAfterGoal.isVisible()) {
      await resumeAfterGoal.click();
      await waitForPendingAckToClear(page);
    }

    // Quick pass out of bounds should flip effective time to ball out of play
    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-Pass").click({ timeout: 8000 });
    await clickOutOfBounds(page);
    await waitForPendingAckToClear(page);

    await expect(page.getByTestId("ball-state-label")).toBeVisible({
      timeout: 10000,
    });
    await expect
      .poll(async () => await page.getByTestId("live-event-item").count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(2);
    const liveEvents = page.getByTestId("live-event-item");
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
        async () => await liveEvents.filter({ hasText: "Corner" }).count(),
        {
          timeout: 10000,
        },
      )
      .toBeGreaterThanOrEqual(1);
  });
});
