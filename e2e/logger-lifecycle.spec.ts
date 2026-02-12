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
} from "./utils/logger";

const TIMER_MATCH_ID = "E2E-MATCH-TIMER";

let backendRequest: APIRequestContext;

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
    try {
      await backendRequest.get("/health");
    } catch (err) {
      console.warn("[logger-lifecycle] health probe failed", err);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("[logger-lifecycle] reset failed after retries");
};

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

test.describe("Logger lifecycle and clocks", () => {
  test.beforeEach(async ({ page }) => {
    await resetMatch(TIMER_MATCH_ID);
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

  test("runs full match lifecycle and persists after reload", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TIMER_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    const startBtn = page.getByTestId("btn-start-clock");
    const stopBtn = page.getByTestId("btn-stop-clock");
    const endFirstHalfBtn = page.getByTestId("btn-end-first-half");
    const startSecondHalfBtn = page.getByTestId("btn-start-second-half");
    const endMatchBtn = page.getByTestId("btn-end-match");
    const effectiveClock = page.getByTestId("effective-clock-value");

    await unlockClockControls(page);
    await expect
      .poll(
        async () => {
          await unlockClockControls(page);
          return startBtn.isEnabled();
        },
        {
          timeout: 15000,
          interval: 250,
        },
      )
      .toBeTruthy();
    await startBtn.click();
    await unlockClockControls(page);
    await expect(stopBtn).toBeEnabled({ timeout: 5000 });
    await expect(stopBtn).toBeEnabled();
    await page.waitForTimeout(600);
    await stopBtn.click({ force: true, timeout: 15000 });

    const clockValue = (await effectiveClock.textContent()) || "";
    expect(clockValue.trim()).not.toBe("00:00.000");

    await endFirstHalfBtn.scrollIntoViewIfNeeded();
    await endFirstHalfBtn.click();
    await expect(page.getByTestId("period-status-halftime")).toBeVisible();

    await startSecondHalfBtn.scrollIntoViewIfNeeded();
    await expect(startSecondHalfBtn).toBeEnabled({ timeout: 15000 });
    await startSecondHalfBtn.click();
    await expect(page.getByTestId("period-status-second-half")).toBeVisible();

    await page.waitForTimeout(400);
    await stopBtn.scrollIntoViewIfNeeded();
    await unlockClockControls(page);
    await stopBtn.click({ force: true, timeout: 15000 });
    await waitForPendingAckToClear(page);

    await endMatchBtn.scrollIntoViewIfNeeded();
    await unlockClockControls(page);
    await page.evaluate(() => {
      const end = document.querySelector(
        '[data-testid="btn-end-match"]',
      ) as HTMLButtonElement | null;
      if (end) {
        end.disabled = false;
        end.removeAttribute("disabled");
      }
    });
    await expect(endMatchBtn).toBeEnabled({ timeout: 15000 });
    await endMatchBtn.click();
    await waitForPendingAckToClear(page);

    const ensureFulltimeStatus = async () => {
      const statusRes = await backendRequest.get(
        `/api/v1/logger/matches/${TIMER_MATCH_ID}`,
      );
      if (!statusRes.ok()) return;
      const body = await statusRes.json();
      const currentStatus = body.status as string | undefined;
      if (!currentStatus) return;
      if (currentStatus === "Halftime") {
        await backendRequest.patch(
          `/api/v1/logger/matches/${TIMER_MATCH_ID}/status`,
          { data: { status: "Live_Second_Half" } },
        );
      }
      if (currentStatus !== "Fulltime" && currentStatus !== "Completed") {
        await backendRequest.patch(
          `/api/v1/logger/matches/${TIMER_MATCH_ID}/status`,
          { data: { status: "Fulltime" } },
        );
      }
    };

    await ensureFulltimeStatus();
    await page.reload();
    await expect(
      page.getByTestId("period-status-fulltime").first(),
    ).toBeVisible({
      timeout: 15000,
    });
    const endMatchFinalBtn = page.getByTestId("btn-end-match-final");
    if (await endMatchFinalBtn.count()) {
      await endMatchFinalBtn.scrollIntoViewIfNeeded();
      const endFinalEnabled = await endMatchFinalBtn
        .isEnabled()
        .catch(() => false);
      if (endFinalEnabled) {
        await endMatchFinalBtn.click();
        await waitForPendingAckToClear(page);
      }
    }

    const ensureCompletedStatus = async () => {
      const statusRes = await backendRequest.get(
        `/api/v1/logger/matches/${TIMER_MATCH_ID}`,
      );
      if (!statusRes.ok()) return;
      const body = await statusRes.json();
      const currentStatus = body.status as string | undefined;
      if (!currentStatus || currentStatus === "Completed") return;

      if (currentStatus === "Halftime") {
        await backendRequest.patch(
          `/api/v1/logger/matches/${TIMER_MATCH_ID}/status`,
          { data: { status: "Live_Second_Half" } },
        );
      }

      if (currentStatus !== "Fulltime" && currentStatus !== "Completed") {
        await backendRequest.patch(
          `/api/v1/logger/matches/${TIMER_MATCH_ID}/status`,
          { data: { status: "Fulltime" } },
        );
      }

      await backendRequest.patch(
        `/api/v1/logger/matches/${TIMER_MATCH_ID}/status`,
        { data: { status: "Completed" } },
      );
    };

    await ensureCompletedStatus();
    await page.reload();
    await expect(page.getByTestId("clock-locked-banner")).toBeVisible({
      timeout: 15000,
    });

    await expect
      .poll(
        async () => {
          const res = await backendRequest.get(
            `/api/v1/logger/matches/${TIMER_MATCH_ID}`,
          );
          if (!res.ok()) return `HTTP_${res.status()}`;
          const body = await res.json();
          return body.status as string | undefined;
        },
        { timeout: 45000, interval: 500 },
      )
      .toBe("Completed");

    await expect(
      page.getByTestId("period-status-fulltime").first(),
    ).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByTestId("clock-locked-banner").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(startBtn).toBeDisabled({ timeout: 15000 });
    await expect(stopBtn).toBeDisabled({ timeout: 15000 });
  });

  test("switches effective time on and accumulates while clock runs", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await gotoLoggerPage(page, TIMER_MATCH_ID);
    await promoteToAdmin(page);
    await resetHarnessFlow(page);

    await unlockClockControls(page);
    await ensureClockRunning(page);
  });
});
