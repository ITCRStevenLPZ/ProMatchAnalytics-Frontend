import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BACKEND_BASE_URL,
  ensureClockRunning,
  getHarnessMatchContext,
  gotoLoggerPage,
  resetHarnessFlow,
  sendRawEventThroughHarness,
  triggerUndoThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

const MATCH_ID = "E2E-MATCH-TAXONOMY";

let backendRequest: APIRequestContext;
let cardEventSequence = 0;

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

const primeHeavyVolume = async (page: Page, totalEvents: number) => {
  const context = await getHarnessMatchContext(page);
  expect(context).not.toBeNull();

  for (let index = 0; index < totalEvents; index += 1) {
    const seconds = 10 + index;
    const teamHome = index % 2 === 0;
    const teamId = teamHome ? context!.homeTeamId : context!.awayTeamId;
    const prefix = teamHome ? "HOME" : "AWAY";
    const playerNum = (index % 8) + 1;
    await sendRawEventThroughHarness(page, {
      period: 1,
      match_clock: `00:${String(seconds % 60).padStart(2, "0")}.${String(index)
        .padStart(3, "0")
        .slice(-3)}`,
      team_id: teamId,
      player_id: `${prefix}-${playerNum}`,
      type: "Pass",
      data: {
        pass_type: "Standard",
        outcome: "Complete",
        receiver_id: `${prefix}-${Math.min(11, playerNum + 1)}`,
      },
    });
  }

  await waitForPendingAckToClear(page);
};

const logCardForPlayer = async (
  page: Page,
  playerId: string,
  cardType: "Yellow" | "Yellow (Second)" | "Cancelled",
) => {
  const context = await getHarnessMatchContext(page);
  expect(context).not.toBeNull();
  cardEventSequence += 1;
  const second = 10 + cardEventSequence;

  await sendRawEventThroughHarness(page, {
    period: 1,
    match_clock: `01:${String(second % 60).padStart(2, "0")}.${String(
      cardEventSequence,
    )
      .padStart(3, "0")
      .slice(-3)}`,
    team_id: context!.homeTeamId,
    player_id: playerId,
    type: "Card",
    data: {
      card_type: cardType,
      reason: "Foul",
    },
  });
  await waitForPendingAckToClear(page);
};

const openSubstitutionModal = async (page: Page) => {
  await resetHarnessFlow(page, "home");
  await page.getByTestId("field-player-HOME-2").click({ force: true });

  const actionSelection = page.getByTestId("action-selection");
  const hasActionSelection = await actionSelection
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (!hasActionSelection) {
    const more = page.getByTestId("quick-action-more");
    const hasMore = await more.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasMore) {
      await more.click({ timeout: 8000 });
    }
  }

  await page.getByTestId("action-btn-Substitution").click();
  const modal = page.getByTestId("substitution-modal");
  await expect(modal).toBeVisible({ timeout: 10000 });
  return modal;
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
  cardEventSequence = 0;
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId: MATCH_ID },
  });
  expect(response.ok()).toBeTruthy();
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "en"));
});

test.describe("Logger ultimate disciplinary stress", () => {
  test.describe.configure({ mode: "serial" });

  test("UDS-01: second-yellow/red expulsion still blocks substitution after heavy event volume", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    await primeHeavyVolume(page, 120);

    await logCardForPlayer(page, "HOME-1", "Yellow");
    await logCardForPlayer(page, "HOME-1", "Yellow (Second)");

    await expect(
      page.getByTestId("field-player-status-red-HOME-1"),
    ).toBeVisible({
      timeout: 10000,
    });

    const subModal = await openSubstitutionModal(page);
    await expect(subModal.getByTestId("sub-off-HOME-1")).toHaveCount(0);

    await subModal
      .getByRole("button", { name: /Cancel/i })
      .first()
      .click({ timeout: 8000 });
    await expect(subModal).toBeHidden({ timeout: 10000 });
  });

  test("UDS-02: undo + cancellation chain restores substitution eligibility under load", async ({
    page,
  }) => {
    await gotoLoggerPage(page, MATCH_ID);
    await setRole(page, "admin");
    await ensureClockRunning(page);

    await primeHeavyVolume(page, 140);

    await logCardForPlayer(page, "HOME-1", "Yellow");
    await logCardForPlayer(page, "HOME-1", "Yellow (Second)");

    await expect(
      page.getByTestId("field-player-status-red-HOME-1"),
    ).toBeVisible({
      timeout: 10000,
    });

    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);

    await expect(
      page.getByTestId("field-player-status-red-HOME-1"),
    ).toHaveCount(0);

    await logCardForPlayer(page, "HOME-1", "Yellow (Second)");
    await expect(
      page.getByTestId("field-player-status-red-HOME-1"),
    ).toBeVisible({
      timeout: 10000,
    });

    await logCardForPlayer(page, "HOME-1", "Cancelled");

    await expect(
      page.getByTestId("field-player-status-red-HOME-1"),
    ).toHaveCount(0);

    const subModal = await openSubstitutionModal(page);
    await expect(subModal.getByTestId("sub-off-HOME-1")).toBeVisible({
      timeout: 10000,
    });

    await subModal
      .getByRole("button", { name: /Cancel/i })
      .first()
      .click({ timeout: 8000 });
    await expect(subModal).toBeHidden({ timeout: 10000 });
  });
});
