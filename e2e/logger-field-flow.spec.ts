import { test, expect } from "@playwright/test";
import {
  gotoLoggerPage,
  resetHarnessFlow,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH";

const clickOutOfBounds = async (page: any) => {
  const field = page.getByTestId("soccer-field");
  const box = await field.boundingBox();
  if (!box) throw new Error("Field bounding box not available");
  await page.mouse.click(box.x + 2, box.y + 2);
};

test.describe("Logger field-based action flow", () => {
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
  });
});
