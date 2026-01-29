import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
  seedTeam,
  uniqueId,
} from "./utils/admin";

const adminUser = {
  uid: "e2e-admin",
  email: "e2e-admin@example.com",
  displayName: "E2E Admin",
  photoURL: "",
  role: "admin" as const,
};

const primeAdminStorage = async (page: any) => {
  await page.addInitScript((user) => {
    try {
      window.localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    } catch (err) {
      console.warn("failed to prime admin storage", err);
    }
  }, adminUser);
};

const promoteToAdmin = async (page: any) => {
  await page.evaluate((user) => {
    const store = (window as any).__PROMATCH_AUTH_STORE__;
    store?.setState({ user, loading: false });
    store?.getState().setUser?.(user);
    try {
      localStorage.setItem(
        "auth-storage",
        JSON.stringify({ state: { user }, version: 0 }),
      );
    } catch (err) {
      console.warn("failed to persist admin role", err);
    }
  }, adminUser);
};

test.describe("Admin Teams roster UI flows", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("supports roster search, bulk edit, remove, and available filters", async ({
    page,
  }) => {
    const team = await seedTeam(api, {
      name: `Roster UI ${uniqueId("TEAM")}`,
      rosterTemplate: [
        { position: "GK" },
        { position: "CB" },
        { position: "ST" },
      ],
    });

    const rosterNames = team.roster.map((entry) => entry.player_name);
    const firstRoster = team.roster[0];
    const secondRoster = team.roster[1];
    const thirdRoster = team.roster[2];

    const extraKeeper = await seedPlayer(api, {
      name: `Roster Filter GK ${uniqueId("PLY")}`,
      position: "GK",
    });
    const extraStriker = await seedPlayer(api, {
      name: `Roster Filter ST ${uniqueId("PLY")}`,
      position: "ST",
    });

    try {
      await primeAdminStorage(page);
      await page.goto("/teams");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");

      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(team.name);
      await expect(
        page.getByRole("cell", { name: team.name, exact: true }),
      ).toBeVisible();

      await page
        .locator("tr", { hasText: team.name })
        .locator('button[title="Roster"], button[title="Plantel"]')
        .first()
        .click();

      const rosterModal = page
        .locator("div")
        .filter({ has: page.getByRole("heading", { name: /Roster|Plantel/i }) })
        .first();
      await expect(rosterModal).toBeVisible();

      const rosterSearch = rosterModal.getByTestId("roster-search-input");
      await rosterSearch.fill(firstRoster.player_name);
      const rosterRow = (playerId: string) =>
        rosterModal.getByTestId(`roster-row-${playerId}`);

      await expect(rosterSearch).toHaveValue(firstRoster.player_name);
      await expect(rosterRow(firstRoster.player_id)).toBeVisible();
      await expect(rosterRow(secondRoster.player_id)).toHaveCount(0);

      await rosterSearch.fill("");

      const firstRow = rosterRow(firstRoster.player_id);
      const secondRow = rosterRow(secondRoster.player_id);
      await rosterModal
        .getByTestId(`roster-jersey-${firstRoster.player_id}`)
        .fill("50");
      await rosterModal
        .getByTestId(`roster-jersey-${secondRoster.player_id}`)
        .fill("51");
      await rosterModal
        .getByTestId(`roster-starter-${firstRoster.player_id}`)
        .click();

      const saveButton = rosterModal.getByRole("button", {
        name: /Save|Guardar/i,
      });
      await expect(saveButton).toContainText("(2)");
      await saveButton.click();

      await expect
        .poll(async () => {
          const response = await api.get(
            `teams/${team.team_id}/players?page=1&page_size=20`,
          );
          const roster = await apiJson<{
            items: Array<{
              player_id: string;
              jersey_number: number;
              is_starter?: boolean;
            }>;
          }>(response);
          const first = roster.items.find(
            (item) => item.player_id === firstRoster.player_id,
          );
          const second = roster.items.find(
            (item) => item.player_id === secondRoster.player_id,
          );
          return {
            firstNumber: first?.jersey_number,
            secondNumber: second?.jersey_number,
            firstStarter: first?.is_starter,
          };
        })
        .toEqual({ firstNumber: 50, secondNumber: 51, firstStarter: true });

      page.once("dialog", (dialog) => dialog.accept());
      await rosterModal
        .getByTestId(`roster-remove-${thirdRoster.player_id}`)
        .click();

      await expect(rosterRow(thirdRoster.player_id)).toHaveCount(0);

      const positionFilter = rosterModal.getByTestId(
        "roster-available-position-filter",
      );
      const addPlayerSelect = rosterModal.getByTestId(
        "roster-available-player-select",
      );

      await expect
        .poll(async () => addPlayerSelect.locator("option").count())
        .toBeGreaterThan(0);

      const availableSearch = rosterModal.getByTestId(
        "roster-available-search-input",
      );
      await availableSearch.fill(extraKeeper.name);
      await expect(
        addPlayerSelect.locator("option", { hasText: extraKeeper.name }),
      ).toHaveCount(1);
      await availableSearch.fill("");

      await positionFilter.selectOption("GK");
      await expect(
        addPlayerSelect.locator("option", { hasText: extraKeeper.name }),
      ).toHaveCount(1);
      await expect(
        addPlayerSelect.locator("option", { hasText: extraStriker.name }),
      ).toHaveCount(0);
    } finally {
      for (const entry of team.roster) {
        await cleanupResource(
          api,
          `teams/${team.team_id}/players/${entry.player_id}`,
        ).catch(() => {});
        await cleanupResource(api, `players/${entry.player_id}`).catch(
          () => {},
        );
      }
      await cleanupResource(api, `players/${extraKeeper.player_id}`).catch(
        () => {},
      );
      await cleanupResource(api, `players/${extraStriker.player_id}`).catch(
        () => {},
      );
      await cleanupResource(api, `teams/${team.team_id}`).catch(() => {});
    }
  });
});
