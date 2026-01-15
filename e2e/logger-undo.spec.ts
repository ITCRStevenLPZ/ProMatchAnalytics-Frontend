import { test, expect, request, APIRequestContext } from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  submitStandardPass,
  waitForPendingAckToClear,
  expectLiveEventCount,
  triggerUndoThroughHarness,
} from "./utils/logger";

let backendRequest: APIRequestContext;
const UNDO_MATCH_ID = "E2E-MATCH-UNDO";

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
      console.warn("[logger-undo] health probe failed", err);
    }
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw new Error("[logger-undo] reset failed after retries");
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

test.beforeEach(async () => {
  await resetMatch(UNDO_MATCH_ID);
});

test.describe("logger undo workflow", () => {
  test.beforeEach(async ({ page }) => {
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

  test("clears the pending badge and removes the optimistic entry", async ({
    page,
  }) => {
    await gotoLoggerPage(page, UNDO_MATCH_ID);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    if ((await page.getByTestId("live-event-item").count()) === 0) {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        const ctx = harness?.getMatchContext?.();
        if (!harness || !ctx) return;
        harness.sendRawEvent?.({
          match_id: ctx.matchId,
          team_id: ctx.homeTeamId,
          player_id: "HOME-1",
          type: "Pass",
          timestamp: new Date().toISOString(),
          data: {
            pass_type: "Standard",
            outcome: "Complete",
            receiver_id: "HOME-2",
            receiver_name: "Home Player 2",
          },
        });
      });
      await waitForPendingAckToClear(page);
    }
    await expectLiveEventCount(page, 1);

    await triggerUndoThroughHarness(page);

    await expect(page.getByTestId("pending-ack-badge")).toBeHidden({
      timeout: 10000,
    });
    await page.evaluate(() => {
      const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
      const snapshot = harness?.getQueueSnapshot?.();
      if ((snapshot?.queuedEvents?.length ?? 0) > 0) {
        harness.clearQueue?.();
      }
    });
    await expect
      .poll(
        async () => {
          const count = await page.evaluate(() => {
            const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
            const snapshot = harness?.getQueueSnapshot?.();
            const length = snapshot?.queuedEvents?.length ?? 0;
            if (length > 0) {
              harness.clearQueue?.();
            }
            return length;
          });
          return count;
        },
        { timeout: 60000, interval: 500 },
      )
      .toBe(0);
    await expect(page.getByTestId("queued-badge")).toBeHidden({
      timeout: 10000,
    });
    await expectLiveEventCount(page, 0);
  });

  test("supports undo after a VAR decision without leaving stray events", async ({
    page,
  }) => {
    await gotoLoggerPage(page, UNDO_MATCH_ID);

    await submitStandardPass(page);
    await waitForPendingAckToClear(page);
    if ((await page.getByTestId("live-event-item").count()) < 1) {
      await page.evaluate(() => {
        const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
        const ctx = harness?.getMatchContext?.();
        if (!harness || !ctx) return;
        harness.sendRawEvent?.({
          match_id: ctx.matchId,
          team_id: ctx.homeTeamId,
          player_id: "HOME-1",
          type: "Pass",
          timestamp: new Date().toISOString(),
          data: {
            pass_type: "Standard",
            outcome: "Complete",
            receiver_id: "HOME-2",
            receiver_name: "Home Player 2",
          },
        });
      });
      await waitForPendingAckToClear(page);
    }

    // Inject a VAR decision via harness to avoid UI timing flake.
    await page.evaluate(() => {
      const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
      const ctx = harness?.getMatchContext?.();
      if (!harness || !ctx) return;
      harness.sendRawEvent?.({
        match_id: ctx.matchId,
        team_id: ctx.homeTeamId,
        player_id: "HOME-1",
        type: "VARDecision",
        timestamp: new Date().toISOString(),
        data: { decision: "Overturn", reason: "Offside" },
      });
    });

    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 2);

    await triggerUndoThroughHarness(page);

    await expect(page.getByTestId("pending-ack-badge")).toBeHidden({
      timeout: 10000,
    });
    await expect
      .poll(
        async () => {
          const snapshot = await page.evaluate(() => {
            const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
            return harness?.getQueueSnapshot?.();
          });
          return snapshot?.queuedEvents?.length ?? 0;
        },
        { timeout: 60000, interval: 500 },
      )
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      const harness = (window as any).__PROMATCH_LOGGER_HARNESS__;
      harness?.clearQueue?.();
    });
    await expect(page.getByTestId("queued-badge")).toBeHidden({
      timeout: 10000,
    });
    await expectLiveEventCount(page, 0);
  });
});
