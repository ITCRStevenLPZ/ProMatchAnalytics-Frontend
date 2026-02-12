import {
  test,
  expect,
  request,
  type APIRequestContext,
} from "@playwright/test";
import { BACKEND_BASE_URL, gotoLoggerPage, MATCH_ID } from "./utils/logger";

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

test.describe("Logger Keyboard Shortcuts", () => {
  test("should support full keyboard flow", async ({ page }) => {
    page.on("console", (msg) => console.log(msg.text()));
    await gotoLoggerPage(page, MATCH_ID);

    // 1. Select Player via Number (Jersey #10)
    // Type '1', '0'
    await page.keyboard.press("1");
    await page.keyboard.press("0");

    // Check buffer display
    await expect(page.getByText("Input")).toBeVisible();
    await expect(page.getByTestId("keyboard-buffer-value")).toHaveText("10");

    // Commit
    await page.keyboard.press("Enter");

    // Verify player selected (Player 10 is usually a Forward or Midfielder in our seed)
    // Check that action selection is active by looking for action buttons
    await expect(page.getByTestId("action-btn-Pass")).toBeVisible();

    // 2. Select Action via Hotkey (Pass = 'P')
    await page.keyboard.press("p");

    // Verify "Select Outcome" step is active by looking for outcome buttons
    // Note: Outcome buttons might have dynamic test IDs or text.
    // Let's check for "Complete" or "Success" outcome button.
    // Based on previous work, it might be 'outcome-btn-Complete' or similar.
    // But let's check for ANY outcome button or the header if we can guess it.
    // Or better, check that action buttons are GONE.
    // Verify "Select Outcome" step is active by looking for outcome buttons
    await expect(page.getByTestId("action-btn-Pass")).not.toBeVisible();

    // Check for a specific outcome button to verify we are in outcome selection
    await expect(page.getByTestId("outcome-btn-Complete")).toBeVisible();

    // 3. Select Outcome (1 for Complete)
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");

    // 4. Select Recipient via jersey (use 11)
    await page.keyboard.press("1");
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");

    // Verify event logged
    const lastEvent = page.getByTestId("live-event-item").first();
    await expect(lastEvent).toBeVisible();
    await expect(lastEvent).toContainText(/Pass|Pase/i);
    await expect(lastEvent).toContainText(/Complete|Completo/i);

    // Verify flow reset -> Player grid visible
    await expect(page.getByTestId("player-grid")).toBeVisible();
  });

  test("should toggle clock with Space", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);

    const ballStateLabel = page.getByTestId("ball-state-label");
    await expect(ballStateLabel).toHaveText(/Bal[oó]n Fuera|Ball Out/i, {
      timeout: 10000,
    });

    // Toggle to Ball In
    await page.keyboard.press("Space");
    await expect(ballStateLabel).toHaveText(/Bal[oó]n en Juego|Ball In/i, {
      timeout: 10000,
    });

    // Toggle back
    await page.keyboard.press("Space");
    await expect(ballStateLabel).toHaveText(/Bal[oó]n Fuera|Ball Out/i, {
      timeout: 10000,
    });
  });

  test("should cancel flow with Escape", async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);

    // Select a player via click to ensure flow progression
    const fieldPlayer = page.getByTestId("field-player-HOME-1");
    await expect(fieldPlayer).toBeVisible({ timeout: 5000 });
    await fieldPlayer.click();

    // Wait for quick action menu to appear
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 5000,
    });

    // Cancel
    await page.keyboard.press("Escape");

    // Verify reset
    await expect(page.getByTestId("player-grid")).toBeVisible();
    await expect(page.getByTestId("quick-action-menu")).not.toBeVisible();
  });
});
