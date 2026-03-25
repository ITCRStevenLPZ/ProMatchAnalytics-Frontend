import {
  expect,
  request,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { BACKEND_BASE_URL, gotoLoggerPage } from "./utils/logger";

const MATCH_ID = "E2E-PITCH-MARKINGS-SCALE";

let backendRequest: APIRequestContext;

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
};

const openAnalytics = async (page: Page) => {
  const panel = page.getByTestId("analytics-panel");
  if (await panel.isVisible().catch(() => false)) return;
  await page.getByTestId("toggle-analytics").click();
  await expect(panel).toBeVisible({ timeout: 15000 });
};

const readNumericAttr = async (
  page: Page,
  testId: string,
  attr: "x" | "y" | "width" | "height" | "rx" | "ry",
): Promise<number> => {
  const raw = await page.getByTestId(testId).getAttribute(attr);
  expect(raw).not.toBeNull();
  return Number(raw);
};

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

test.describe("Pitch markings use IFAB-scaled geometry", () => {
  test.describe.configure({ mode: "serial" });

  test("analytics heat map markings are scaled from real dimensions", async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await openAnalytics(page);

    // 105x68 reference mapped to 120x80
    // penalty depth: 16.5m -> 18.8571
    // penalty height: 40.32m -> 47.4353
    // goal area depth: 5.5m -> 6.2857
    // goal area height: 18.32m -> 21.5529
    // center circle radius: 9.15m -> rx 10.4571, ry 10.7647
    const paW = await readNumericAttr(
      page,
      "heatmap-home-penalty-left",
      "width",
    );
    const paH = await readNumericAttr(
      page,
      "heatmap-home-penalty-left",
      "height",
    );
    const gaW = await readNumericAttr(
      page,
      "heatmap-home-goalarea-left",
      "width",
    );
    const gaH = await readNumericAttr(
      page,
      "heatmap-home-goalarea-left",
      "height",
    );
    const ccRx = await readNumericAttr(
      page,
      "heatmap-home-center-circle",
      "rx",
    );
    const ccRy = await readNumericAttr(
      page,
      "heatmap-home-center-circle",
      "ry",
    );

    expect(paW).toBeCloseTo(18.8571, 2);
    expect(paH).toBeCloseTo(47.4353, 2);
    expect(gaW).toBeCloseTo(6.2857, 2);
    expect(gaH).toBeCloseTo(21.5529, 2);
    expect(ccRx).toBeCloseTo(10.4571, 2);
    expect(ccRy).toBeCloseTo(10.7647, 2);

    // Regression guard: these must be larger than old undersized hardcoded values.
    expect(paW).toBeGreaterThan(16.5);
    expect(paH).toBeGreaterThan(40.32);
    expect(gaW).toBeGreaterThan(5.5);
    expect(gaH).toBeGreaterThan(18.32);
  });

  test("tactical input field markings use the same scaled geometry", async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");

    const soccerField = page.getByTestId("soccer-field");
    const tacticalMarkings = page.getByTestId("tactical-field-markings");

    await expect(soccerField).toBeVisible();
    await expect(tacticalMarkings).toBeVisible();
    await soccerField.scrollIntoViewIfNeeded();

    const paW = await readNumericAttr(page, "tactical-penalty-left", "width");
    const paH = await readNumericAttr(page, "tactical-penalty-left", "height");
    const gaW = await readNumericAttr(page, "tactical-goalarea-left", "width");
    const gaH = await readNumericAttr(page, "tactical-goalarea-left", "height");
    const ccRx = await readNumericAttr(page, "tactical-center-circle", "rx");
    const ccRy = await readNumericAttr(page, "tactical-center-circle", "ry");

    expect(paW).toBeCloseTo(18.8571, 2);
    expect(paH).toBeCloseTo(47.4353, 2);
    expect(gaW).toBeCloseTo(6.2857, 2);
    expect(gaH).toBeCloseTo(21.5529, 2);
    expect(ccRx).toBeCloseTo(10.4571, 2);
    expect(ccRy).toBeCloseTo(10.7647, 2);

    // Guard against regressions where the pitch markings are clipped or omit
    // the bottom boundary line.
    const fieldBox = await soccerField.boundingBox();
    const markingsBox = await tacticalMarkings.boundingBox();
    expect(fieldBox).not.toBeNull();
    expect(markingsBox).not.toBeNull();
    if (!fieldBox || !markingsBox) {
      throw new Error("Expected tactical field and markings bounding boxes");
    }

    expect(markingsBox.width).toBeGreaterThan(100);
    expect(markingsBox.height).toBeGreaterThan(50);
    expect(markingsBox.width).toBeGreaterThan(fieldBox.width * 0.8);
    expect(markingsBox.height).toBeGreaterThan(fieldBox.height * 0.7);

    const topDelta = Math.abs(markingsBox.y - fieldBox.y);
    const leftDelta = Math.abs(markingsBox.x - fieldBox.x);
    const rightDelta = Math.abs(
      markingsBox.x + markingsBox.width - (fieldBox.x + fieldBox.width),
    );
    const bottomDelta = Math.abs(
      markingsBox.y + markingsBox.height - (fieldBox.y + fieldBox.height),
    );
    expect(topDelta).toBeLessThan(40);
    expect(leftDelta).toBeLessThan(40);
    expect(rightDelta).toBeLessThan(40);
    expect(bottomDelta).toBeLessThan(40);

    const outerPitchRect = page.getByTestId("tactical-field-boundary");
    const bottomSideline = page.getByTestId("tactical-bottom-sideline");
    await expect(outerPitchRect).toBeVisible();
    await expect(bottomSideline).toHaveCount(1);

    const outerY = Number(await outerPitchRect.getAttribute("y"));
    const outerHeight = Number(await outerPitchRect.getAttribute("height"));
    const bottomY1 = Number(await bottomSideline.getAttribute("y1"));
    const bottomY2 = Number(await bottomSideline.getAttribute("y2"));
    const bottomX1 = Number(await bottomSideline.getAttribute("x1"));
    const bottomX2 = Number(await bottomSideline.getAttribute("x2"));
    const viewBox = await tacticalMarkings.getAttribute("viewBox");
    expect(viewBox).not.toBeNull();
    const viewBoxParts = (viewBox || "").split(/\s+/).map(Number);
    expect(viewBoxParts).toHaveLength(4);
    const viewBoxWidth = viewBoxParts[2];
    const viewBoxHeight = viewBoxParts[3];
    expect(viewBoxWidth).toBeGreaterThan(0);
    expect(viewBoxHeight).toBeGreaterThan(0);

    const pitchBottomInViewBox = outerY + outerHeight;
    expect(Math.abs(pitchBottomInViewBox - viewBoxHeight)).toBeLessThan(0.5);
    expect(Math.abs(bottomY1 - viewBoxHeight)).toBeLessThan(0.5);
    expect(Math.abs(bottomY2 - viewBoxHeight)).toBeLessThan(0.5);
    expect(bottomY1).toBeCloseTo(bottomY2, 3);
    expect(bottomX1).toBeGreaterThanOrEqual(0);
    expect(bottomX2).toBeLessThanOrEqual(viewBoxWidth);
    expect(bottomX2).toBeGreaterThan(bottomX1);

    const screenshotPath = testInfo.outputPath("tactical-field-sideline.png");
    await soccerField.screenshot({ path: screenshotPath });
    await testInfo.attach("tactical-field-bottom-sideline", {
      path: screenshotPath,
      contentType: "image/png",
    });
  });
});
