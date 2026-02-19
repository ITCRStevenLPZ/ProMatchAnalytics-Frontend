import {
  test,
  expect,
  request,
  Page,
  APIRequestContext,
} from "@playwright/test";

const MATCH_ID = "E2E-LOGGER-EXTRA-TIME-FIXTURE";

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

test.describe("Logger extra time transitions", () => {
  let backendRequest: APIRequestContext;

  test.beforeAll(async () => {
    backendRequest = await request.newContext({
      baseURL: process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  const resetMatch = async (options?: {
    status?: "Pending" | "Live_First_Half" | "Live_Second_Half";
    matchTimeSeconds?: number;
  }) => {
    const resp = await backendRequest.post("/e2e/reset", {
      data: {
        matchId: MATCH_ID,
        status: options?.status,
        matchTimeSeconds: options?.matchTimeSeconds,
      },
    });
    expect(resp.ok()).toBeTruthy();
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

    await resetMatch({
      status: "Live_First_Half",
      matchTimeSeconds: 46 * 60 + 15,
    });

    await page.goto(`/matches/${MATCH_ID}/logger`);
    await ensureAdminRole(page);
    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });
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
    await expect(page.getByTestId("period-status-second-half")).toBeVisible({
      timeout: 15000,
    });

    await resetMatch({
      status: "Live_Second_Half",
      matchTimeSeconds: 91 * 60 + 10,
    });

    await page.reload();
    await ensureAdminRole(page);
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
