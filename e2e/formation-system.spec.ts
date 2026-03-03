import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { BACKEND_BASE_URL, MATCH_ID, gotoLoggerPage } from "./utils/logger";

// ---------------------------------------------------------------------------
// Formation system E2E tests.
// Covers: preset selection, custom input, validation, position repositioning,
// clearing formations, and IDB persistence across page reloads.
// ---------------------------------------------------------------------------

const AUTH_USER = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  role: "admin",
};

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

test.beforeEach(async ({ page }) => {
  await backendRequest.post("/e2e/reset", { data: { matchId: MATCH_ID } });
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await page.addInitScript((user) => {
    localStorage.setItem(
      "auth-storage",
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, AUTH_USER);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ensureAdminRole = async (page: Page) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    if (store?.getState) {
      store.getState().setUser(user);
    }
  }, AUTH_USER);
};

/** Read the data-tactical-x/y attributes from the player wrapper. */
const getTacticalCoords = async (page: Page, playerId: string) => {
  const el = page.getByTestId(`field-player-${playerId}`);
  await expect(el).toBeVisible({ timeout: 10000 });
  const x = await el.getAttribute("data-tactical-x");
  const y = await el.getAttribute("data-tactical-y");
  return { x: parseFloat(x ?? "0"), y: parseFloat(y ?? "0") };
};

/** Snapshot all home outfield player x-coordinates before/after a formation change. */
const getHomeOutfieldXCoords = async (page: Page) => {
  const coords: Record<string, number> = {};
  for (let i = 2; i <= 11; i++) {
    const c = await getTacticalCoords(page, `HOME-${i}`);
    coords[`HOME-${i}`] = c.x;
  }
  return coords;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Formation System", () => {
  test.describe.configure({ mode: "serial" });

  test("formation pickers are visible in tactical view", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    // Formation pickers should be visible inside the TeamSelector toolbar
    // They are now rendered inside formation-slot-left and formation-slot-right
    const leftSlot = page.getByTestId("formation-slot-left");
    await expect(leftSlot).toBeVisible({ timeout: 15000 });
    const rightSlot = page.getByTestId("formation-slot-right");
    await expect(rightSlot).toBeVisible({ timeout: 15000 });

    // Both pickers should be present
    await expect(page.getByTestId("formation-picker-home")).toBeVisible();
    await expect(page.getByTestId("formation-picker-away")).toBeVisible();

    // Default label should show "No Formation" (en) or "Sin Formación" (es)
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      /No Formation|Sin Formación/,
    );
    await expect(page.getByTestId("formation-picker-away")).toContainText(
      /No Formation|Sin Formación/,
    );
  });

  test("selecting a preset formation repositions outfield players", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    // Wait for field to render
    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Record pre-formation positions
    const beforeCoords = await getHomeOutfieldXCoords(page);

    // Open home formation picker
    await page.getByTestId("formation-picker-home").click();
    const dropdown = page.getByTestId("formation-dropdown-home");
    await expect(dropdown).toBeVisible();

    // Select 4-4-2 preset
    await page.getByTestId("formation-preset-home-4-4-2").click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Picker should show "4-4-2"
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-4-2",
    );

    // Wait for positions to update
    await page.waitForTimeout(600);

    // Verify positions changed — at least some outfield players should have
    // different x-coordinates. We don't check exact pixels, just that the
    // formation was applied (some movement happened).
    const afterCoords = await getHomeOutfieldXCoords(page);
    let changedCount = 0;
    for (const pid of Object.keys(beforeCoords)) {
      if (Math.abs(beforeCoords[pid] - afterCoords[pid]) > 2) {
        changedCount++;
      }
    }
    // At least 3 outfield players should have shifted position
    expect(changedCount).toBeGreaterThanOrEqual(3);
  });

  test("custom formation input with valid input applies the formation", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Open away formation picker
    await page.getByTestId("formation-picker-away").click();
    const dropdown = page.getByTestId("formation-dropdown-away");
    await expect(dropdown).toBeVisible();

    // Enter a custom formation: 3-5-2
    const input = page.getByTestId("formation-custom-input-away");
    await input.fill("3-5-2");
    await page.getByTestId("formation-custom-apply-away").click();

    // Dropdown should close
    await expect(dropdown).not.toBeVisible();

    // Picker should now show "3-5-2"
    await expect(page.getByTestId("formation-picker-away")).toContainText(
      "3-5-2",
    );
  });

  test("custom formation that does not sum to 10 shows error", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Open home formation picker
    await page.getByTestId("formation-picker-home").click();
    await expect(page.getByTestId("formation-dropdown-home")).toBeVisible();

    // Enter invalid formation (sums to 8)
    const input = page.getByTestId("formation-custom-input-home");
    await input.fill("3-3-2");
    await page.getByTestId("formation-custom-apply-home").click();

    // Error message should appear
    const error = page.getByTestId("formation-custom-error-home");
    await expect(error).toBeVisible();
    await expect(error).toContainText("10");

    // Picker label should still say "No Formation" — not changed
    // Dropdown is still open, formation not applied
    await expect(page.getByTestId("formation-dropdown-home")).toBeVisible();
  });

  test("invalid format shows error", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("formation-picker-home").click();
    const input = page.getByTestId("formation-custom-input-home");
    await input.fill("abc");
    await page.getByTestId("formation-custom-apply-home").click();

    const error = page.getByTestId("formation-custom-error-home");
    await expect(error).toBeVisible();
    // Error text could be in English or Spanish
    await expect(error).toContainText(/format|formato/i);
  });

  test("clearing a formation reverts to default positions", async ({
    page,
  }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Record positions with no formation
    const defaultCoords = await getHomeOutfieldXCoords(page);

    // Apply a formation
    await page.getByTestId("formation-picker-home").click();
    await page.getByTestId("formation-preset-home-4-3-3").click();
    await page.waitForTimeout(400);

    // Verify it changed
    const formationCoords = await getHomeOutfieldXCoords(page);
    let someChanged = false;
    for (const pid of Object.keys(defaultCoords)) {
      if (Math.abs(defaultCoords[pid] - formationCoords[pid]) > 2) {
        someChanged = true;
        break;
      }
    }
    expect(someChanged).toBe(true);

    // Clear the formation via the X button
    await page.getByTestId("formation-clear-home").click();
    await page.waitForTimeout(400);

    // Picker should show "No Formation" again
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      /No Formation|Sin Formación/,
    );

    // Positions should revert closer to defaults
    const revertedCoords = await getHomeOutfieldXCoords(page);
    let revertedCount = 0;
    for (const pid of Object.keys(defaultCoords)) {
      if (Math.abs(defaultCoords[pid] - revertedCoords[pid]) < 3) {
        revertedCount++;
      }
    }
    // Most players should be back close to their default positions
    expect(revertedCount).toBeGreaterThanOrEqual(5);
  });

  test("formation persists across page reload", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Apply 4-4-2 to home
    await page.getByTestId("formation-picker-home").click();
    await page.getByTestId("formation-preset-home-4-4-2").click();
    await page.waitForTimeout(800); // Let IDB persist

    // Reload the page
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // The formation picker should still show 4-4-2
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-4-2",
    );
  });

  test("both teams can have independent formations", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Set home to 4-3-3
    await page.getByTestId("formation-picker-home").click();
    await page.getByTestId("formation-preset-home-4-3-3").click();
    await page.waitForTimeout(300);

    // Set away to 3-5-2
    await page.getByTestId("formation-picker-away").click();
    await page.getByTestId("formation-preset-away-3-5-2").click();
    await page.waitForTimeout(300);

    // Verify both show independently
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-3-3",
    );
    await expect(page.getByTestId("formation-picker-away")).toContainText(
      "3-5-2",
    );
  });

  test("GK stays fixed when formation is applied", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    // Get GK position before
    const gkBefore = await getTacticalCoords(page, "HOME-1");

    // Apply 4-4-2
    await page.getByTestId("formation-picker-home").click();
    await page.getByTestId("formation-preset-home-4-4-2").click();
    await page.waitForTimeout(400);

    // GK should still be near x=5, y=50
    const gkAfter = await getTacticalCoords(page, "HOME-1");
    expect(gkAfter.x).toBeLessThan(15);
    expect(Math.abs(gkAfter.y - 50)).toBeLessThan(10);

    // Position should barely change
    expect(Math.abs(gkBefore.x - gkAfter.x)).toBeLessThan(3);
    expect(Math.abs(gkBefore.y - gkAfter.y)).toBeLessThan(3);
  });

  test("Enter key submits custom formation", async ({ page }) => {
    test.setTimeout(60000);
    await gotoLoggerPage(page, MATCH_ID);
    await ensureAdminRole(page);

    await expect(page.getByTestId("soccer-field")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("formation-picker-home").click();
    const input = page.getByTestId("formation-custom-input-home");
    await input.fill("4-2-3-1");
    await input.press("Enter");

    // Should apply successfully
    await expect(page.getByTestId("formation-dropdown-home")).not.toBeVisible();
    await expect(page.getByTestId("formation-picker-home")).toContainText(
      "4-2-3-1",
    );
  });
});
