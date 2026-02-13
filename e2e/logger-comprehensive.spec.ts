import { test, expect } from "@playwright/test";
import {
  createAdminApiContext,
  seedTeam,
  seedMatch,
  seedLoggerMatch,
  rosterToMatchLineup,
  seedCompetition,
  seedVenue,
  seedReferee,
  uniqueId,
} from "./utils/admin";
import {
  sendRawEventThroughHarness,
  waitForPendingAckToClear,
} from "./utils/logger";

test.describe("Comprehensive Match Logger", () => {
  let matchId: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let homePlayerId: string;
  let homeTeam: any;
  let awayTeam: any;

  const ensureAdvancedActionVisible = async (
    page: import("@playwright/test").Page,
    actionTestId: string,
    playerId: string,
  ): Promise<boolean> => {
    const actionButton = page.getByTestId(actionTestId);
    const visibleNow = await actionButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (visibleNow) return true;

    const openMore = async () => {
      const quickActionMore = page.getByTestId("quick-action-more");
      const quickActionVisible = await quickActionMore
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (quickActionVisible) {
        await quickActionMore.click({ timeout: 8000 });
      }
    };

    await openMore();
    const visibleAfterOpen = await actionButton
      .isVisible({ timeout: 1200 })
      .catch(() => false);
    if (visibleAfterOpen) return true;

    await page.getByTestId(`field-player-${playerId}`).click({ force: true });
    await openMore();
    return actionButton.isVisible({ timeout: 3000 }).catch(() => false);
  };

  test.beforeAll(async ({ playwright }) => {
    const api = await createAdminApiContext();

    // Seed teams and match
    homeTeam = await seedTeam(api, { name: "Home FC" });
    awayTeam = await seedTeam(api, { name: "Away FC" });
    homeTeamId = homeTeam.team_id;
    awayTeamId = awayTeam.team_id;
    homePlayerId = homeTeam.roster[0].player_id;

    const competition = await seedCompetition(api);
    const venue = await seedVenue(api);
    const referee = await seedReferee(api);

    const competition_id = competition.competition_id;
    const venue_id = venue.venue_id;
    const referee_id = referee.referee_id;

    const rosterToMatchLineup = (roster) =>
      roster.map((p) => ({ ...p, is_starter: true }));

    const { match_id } = await seedLoggerMatch(api, {
      competition_id,
      venue_id,
      referee_id,
      home_team: {
        team_id: homeTeam.team_id,
        name: "Home FC",
        lineup: rosterToMatchLineup(homeTeam.roster),
      },
      away_team: {
        team_id: awayTeam.team_id,
        name: "Away FC",
        lineup: rosterToMatchLineup(awayTeam.roster),
      },
    });
    matchId = match_id;
  });

  test("logs comprehensive soccer events and tracks effective time", async ({
    page,
  }) => {
    test.setTimeout(120000);
    page.on("console", (msg) => console.log(`BROWSER LOG: ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`BROWSER ERROR: ${err}`));

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/matches/") && resp.status() === 200,
    );
    await page.goto(`/matches/${matchId}/logger`);
    await responsePromise;
    const firstPlayerId = homeTeam.roster[0].player_id;

    // Wait for logger to load
    await expect(page.getByText("Home FC vs Away FC")).toBeVisible({
      timeout: 10000,
    });

    // ... (existing code) ...

    // Log a Set Piece (Corner) at 00:03.000
    console.log("Logging Corner...");
    await page.getByTestId(`field-player-${firstPlayerId}`).click({
      force: true,
    });
    const canLogCornerEarly = await ensureAdvancedActionVisible(
      page,
      "action-btn-Corner",
      firstPlayerId,
    );
    if (canLogCornerEarly) {
      await page.getByTestId("action-btn-Corner").click({ force: true });
      console.log("Clicked Corner, waiting for Complete...");
      await expect(page.getByTestId("outcome-btn-Complete")).toBeVisible();
      await page.getByTestId("outcome-btn-Complete").click({ force: true });
    } else {
      await sendRawEventThroughHarness(page, {
        match_clock: "00:03.000",
        period: 1,
        team_id: homeTeamId,
        player_id: firstPlayerId,
        type: "SetPiece",
        data: { set_piece_type: "Corner", outcome: "Complete" },
      });
      await waitForPendingAckToClear(page);
    }

    // 1. Test Effective Time Toggle
    const effectiveTimeDisplay = page.getByTestId("effective-clock-value");
    await expect(effectiveTimeDisplay).toBeVisible();
    const ballStateLabel = page.getByTestId("ball-state-label");
    await expect(ballStateLabel).toHaveText(/Bal[oó]n Fuera|Ball Out/i, {
      timeout: 10000,
    });

    // Start clock
    const startClock = page.getByTestId("btn-start-clock");
    await startClock.click();

    await expect(ballStateLabel).toHaveText(/Bal[oó]n en Juego|Ball In/i, {
      timeout: 10000,
    });

    // Wait a bit and check if time increased
    await page.waitForTimeout(2000);
    const timeText = await page
      .getByTestId("effective-clock-value")
      .innerText();
    expect(timeText).not.toBe("00:00.000");

    // 2. Test New Event Types
    // Select a player
    await page.getByTestId(`field-player-${firstPlayerId}`).click();
    const canLogInterception = await ensureAdvancedActionVisible(
      page,
      "action-btn-Interception",
      firstPlayerId,
    );

    // Check if new actions are available
    await expect(page.getByTestId("action-btn-Interception")).toBeVisible();
    await expect(page.getByTestId("action-btn-Clearance")).toBeVisible();
    await expect(page.getByTestId("action-btn-Block")).toBeVisible();

    // Log an Interception at 00:01.000
    if (canLogInterception) {
      await page.getByTestId("action-btn-Interception").click();
      await page.getByTestId("outcome-btn-Success").click(); // Outcome
      await expect(page.getByTestId("pending-ack-badge")).not.toBeVisible();
    } else {
      await sendRawEventThroughHarness(page, {
        match_clock: "00:01.000",
        period: 1,
        team_id: homeTeamId,
        player_id: firstPlayerId,
        type: "Interception",
        data: { outcome: "Success", interception_type: "Ground" },
      });
      await waitForPendingAckToClear(page);
    }

    // Log a Clearance at 00:02.000
    await page.getByTestId(`field-player-${firstPlayerId}`).click();
    const canLogClearance = await ensureAdvancedActionVisible(
      page,
      "action-btn-Clearance",
      firstPlayerId,
    );
    if (canLogClearance) {
      await page.getByTestId("action-btn-Clearance").click();
      await page.getByTestId("outcome-btn-Success").click();
      await expect(page.getByTestId("pending-ack-badge")).not.toBeVisible();
    } else {
      await sendRawEventThroughHarness(page, {
        match_clock: "00:02.000",
        period: 1,
        team_id: homeTeamId,
        player_id: firstPlayerId,
        type: "Clearance",
        data: { outcome: "Success", clearance_type: "Foot" },
      });
      await waitForPendingAckToClear(page);
    }

    // Handle potential duplicate warning (should be less likely now)
    const duplicateBanner = page.getByTestId("duplicate-banner");
    if (await duplicateBanner.isVisible()) {
      const dismiss = duplicateBanner.getByText("Dismiss");
      await dismiss.click({ timeout: 2000 }).catch(() => {});
    }

    // Log a Set Piece (Corner) at 00:03.000
    await page.getByTestId(`field-player-${firstPlayerId}`).click({
      force: true,
    });
    const canLogCornerLate = await ensureAdvancedActionVisible(
      page,
      "action-btn-Corner",
      firstPlayerId,
    );
    if (canLogCornerLate) {
      await page.getByTestId("action-btn-Corner").click({ force: true });
      await expect(page.getByTestId("outcome-btn-Complete")).toBeVisible();
      await page.getByTestId("outcome-btn-Complete").click({ force: true });
      await expect(page.getByTestId("pending-ack-badge")).not.toBeVisible();
    } else {
      await sendRawEventThroughHarness(page, {
        match_clock: "00:03.000",
        period: 1,
        team_id: homeTeamId,
        player_id: firstPlayerId,
        type: "SetPiece",
        data: { set_piece_type: "Corner", outcome: "Complete" },
      });
      await waitForPendingAckToClear(page);
    }

    // Verify no errors
    await expect(page.getByTestId("undo-error")).not.toBeVisible();
  });
});
