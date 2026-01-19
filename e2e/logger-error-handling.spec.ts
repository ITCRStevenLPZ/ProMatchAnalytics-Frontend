import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  expectLiveEventCount,
  forceSocketDisconnect,
  forceSocketReconnect,
  getQueuedBadge,
  gotoLoggerPage,
  resetHarnessFlow,
  submitStandardPass,
  waitForPendingAckToClear,
} from "./utils/logger";

const ERROR_MATCH_ID = "E2E-MATCH-ERRORS";

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
  await page.waitForFunction(
    (r) =>
      (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === r,
    role,
  );
};

const installWebSocketStub = async (page: Page) => {
  await page.addInitScript(() => {
    const ackSequence = ["error", "success", "success"];
    (window as any).__E2E_ACK_SEQUENCE__ = ackSequence;

    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      url: string;
      readyState = FakeWebSocket.CONNECTING;
      onopen: ((event: any) => void) | null = null;
      onmessage: ((event: any) => void) | null = null;
      onclose: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;

      constructor(url: string) {
        this.url = url;
        setTimeout(() => {
          this.readyState = FakeWebSocket.OPEN;
          this.onopen?.({});
        }, 0);
      }

      send(data: string) {
        try {
          const payload = JSON.parse(data);
          const seq = (window as any).__E2E_ACK_SEQUENCE__ as
            | string[]
            | undefined;
          const status = seq && seq.length ? seq.shift() : "success";
          const message = {
            type: "ack",
            result: {
              status,
              client_id: payload.client_id,
              event_id: status === "success" ? `ev-${Date.now()}` : undefined,
            },
          };
          setTimeout(() => {
            this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
          }, 10);
        } catch (error) {
          this.onerror?.(error as any);
        }
      }

      close(code = 1000, reason = "") {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ code, reason, wasClean: true } as CloseEvent);
      }
    }

    (window as any).WebSocket = FakeWebSocket as any;
    (window as any).webkitWebSocket = FakeWebSocket as any;
  });
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

test.beforeEach(async ({ page }) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: ERROR_MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
  await installWebSocketStub(page);
});

test.describe("Logger error handling", () => {
  test("surfaces failures, retries, and preserves events", async ({ page }) => {
    test.setTimeout(120000);

    let subValidateCalls = 0;
    await page.route(
      "**/api/v1/logger/matches/**/validate-substitution",
      (route) => {
        subValidateCalls += 1;
        if (subValidateCalls === 1) {
          return route.abort("failed");
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            is_valid: true,
            error_message: null,
            opens_new_window: false,
            team_status: {
              total_substitutions: 1,
              max_substitutions: 5,
              remaining_substitutions: 4,
              windows_used: 1,
              max_windows: 3,
              remaining_windows: 2,
              is_extra_time: false,
              concussion_subs_used: 0,
            },
          }),
        });
      },
    );

    await gotoLoggerPage(page, ERROR_MATCH_ID);
    await setRole(page, "admin");
    await resetHarnessFlow(page);

    // Event post receives error ack, gets re-queued, then succeeds after retry
    const queuedBadge = getQueuedBadge(page);
    await submitStandardPass(page);
    await expect(queuedBadge).toBeVisible({ timeout: 10000 });

    await forceSocketDisconnect(page);
    await forceSocketReconnect(page);
    await waitForPendingAckToClear(page);
    await expect(queuedBadge).toBeHidden({ timeout: 10000 });
    await expectLiveEventCount(page, 1);

    // Substitution validation first fails (500), then succeeds after retry
    await page.getByTestId("player-card-HOME-1").click();
    await page.getByTestId("action-btn-Substitution").click();

    const subModal = page.getByTestId("substitution-modal");
    await expect(subModal).toBeVisible();

    const offList = subModal.locator('[data-testid^="sub-off-"]');
    await expect(offList.first()).toBeVisible();
    await offList.first().click();

    const onList = subModal.locator('[data-testid^="sub-on-"]');
    await expect(onList.first()).toBeVisible();
    await onList.first().click();

    await expect
      .poll(() => subValidateCalls, { timeout: 10000 })
      .toBeGreaterThanOrEqual(1);

    const concussionToggle = subModal.getByRole("checkbox");
    await concussionToggle.check();

    await expect
      .poll(() => subValidateCalls, { timeout: 15000 })
      .toBeGreaterThanOrEqual(2);

    const confirmBtn = subModal.getByTestId("confirm-substitution");
    await expect(confirmBtn).toBeEnabled({ timeout: 15000 });
    await confirmBtn.click();

    await waitForPendingAckToClear(page);
    await expectLiveEventCount(page, 2);
    await expect(queuedBadge).toBeHidden({ timeout: 10000 });
  });
});
