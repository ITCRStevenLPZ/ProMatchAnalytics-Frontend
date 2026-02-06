import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
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

test.describe("Logger field-based action flow", () => {
  test("requires note for ineffective time and supports note CRUD", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);

    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });

    await page.getByTestId("btn-ineffective-event").click({ timeout: 15000 });
    const modal = page.getByTestId("ineffective-note-modal");
    await expect(modal).toBeVisible({ timeout: 10000 });

    await page.getByTestId("ineffective-note-input").fill("Injury stoppage");
    await page.getByTestId("ineffective-note-save").click();
    await expect(modal).toBeHidden({ timeout: 10000 });
    await waitForPendingAckToClear(page);

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

    const resumeBtn = page.getByTestId("btn-resume-effective");
    if (await resumeBtn.isVisible().catch(() => false)) {
      await resumeBtn.click();
      await waitForPendingAckToClear(page);
    }
  });
  test("logs quick pass with destination and stops effective time on out-of-bounds", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));

    await gotoLoggerPage(page, MATCH_ID);
    await resetHarnessFlow(page);

    await page.getByTestId("btn-start-clock").click({ timeout: 15000 });
    await expect(page.getByTestId("btn-stop-clock")).toBeEnabled({
      timeout: 15000,
    });

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

    // Quick pass out of bounds should flip effective time to ball out of play
    await page.getByTestId("field-player-HOME-1").click({ force: true });
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-Pass").click({ timeout: 8000 });
    await clickOutOfBounds(page);
    await waitForPendingAckToClear(page);

    await expect(page.getByText(/Ball Out of Play|Balón Fuera/i)).toBeVisible({
      timeout: 10000,
    });
    await expect
      .poll(async () => await page.getByTestId("live-event-item").count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(2);
    const liveEvents = page.getByTestId("live-event-item");
    await expect(liveEvents.filter({ hasText: "SetPiece" })).toHaveCount(1);
    await expect(liveEvents.filter({ hasText: "Corner" })).toHaveCount(1);
  });
});
