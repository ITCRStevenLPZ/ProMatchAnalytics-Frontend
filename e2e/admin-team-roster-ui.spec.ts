import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
  seedTeam,
  uniqueId,
} from "./utils/admin";

test.describe("Admin team roster UI", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("custom roster picker and dropdowns work with non-rostered candidates only", async ({
    page,
  }) => {
    const seededTeam = await seedTeam(api, {
      name: `Roster UI ${uniqueId("TEAM")}`,
    });
    const seededRosterPlayerId = seededTeam.roster[0]?.player_id;
    const extraPlayer = await seedPlayer(api, {
      name: `Roster UI Candidate ${uniqueId("PLY")}`,
      position: "ST",
    });

    try {
      await page.goto("/teams");
      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(seededTeam.name);

      const teamRow = page.locator("tr", { hasText: seededTeam.name }).first();
      await expect(teamRow).toBeVisible({ timeout: 15000 });

      await teamRow
        .locator('button[title="Roster"], button[title="Plantel"]')
        .first()
        .click();

      await expect(
        page.locator("h2", { hasText: seededTeam.name }).first(),
      ).toBeVisible({ timeout: 10000 });

      const playerPickerToggle = page.getByTestId(
        "roster-player-picker-toggle",
      );
      await playerPickerToggle.click();

      await expect(
        page.getByTestId(
          `roster-available-player-option-${extraPlayer.player_id}`,
        ),
      ).toBeVisible();
      await expect(
        page.getByTestId(
          `roster-available-player-option-${seededRosterPlayerId}`,
        ),
      ).toHaveCount(0);

      await page
        .getByTestId(`roster-available-player-option-${extraPlayer.player_id}`)
        .click();

      await page.getByTestId("roster-position-toggle").click();
      await page.getByTestId("roster-position-option-ST").click();

      await page
        .getByRole("button", { name: /Add to Roster|Agregar al Plantel/i })
        .click();

      await expect(
        page.getByText(extraPlayer.name, { exact: false }).first(),
      ).toBeVisible({ timeout: 10000 });

      await page.getByTestId("roster-filter-position-toggle").click();
      await page.getByTestId("roster-filter-position-option-ST").click();
      await expect(
        page.getByText(extraPlayer.name, { exact: false }).first(),
      ).toBeVisible();
    } finally {
      const rosterResponse = await api.get(
        `teams/${seededTeam.team_id}/players?page=1&page_size=100`,
      );
      const rosterPayload = await apiJson<{
        items: Array<{ player_id: string }>;
      }>(rosterResponse);
      for (const rosterEntry of rosterPayload.items) {
        await cleanupResource(
          api,
          `teams/${seededTeam.team_id}/players/${rosterEntry.player_id}`,
        ).catch(() => {});
      }
      await cleanupResource(api, `players/${extraPlayer.player_id}`).catch(
        () => {},
      );
      await cleanupResource(api, `teams/${seededTeam.team_id}`).catch(() => {});
    }
  });

  test("roster player search includes players beyond first players page", async ({
    page,
  }) => {
    const seededTeam = await seedTeam(api, {
      name: `Roster Overflow ${uniqueId("TEAM")}`,
      rosterTemplate: [{ position: "GK" }],
    });

    const targetPlayer = await seedPlayer(api, {
      name: `Overflow Target ${uniqueId("PLY")}`,
      position: "CM",
    });
    const overflowPlayerIds = [targetPlayer.player_id];

    for (let index = 0; index < 105; index += 1) {
      const overflow = await seedPlayer(api, {
        name: `Overflow Filler ${index} ${uniqueId("PLY")}`,
        position: "CB",
      });
      overflowPlayerIds.push(overflow.player_id);
    }

    try {
      await page.goto("/teams");
      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(seededTeam.name);

      const teamRow = page.locator("tr", { hasText: seededTeam.name }).first();
      await expect(teamRow).toBeVisible({ timeout: 15000 });

      await teamRow
        .locator('button[title="Roster"], button[title="Plantel"]')
        .first()
        .click();

      await expect(
        page.locator("h2", { hasText: seededTeam.name }).first(),
      ).toBeVisible({ timeout: 10000 });

      await page.getByTestId("roster-player-picker-toggle").click();
      await page.getByTestId("roster-player-search").fill(targetPlayer.name);

      await expect(
        page.getByTestId(
          `roster-available-player-option-${targetPlayer.player_id}`,
        ),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      for (const rosterEntry of seededTeam.roster) {
        await cleanupResource(
          api,
          `teams/${seededTeam.team_id}/players/${rosterEntry.player_id}`,
        ).catch(() => {});
        await cleanupResource(api, `players/${rosterEntry.player_id}`).catch(
          () => {},
        );
      }

      for (const playerId of overflowPlayerIds) {
        await cleanupResource(api, `players/${playerId}`).catch(() => {});
      }

      await cleanupResource(api, `teams/${seededTeam.team_id}`).catch(() => {});
    }
  });

  test("shows roster loading while opening modal and while switching roster pages", async ({
    page,
  }) => {
    const seededTeam = await seedTeam(api, {
      name: `Roster Loading ${uniqueId("TEAM")}`,
      rosterTemplate: [
        { position: "GK" },
        { position: "CB" },
        { position: "CB" },
        { position: "RB" },
        { position: "LB" },
        { position: "CDM" },
        { position: "CM" },
        { position: "CAM" },
        { position: "LW" },
        { position: "RW" },
        { position: "ST" },
        { position: "CF" },
      ],
    });

    let delayedOpenRoster = false;
    let delayedRosterPagination = false;
    await page.route(
      `**/api/v1/teams/${seededTeam.team_id}/players?**`,
      async (route, request) => {
        const url = request.url();
        if (
          !delayedOpenRoster &&
          url.includes("page=1") &&
          url.includes("page_size=10")
        ) {
          delayedOpenRoster = true;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        if (
          !delayedRosterPagination &&
          url.includes("page=2") &&
          url.includes("page_size=10")
        ) {
          delayedRosterPagination = true;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
        await route.continue();
      },
    );

    try {
      await page.goto("/teams");
      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(seededTeam.name);

      const teamRow = page.locator("tr", { hasText: seededTeam.name }).first();
      await expect(teamRow).toBeVisible({ timeout: 15000 });

      await teamRow
        .locator('button[title="Roster"], button[title="Plantel"]')
        .first()
        .click();

      await expect(page.getByTestId("roster-modal-loading")).toBeVisible({
        timeout: 10000,
      });

      await expect(
        page.locator("h2", { hasText: seededTeam.name }).first(),
      ).toBeVisible({ timeout: 10000 });

      await expect(page.getByTestId("roster-modal-loading")).toHaveCount(0);

      const rosterModal = page.getByTestId("roster-modal");
      await rosterModal
        .locator('button[title="Next"], button[title="Siguiente"]')
        .first()
        .click();

      await expect(page.getByTestId("roster-pagination-loading")).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId("roster-pagination-loading")).toHaveCount(
        0,
      );
    } finally {
      await page.unroute(`**/api/v1/teams/${seededTeam.team_id}/players?**`);
      for (const rosterEntry of seededTeam.roster) {
        await cleanupResource(
          api,
          `teams/${seededTeam.team_id}/players/${rosterEntry.player_id}`,
        ).catch(() => {});
        await cleanupResource(api, `players/${rosterEntry.player_id}`).catch(
          () => {},
        );
      }
      await cleanupResource(api, `teams/${seededTeam.team_id}`).catch(() => {});
    }
  });

  test("shows teams pagination loading when switching pages", async ({
    page,
  }) => {
    const paginationPrefix = `Teams Paging ${uniqueId("PG")}`;
    const seededTeamIds: string[] = [];

    for (let index = 0; index < 130; index += 1) {
      const teamId = uniqueId("TEAM");
      const teamName = `${paginationPrefix} ${index}`;
      const response = await api.post("teams/", {
        data: {
          team_id: teamId,
          name: teamName,
          short_name: `P${String(index).padStart(2, "0")}`,
          gender: "male",
          country_name: "USA",
          i18n_names: {},
          managers: [],
          technical_staff: [],
        },
      });
      await apiJson(response);
      seededTeamIds.push(teamId);
    }

    let delayedSecondPage = false;
    await page.route("**/api/v1/teams**", async (route, request) => {
      const parsed = new URL(request.url());
      if (!delayedSecondPage && parsed.searchParams.get("page") === "2") {
        delayedSecondPage = true;
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      await route.continue();
    });

    try {
      await page.goto("/teams");
      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(paginationPrefix);

      await expect(
        page.locator("tr", { hasText: `${paginationPrefix} 0` }).first(),
      ).toBeVisible({ timeout: 15000 });

      await page
        .locator('button[title="Next"], button[title="Siguiente"]')
        .first()
        .click();

      await expect
        .poll(() => delayedSecondPage, {
          timeout: 10000,
        })
        .toBeTruthy();

      const teamsLoading = page.getByTestId("teams-pagination-loading");
      if ((await teamsLoading.count()) > 0) {
        await expect(teamsLoading).toHaveCount(0);
      }
      expect(delayedSecondPage).toBeTruthy();
    } finally {
      await page.unroute("**/api/v1/teams**");
      for (const teamId of seededTeamIds) {
        await cleanupResource(api, `admin/teams/${teamId}`).catch(() => {});
      }
    }
  });
});
