import { expect, test } from "@playwright/test";
import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  seedReferee,
  seedPlayer,
  seedTeam,
  seedVenue,
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

const acceptNextDialog = (page: any) => {
  page.once("dialog", (dialog: any) => dialog.accept());
};

const inputAfterLabel = (page: any, label: RegExp) =>
  page.locator("label", { hasText: label }).locator("..").locator("input");

const selectAfterLabel = (page: any, label: RegExp) =>
  page.locator("label", { hasText: label }).locator("..").locator("select");

const confirmAllChanges = async (page: any) => {
  const start = Date.now();
  while (Date.now() - start < 10000) {
    const confirmButton = page.getByRole("button", {
      name: /Confirmar Cambios|Confirm Changes|Confirm/i,
    });
    if (await confirmButton.isVisible({ timeout: 250 }).catch(() => false)) {
      await confirmButton.click();
      await page.waitForTimeout(200);
      continue;
    }
    break;
  }
};

test.describe("Admin UI CRUD smoke", () => {
  let api: Awaited<ReturnType<typeof createAdminApiContext>>;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("Competition list supports edit + delete", async ({ page }) => {
    const competitionId = uniqueId("UICOMP");
    const competitionName = `UI Comp ${competitionId.slice(-4)}`;
    await api.post("competitions/", {
      data: {
        competition_id: competitionId,
        name: competitionName,
        gender: "male",
        country_name: "USA",
        i18n_names: {},
      },
    });

    try {
      await primeAdminStorage(page);
      await page.goto("/competitions");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", {
          name: /Competitions|Competencias|Competiciones/i,
        }),
      ).toBeVisible({ timeout: 20000 });
      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(competitionName);
      await expect(
        page.getByRole("cell", { name: competitionName }),
      ).toBeVisible();

      await page
        .locator("tr", { hasText: competitionName })
        .getByRole("button", { name: /Edit|Editar/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Edit|Editar/i }),
      ).toBeVisible();
      await inputAfterLabel(page, /Short Name|Nombre Corto/i).fill("UIS");
      await selectAfterLabel(page, /Country|Pa[ií]s/i).selectOption(
        "United States",
      );
      await page.getByRole("button", { name: /Save|Guardar/i }).click();
      await confirmAllChanges(page);

      await page.waitForLoadState("networkidle");
      await page.reload();
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      const searchAfterSave = page.getByPlaceholder(/Search|Buscar/i);
      await searchAfterSave.fill(competitionName);
      await expect(
        page.locator("tr", { hasText: competitionName }),
      ).toBeVisible({ timeout: 15000 });

      acceptNextDialog(page);
      await page
        .locator("tr", { hasText: competitionName })
        .getByRole("button", { name: /Delete|Eliminar/i })
        .click();
      await expect(
        page.locator("tr", { hasText: competitionName }),
      ).toHaveCount(0);
    } finally {
      await cleanupResource(api, `competitions/${competitionId}`).catch(
        () => {},
      );
    }
  });

  test("Venue list supports edit + delete", async ({ page }) => {
    const venue = await seedVenue(api, {
      name: `UI Venue ${uniqueId("UIVEN").slice(-4)}`,
      city: "Austin",
    });
    const venueName = venue.name ?? "UI Venue";

    try {
      await primeAdminStorage(page);
      await page.goto("/venues");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: /Venues|Estadios/i }),
      ).toBeVisible({ timeout: 20000 });
      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(venueName);
      await expect(page.getByText(venueName)).toBeVisible();

      await page
        .locator("tr", { hasText: venueName })
        .getByRole("button", { name: /Edit|Editar/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Edit|Editar/i }),
      ).toBeVisible();
      await inputAfterLabel(page, /City|Ciudad/i).fill("Dallas");
      await selectAfterLabel(page, /Country|Pa[ií]s/i).selectOption(
        "United States",
      );
      await page.getByRole("button", { name: /Save|Guardar/i }).click();
      await confirmAllChanges(page);

      await page.waitForLoadState("networkidle");
      await page.reload();
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      const venueSearchAfterSave = page.getByPlaceholder(/Search|Buscar/i);
      await venueSearchAfterSave.fill(venueName);
      await expect(page.locator("tr", { hasText: venueName })).toBeVisible({
        timeout: 15000,
      });

      acceptNextDialog(page);
      await page
        .locator("tr", { hasText: venueName })
        .getByRole("button", { name: /Delete|Eliminar/i })
        .click();
      await expect(page.locator("tr", { hasText: venueName })).toHaveCount(0);
    } finally {
      await cleanupResource(api, `venues/${venue.venue_id}`).catch(() => {});
    }
  });

  test("Player list supports edit + delete", async ({ page }) => {
    const player = await seedPlayer(api, {
      name: `UI Player ${uniqueId("UIPLY").slice(-4)}`,
      position: "CM",
      country_name: "USA",
    });

    try {
      await primeAdminStorage(page);
      await page.goto("/players");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: /Players|Jugadores/i }),
      ).toBeVisible({ timeout: 20000 });
      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(player.name);
      await expect(page.getByText(player.name)).toBeVisible();

      await page
        .locator("tr", { hasText: player.name })
        .getByRole("button", { name: /Edit|Editar/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Edit|Editar/i }),
      ).toBeVisible();
      await selectAfterLabel(page, /Country|Pa[ií]s/i).selectOption("Canada");
      await page.getByRole("button", { name: /Save|Guardar/i }).click();
      await confirmAllChanges(page);

      await page.waitForLoadState("networkidle");
      await page.reload();
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      const playerSearchAfterSave = page.getByPlaceholder(/Search|Buscar/i);
      await playerSearchAfterSave.fill(player.name);
      await expect(page.locator("tr", { hasText: player.name })).toBeVisible({
        timeout: 15000,
      });

      acceptNextDialog(page);
      await page
        .locator("tr", { hasText: player.name })
        .getByRole("button", { name: /Delete|Eliminar/i })
        .click();
      await expect(page.locator("tr", { hasText: player.name })).toHaveCount(0);
    } finally {
      await cleanupResource(api, `players/${player.player_id}`).catch(() => {});
    }
  });

  test("Team list supports edit + delete", async ({ page }) => {
    const team = await seedTeam(api, {
      name: `UI Team ${uniqueId("UITEAM").slice(-4)}`,
    });

    try {
      await primeAdminStorage(page);
      await page.goto("/teams");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: /Teams|Equipos/i }),
      ).toBeVisible({ timeout: 20000 });
      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(team.name);
      await expect(page.getByText(team.name)).toBeVisible();

      await page
        .locator("tr", { hasText: team.name })
        .getByRole("button", { name: /Edit|Editar/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Edit|Editar/i }),
      ).toBeVisible();
      await inputAfterLabel(page, /Short Name|Nombre Corto/i).fill("UTS");
      await selectAfterLabel(page, /Country|Pa[ií]s/i).selectOption(
        "United States",
      );
      await page.getByRole("button", { name: /Save|Guardar/i }).click();
      await confirmAllChanges(page);

      await page.waitForLoadState("networkidle");
      await page.reload();
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      const teamSearchAfterSave = page.getByPlaceholder(/Search|Buscar/i);
      await teamSearchAfterSave.fill(team.name);
      await expect(page.locator("tr", { hasText: team.name })).toBeVisible({
        timeout: 15000,
      });

      acceptNextDialog(page);
      await page
        .locator("tr", { hasText: team.name })
        .getByRole("button", { name: /Delete|Eliminar/i })
        .click();
      await expect(page.locator("tr", { hasText: team.name })).toHaveCount(0);
    } finally {
      for (const rosterEntry of team.roster) {
        await cleanupResource(api, `players/${rosterEntry.player_id}`).catch(
          () => {},
        );
      }
      await cleanupResource(api, `teams/${team.team_id}`).catch(() => {});
    }
  });

  test("Referee list supports edit + delete", async ({ page }) => {
    const referee = await seedReferee(api, {
      name: `UI Ref ${uniqueId("UIREF").slice(-4)}`,
    });

    try {
      await primeAdminStorage(page);
      await page.goto("/referees");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: /Referees|Árbitros/i }),
      ).toBeVisible({ timeout: 20000 });
      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(referee.name ?? "UI Ref");
      await expect(page.getByText(referee.name ?? "UI Ref")).toBeVisible();

      await page
        .locator("tr", { hasText: referee.name ?? "UI Ref" })
        .getByRole("button", { name: /Edit|Editar/i })
        .click();
      await expect(
        page.getByRole("heading", { name: /Edit|Editar/i }),
      ).toBeVisible();
      await selectAfterLabel(page, /Country|Pa[ií]s/i).selectOption("Canada");
      await page.getByRole("button", { name: /Save|Guardar/i }).click();
      await confirmAllChanges(page);

      await page.waitForLoadState("networkidle");
      await page.reload();
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      const refSearchAfterSave = page.getByPlaceholder(/Search|Buscar/i);
      await refSearchAfterSave.fill(referee.name ?? "UI Ref");
      await expect(
        page.locator("tr", { hasText: referee.name ?? "UI Ref" }),
      ).toBeVisible({ timeout: 15000 });

      acceptNextDialog(page);
      await page
        .locator("tr", { hasText: referee.name ?? "UI Ref" })
        .getByRole("button", { name: /Delete|Eliminar/i })
        .click();
      await expect(
        page.locator("tr", { hasText: referee.name ?? "UI Ref" }),
      ).toHaveCount(0);
    } finally {
      await cleanupResource(api, `referees/${referee.referee_id}`).catch(
        () => {},
      );
    }
  });
});
