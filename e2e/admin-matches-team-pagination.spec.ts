import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  cleanupResource,
  createAdminApiContext,
  seedTeam,
  uniqueId,
} from "./utils/admin";

test.describe("Admin create-match team pagination", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("loads teams beyond first backend page in create match team selectors", async ({
    page,
  }) => {
    const createdTeamIds: string[] = [];
    const suffix = uniqueId("TEAMPG");
    const targetTeamName = `Pagination Target ${suffix}`;
    const targetTeamId = uniqueId("TEAMTARGET");

    try {
      // Create enough teams to force multi-page backend retrieval (>100).
      for (let i = 0; i < 105; i += 1) {
        const seeded = await seedTeam(api, {
          team_id: uniqueId("TEAM"),
          name: `Pagination Seed ${i} ${suffix}`,
          rosterTemplate: [],
        });
        createdTeamIds.push(seeded.team_id);
      }

      const targetSeed = await seedTeam(api, {
        team_id: targetTeamId,
        name: targetTeamName,
        rosterTemplate: [],
      });
      createdTeamIds.push(targetSeed.team_id);

      await page.goto("/matches");
      await page.getByTestId("create-match-btn").click();
      await expect(page.getByTestId("modal-title")).toBeVisible({
        timeout: 15000,
      });

      const homeSelect = page.getByTestId("home-team-select");
      await expect(homeSelect).toBeVisible();

      // Verify option from beyond first page is present in match team assignment.
      await expect
        .poll(
          async () =>
            await homeSelect.evaluate((el, expectedValue) => {
              const select = el as HTMLSelectElement;
              return Array.from(select.options).some(
                (opt) => opt.value === expectedValue,
              );
            }, targetTeamId),
          { timeout: 10000 },
        )
        .toBe(true);

      // Also verify away selector contains the same paginated team pool.
      const awaySelect = page.getByTestId("away-team-select");
      await expect
        .poll(
          async () =>
            await awaySelect.evaluate((el, expectedValue) => {
              const select = el as HTMLSelectElement;
              return Array.from(select.options).some(
                (opt) => opt.value === expectedValue,
              );
            }, targetTeamId),
          { timeout: 10000 },
        )
        .toBe(true);
    } finally {
      for (const teamId of createdTeamIds) {
        await cleanupResource(api, `teams/${teamId}`).catch(() => {});
      }
    }
  });
});
