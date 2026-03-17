import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  cleanupResource,
  createAdminApiContext,
  seedCompetition,
  seedReferee,
  seedTeam,
  seedVenue,
  uniqueId,
} from "./utils/admin";

test.describe("Admin create-match lineup defaults", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("starts with no starter/substitute checkboxes selected by default", async ({
    page,
  }) => {
    const suffix = uniqueId("MDEF");
    const competitionId = uniqueId("COMP");
    const venueId = uniqueId("VEN");
    const refereeId = uniqueId("REF");

    const homeTeam = await seedTeam(api, {
      team_id: uniqueId("TEAMH"),
      name: `Default Home ${suffix}`,
    });
    const awayTeam = await seedTeam(api, {
      team_id: uniqueId("TEAMA"),
      name: `Default Away ${suffix}`,
    });

    const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    try {
      await seedCompetition(api, {
        competition_id: competitionId,
        name: `Default Lineup ${suffix}`,
      });
      await seedVenue(api, { venue_id: venueId, name: `Venue ${suffix}` });
      await seedReferee(api, {
        referee_id: refereeId,
        name: `Referee ${suffix}`,
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
      await page.getByTestId("referee-select").selectOption({
        value: refereeId,
      });

      await page.getByRole("button", { name: /Next|Siguiente/i }).click();

      await expect(page.getByTestId("home-starters-candidates")).toBeVisible({
        timeout: 10000,
      });

      await expect(
        page
          .getByTestId("home-starters-candidates")
          .locator("input[type='checkbox']:checked"),
      ).toHaveCount(0);
      await expect(
        page
          .getByTestId("home-substitutes-candidates")
          .locator("input[type='checkbox']:checked"),
      ).toHaveCount(0);

      await page.getByRole("button", { name: /Next|Siguiente/i }).click();

      await expect(page.getByTestId("away-starters-candidates")).toBeVisible({
        timeout: 10000,
      });

      await expect(
        page
          .getByTestId("away-starters-candidates")
          .locator("input[type='checkbox']:checked"),
      ).toHaveCount(0);
      await expect(
        page
          .getByTestId("away-substitutes-candidates")
          .locator("input[type='checkbox']:checked"),
      ).toHaveCount(0);
    } finally {
      for (const entry of homeTeam.roster) {
        await cleanupResource(api, `players/${entry.player_id}`).catch(
          () => {},
        );
      }
      for (const entry of awayTeam.roster) {
        await cleanupResource(api, `players/${entry.player_id}`).catch(
          () => {},
        );
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
