import {
  test,
  expect,
  request,
  APIRequestContext,
  Page,
} from "@playwright/test";
import {
  BACKEND_BASE_URL,
  gotoLoggerPage,
  resetHarnessFlow,
  triggerUndoThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";
import { uniqueId } from "./utils/admin";

const makeMatchId = () => uniqueId("E2E-MATCH-DISC");
let backendRequest: APIRequestContext;
let matchId: string;

const resetMatch = async (matchId: string) => {
  const response = await backendRequest.post("/e2e/reset", {
    data: { matchId },
  });
  expect(response.ok()).toBeTruthy();
};

const bootstrapPage = async (page: Page) => {
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
};

const logCardForBenchPlayer = async (
  page: Page,
  cardSelectId: string,
  team: "home" | "away",
  existingPlayerCardId?: string,
): Promise<string> => {
  await page.getByTestId(cardSelectId).click({ timeout: 8000 });
  await page.getByTestId(`card-team-${team}`).click({ timeout: 8000 });

  const playerCard = existingPlayerCardId
    ? page.getByTestId(existingPlayerCardId)
    : page
        .getByTestId(`bench-section-${team}`)
        .locator("[data-testid^='player-card-']")
        .first();

  await expect(playerCard).toBeVisible({ timeout: 10000 });
  const resolvedId =
    existingPlayerCardId ||
    (await playerCard.getAttribute("data-testid")) ||
    "";
  expect(resolvedId).toContain("player-card-");

  await playerCard.click({ force: true });
  await waitForPendingAckToClear(page);
  return resolvedId;
};

const logCardForFieldPlayer = async (
  page: Page,
  cardSelectId: string,
  team: "home" | "away",
  playerId: string,
) => {
  await page.getByTestId(cardSelectId).click({ timeout: 8000 });
  await page.getByTestId(`card-team-${team}`).click({ timeout: 8000 });
  const fieldPlayer = page.getByTestId(`field-player-${playerId}`);
  if (await fieldPlayer.isVisible().catch(() => false)) {
    await fieldPlayer.click({ force: true });
  } else {
    await page.getByTestId(`player-card-${playerId}`).click({ force: true });
  }
  await waitForPendingAckToClear(page);
};

const openSubstitutionModal = async (
  page: Page,
  triggerPlayerId = "HOME-2",
) => {
  await resetHarnessFlow(page, "home");
  await page
    .getByTestId(`field-player-${triggerPlayerId}`)
    .click({ force: true });
  await page.getByTestId("quick-action-more").click({ timeout: 8000 });
  await page.getByTestId("action-btn-Substitution").click();
  const subModal = page.getByTestId("substitution-modal");
  await expect(subModal).toBeVisible({ timeout: 10000 });
  return subModal;
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

test.describe("logger disciplinary rules", () => {
  test.beforeEach(async ({ page }) => {
    matchId = makeMatchId();
    await resetMatch(matchId);
    await bootstrapPage(page);
    await gotoLoggerPage(page, matchId);
    await resetHarnessFlow(page, "home");
  });

  test("second yellow auto-adds red and one undo removes both", async ({
    page,
  }) => {
    const playerCardId = await logCardForBenchPlayer(
      page,
      "card-select-yellow",
      "home",
    );
    await logCardForBenchPlayer(
      page,
      "card-select-yellow",
      "home",
      playerCardId,
    );

    const liveEvents = page.getByTestId("live-event-item");
    await expect
      .poll(async () => liveEvents.filter({ hasText: /Red|Roja/i }).count(), {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () =>
          liveEvents
            .filter({ hasText: /Yellow \(Second\)|Segunda Amarilla/i })
            .count(),
        { timeout: 10000 },
      )
      .toBe(1);

    await triggerUndoThroughHarness(page);
    await waitForPendingAckToClear(page);

    await expect
      .poll(
        async () =>
          liveEvents
            .filter({ hasText: /Yellow \(Second\)|Segunda Amarilla/i })
            .count(),
        { timeout: 10000 },
      )
      .toBe(0);
    await expect
      .poll(async () => liveEvents.filter({ hasText: /Red|Roja/i }).count(), {
        timeout: 10000,
      })
      .toBe(0);
    await expect
      .poll(
        async () => liveEvents.filter({ hasText: /Yellow|Amarilla/i }).count(),
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test("expelled player cannot log or be substituted until cancellation", async ({
    page,
  }) => {
    const playerId = "HOME-1";
    await logCardForFieldPlayer(page, "card-select-yellow", "home", playerId);
    await logCardForFieldPlayer(page, "card-select-yellow", "home", playerId);

    await expect(
      page.getByTestId(`field-player-status-yellow-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page
        .getByTestId(`field-player-status-yellow-${playerId}`)
        .locator("span"),
    ).toHaveCount(2);
    await expect(
      page.getByTestId(`field-player-status-red-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });

    await page.getByTestId("card-select-yellow").click({ timeout: 8000 });
    await expect(
      page.getByTestId(`player-card-status-yellow-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByTestId(`player-card-status-red-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("card-selection-cancel").click({ timeout: 8000 });

    await resetHarnessFlow(page, "home");
    await page.getByTestId(`field-player-${playerId}`).click({ force: true });
    await expect(
      page
        .getByTestId("logger-toast")
        .getByText(/Player is expelled and cannot log actions\./i),
    ).toBeVisible({ timeout: 5000 });

    const subModalBeforeCancel = await openSubstitutionModal(page, "HOME-2");
    await expect(
      subModalBeforeCancel.getByTestId(`sub-off-${playerId}`),
    ).toHaveCount(0);
    await subModalBeforeCancel
      .getByRole("button", { name: /Cancel/i })
      .first()
      .click();
    await expect(subModalBeforeCancel).toBeHidden({ timeout: 10000 });

    await logCardForFieldPlayer(
      page,
      "card-select-cancelled",
      "home",
      playerId,
    );

    await expect(
      page.getByTestId(`field-player-status-red-${playerId}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`field-player-status-yellow-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page
        .getByTestId(`field-player-status-yellow-${playerId}`)
        .locator("span"),
    ).toHaveCount(1);

    await page.getByTestId("card-select-yellow").click({ timeout: 8000 });
    await expect(
      page.getByTestId(`player-card-status-red-${playerId}`),
    ).toHaveCount(0);
    await expect(
      page.getByTestId(`player-card-status-yellow-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByTestId(`player-card-status-yellow-${playerId}`).locator("span"),
    ).toHaveCount(1);
    await page.getByTestId("card-selection-cancel").click({ timeout: 8000 });

    await resetHarnessFlow(page, "home");
    await page.getByTestId(`field-player-${playerId}`).click({ force: true });
    await expect(
      page.getByText(/Player is expelled and cannot log actions\./i),
    ).toHaveCount(0);
    await expect(page.getByTestId("quick-action-menu")).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("quick-action-cancel").click({ timeout: 8000 });

    const subModalAfterCancel = await openSubstitutionModal(page, "HOME-2");
    await expect(
      subModalAfterCancel.getByTestId(`sub-off-${playerId}`),
    ).toBeVisible({
      timeout: 10000,
    });
  });
});
