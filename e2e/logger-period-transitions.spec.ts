import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { uniqueId } from "./utils/admin";

const makeMatchId = () => uniqueId("E2E-LOGGER-TRANSITIONS");

let backendRequest: APIRequestContext;

const primeAdminStorage = async (page: Page) => {
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

const resetMatch = async (
  matchId: string,
  options?: {
    status?: string;
    matchTimeSeconds?: number;
  },
) => {
  const resp = await backendRequest.post("/e2e/reset", {
    data: {
      matchId,
      status: options?.status,
      matchTimeSeconds: options?.matchTimeSeconds,
    },
  });
  expect(resp.ok()).toBeTruthy();
};

const waitForMatchStatus = async (matchId: string, status: string) => {
  await expect
    .poll(
      async () => {
        const res = await backendRequest.get(
          `/api/v1/logger/matches/${matchId}`,
        );
        if (!res.ok()) return null;
        const payload = await res.json();
        return payload.status as string | null;
      },
      { timeout: 15000, interval: 500 },
    )
    .toBe(status);
};

const enableMinimumValidation = async (page: Page) => {
  await page.addInitScript(() => {
    (window as any).__PROMATCH_E2E_ENFORCE_MINIMUMS__ = true;
  });
};

test.describe("Logger period transitions", () => {
  test.beforeAll(async () => {
    backendRequest = await request.newContext({
      baseURL: process.env.PROMATCH_E2E_BACKEND_URL ?? "http://127.0.0.1:8000",
      extraHTTPHeaders: { Authorization: "Bearer e2e-playwright" },
    });
  });

  test.afterAll(async () => {
    await backendRequest?.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await primeAdminStorage(page);
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  });

  test("walks regulation transitions end-to-end", async ({ page }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    await resetMatch(matchId, {
      status: "Live_First_Half",
      matchTimeSeconds: 46 * 60,
    });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-first-half").click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-start-second-half").click();
    await expect(page.getByTestId("period-status-second-half")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-match").click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("btn-end-match-final")).toBeDisabled();
    await expect(page.getByTestId("cockpit-lock-banner")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("transition-error")).toHaveCount(0);
  });

  test("walks extra time and penalties transitions", async ({ page }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    await resetMatch(matchId, {
      status: "Live_Extra_First",
      matchTimeSeconds: 105 * 60,
    });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    await expect(page.getByTestId("period-status-extra-first")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-extra-first").click();
    await waitForMatchStatus(matchId, "Extra_Halftime");
    await expect(page.getByTestId("period-status-extra-halftime")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-start-extra-second").click();
    await waitForMatchStatus(matchId, "Live_Extra_Second");
    await expect(page.getByTestId("period-status-extra-second")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-start-penalties").click();
    await expect(page.getByTestId("period-status-penalties")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-penalties").click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("transition-error")).toHaveCount(0);
  });

  test("blocks invalid transitions from Pending", async ({ page }) => {
    test.setTimeout(60000);

    const matchId = makeMatchId();
    await resetMatch(matchId, { status: "Pending", matchTimeSeconds: 0 });

    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-end-first-half").click();
    const error = page.getByTestId("transition-error");
    await expect(error).toBeVisible({ timeout: 15000 });
    await expect(error).toContainText("Transition not allowed");
  });

  test("enforces minimum effective time for transitions", async ({ page }) => {
    test.setTimeout(120000);

    const matchId = makeMatchId();
    await resetMatch(matchId, {
      status: "Live_First_Half",
      matchTimeSeconds: 10 * 60,
    });

    await enableMinimumValidation(page);
    await page.goto(`/matches/${matchId}/logger`);
    await ensureAdminRole(page);

    await expect(page.getByTestId("period-status-first-half")).toBeVisible({
      timeout: 15000,
    });

    const endFirstHalfBtn = page.getByTestId("btn-end-first-half");
    await expect(endFirstHalfBtn).toBeDisabled({ timeout: 15000 });
    const firstHalfReason = page.getByTestId("transition-reason");
    await expect(firstHalfReason).toBeVisible({ timeout: 15000 });
    await expect(firstHalfReason).toContainText(/45:00/);

    await resetMatch(matchId, {
      status: "Live_First_Half",
      matchTimeSeconds: 46 * 60,
    });
    await page.reload();
    await ensureAdminRole(page);

    await page.getByTestId("btn-end-first-half").click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible({
      timeout: 15000,
    });

    await page.getByTestId("btn-start-second-half").click();
    await expect(page.getByTestId("period-status-second-half")).toBeVisible({
      timeout: 15000,
    });

    const endMatchBtn = page.getByTestId("btn-end-match");
    await expect(endMatchBtn).toBeDisabled({ timeout: 15000 });
    const secondHalfReason = page.getByTestId("transition-reason");
    await expect(secondHalfReason).toBeVisible({ timeout: 15000 });
    await expect(secondHalfReason).toContainText(/90:00/);

    await resetMatch(matchId, {
      status: "Live_Second_Half",
      matchTimeSeconds: 91 * 60,
    });
    await page.reload();
    await ensureAdminRole(page);

    await page.getByTestId("btn-end-match").click();
    await expect(page.getByTestId("period-status-fulltime")).toBeVisible({
      timeout: 15000,
    });
  });
});
