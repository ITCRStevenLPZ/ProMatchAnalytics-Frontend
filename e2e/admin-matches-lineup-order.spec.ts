import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  addPlayerToTeam,
  cleanupResource,
  createAdminApiContext,
  seedCompetition,
  seedPlayer,
  seedReferee,
  seedTeam,
  seedVenue,
  uniqueId,
} from "./utils/admin";

test.describe("Admin matches lineup ordering", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("create match lineup lists are ordered by jersey number ascending", async ({
    page,
  }) => {
    const suffix = uniqueId("MORDER");
    const competitionId = uniqueId("COMP");
    const venueId = uniqueId("VEN");
    const refereeId = uniqueId("REF");

    const competitionName = `Lineup Order ${suffix}`;
    const venueName = `Order Venue ${suffix}`;
    const refereeName = `Order Ref ${suffix}`;

    const homeTeam = await seedTeam(api, {
      team_id: uniqueId("TEAMH"),
      name: `Order Home ${suffix}`,
      rosterTemplate: [],
    });
    const awayTeam = await seedTeam(api, {
      team_id: uniqueId("TEAMA"),
      name: `Order Away ${suffix}`,
      rosterTemplate: [],
    });

    const homePlayer7 = await seedPlayer(api, {
      name: `Home Seven ${suffix}`,
      position: "CB",
    });
    const homePlayer10 = await seedPlayer(api, {
      name: `Home Ten ${suffix}`,
      position: "CM",
    });
    const homePlayer25 = await seedPlayer(api, {
      name: `Home Twenty Five ${suffix}`,
      position: "ST",
    });
    const awayPlayer1 = await seedPlayer(api, {
      name: `Away One ${suffix}`,
      position: "GK",
    });

    const homePlayerIds = [
      homePlayer7.player_id,
      homePlayer10.player_id,
      homePlayer25.player_id,
    ];
    const awayPlayerIds = [awayPlayer1.player_id];

    const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    try {
      await seedCompetition(api, {
        competition_id: competitionId,
        name: competitionName,
      });
      await seedVenue(api, {
        venue_id: venueId,
        name: venueName,
      });
      await seedReferee(api, {
        referee_id: refereeId,
        name: refereeName,
      });

      await addPlayerToTeam(api, homeTeam.team_id, {
        player_id: homePlayer25.player_id,
        jersey_number: 25,
        position: "ST",
      });
      await addPlayerToTeam(api, homeTeam.team_id, {
        player_id: homePlayer10.player_id,
        jersey_number: 10,
        position: "CM",
      });
      await addPlayerToTeam(api, homeTeam.team_id, {
        player_id: homePlayer7.player_id,
        jersey_number: 7,
        position: "CB",
      });

      await addPlayerToTeam(api, awayTeam.team_id, {
        player_id: awayPlayer1.player_id,
        jersey_number: 1,
        position: "GK",
      });

      await page.goto("/matches");
      await page.getByTestId("create-match-btn").click();

      await page.getByTestId("competitions-select").selectOption({
        value: competitionId,
      });
      await page.getByTestId("season-input").fill("2025/2026");
      await page.getByTestId("competition-stage-input").fill("Regular Season");
      await page.getByTestId("home-team-select").selectOption({
        value: homeTeam.team_id,
      });
      await page.getByTestId("away-team-select").selectOption({
        value: awayTeam.team_id,
      });
      await page.getByTestId("match-date-input").fill(matchDate);
      await page.getByTestId("kickoff-time-input").fill("18:30");
      await page.getByTestId("venue-select").selectOption({ value: venueId });
      await page
        .getByTestId("referee-select")
        .selectOption({ value: refereeId });

      await page.getByRole("button", { name: /Next|Siguiente/i }).click();

      await expect(page.getByTestId("home-starters-candidates")).toBeVisible({
        timeout: 10000,
      });

      const starterRows = page
        .getByTestId("home-starters-candidates")
        .locator("div.bg-gray-50.rounded");

      await expect(starterRows.nth(0)).toContainText("#7");
      await expect(starterRows.nth(1)).toContainText("#10");
      await expect(starterRows.nth(2)).toContainText("#25");

      const substituteRows = page
        .getByTestId("home-substitutes-candidates")
        .locator("div.bg-gray-50.rounded");

      await expect(substituteRows.nth(0)).toContainText("#7");
      await expect(substituteRows.nth(1)).toContainText("#10");
      await expect(substituteRows.nth(2)).toContainText("#25");
    } finally {
      for (const playerId of homePlayerIds) {
        await cleanupResource(
          api,
          `teams/${homeTeam.team_id}/players/${playerId}`,
        ).catch(() => {});
      }
      for (const playerId of awayPlayerIds) {
        await cleanupResource(
          api,
          `teams/${awayTeam.team_id}/players/${playerId}`,
        ).catch(() => {});
      }
      for (const playerId of [...homePlayerIds, ...awayPlayerIds]) {
        await cleanupResource(api, `players/${playerId}`).catch(() => {});
      }

      await cleanupResource(api, `teams/${homeTeam.team_id}`).catch(() => {});
      await cleanupResource(api, `teams/${awayTeam.team_id}`).catch(() => {});
      await cleanupResource(api, `referees/${refereeId}`).catch(() => {});
      await cleanupResource(api, `venues/${venueId}`).catch(() => {});
      await cleanupResource(api, `competitions/${competitionId}`).catch(
        () => {},
      );
    }
  });
});
