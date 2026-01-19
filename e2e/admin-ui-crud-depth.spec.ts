import { expect, test } from "@playwright/test";
import {
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
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
  await page.addInitScript((user: typeof adminUser) => {
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
  await page.evaluate((user: typeof adminUser) => {
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

const inputAfterLabel = (page: any, label: RegExp) =>
  page
    .locator("label", { hasText: label })
    .locator("..")
    .locator("input")
    .first();

const selectAfterLabel = (page: any, label: RegExp) =>
  page.locator("label", { hasText: label }).locator("..").locator("select");

test.describe("Admin UI CRUD depth (validations, pagination, filters)", () => {
  let api: Awaited<ReturnType<typeof createAdminApiContext>>;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("player create form blocks empty required fields and overly long names", async ({
    page,
  }) => {
    await primeAdminStorage(page);
    await page.goto("/players");
    await promoteToAdmin(page);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /Players|Jugadores/i }),
    ).toBeVisible({ timeout: 20000 });

    await page
      .getByRole("button", { name: /Create Player|Crear Jugador/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).toBeVisible();

    const nameInput = inputAfterLabel(page, /Name|Nombre/i);
    await nameInput.fill("");
    await nameInput.blur();

    const countrySelect = selectAfterLabel(page, /Country|Pa[ií]s/i);
    await countrySelect.selectOption("");

    await page.getByRole("button", { name: /Save|Guardar/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).toBeVisible();

    const longName = "P".repeat(130);
    await nameInput.fill(longName);
    await nameInput.blur();
    await page.getByRole("button", { name: /Save|Guardar/i }).click();

    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Cancel|Cancelar/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("players table search + pagination navigates seeded rows", async ({
    page,
  }) => {
    const prefix = `Depth Player ${uniqueId("DP").slice(-4)}`;
    const playerIds: string[] = [];

    for (let idx = 0; idx < 22; idx++) {
      const name = `${prefix} ${idx}`;
      const seeded = await seedPlayer(api, {
        name,
        position: idx % 2 === 0 ? "CM" : "ST",
      });
      playerIds.push(seeded.player_id);
    }

    try {
      await primeAdminStorage(page);
      await page.goto("/players");
      await promoteToAdmin(page);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("heading", { name: /Players|Jugadores/i }),
      ).toBeVisible({ timeout: 20000 });

      const searchInput = page.getByPlaceholder(/Search|Buscar/i);
      await searchInput.fill(prefix);

      await expect
        .poll(
          async () =>
            await page.locator("tr").filter({ hasText: prefix }).count(),
          {
            timeout: 15000,
          },
        )
        .toBeGreaterThan(5);

      const nextButton = page
        .getByRole("button", {
          name: /Next|Siguiente|Next page|Siguiente página|›|»/i,
        })
        .or(page.getByLabel(/Next|Siguiente/i));
      const targetRow = page.locator("tr", { hasText: `${prefix} 21` });

      for (let hop = 0; hop < 3; hop++) {
        if (await targetRow.isVisible({ timeout: 3000 }).catch(() => false))
          break;
        const enabled = await nextButton.isEnabled().catch(() => false);
        if (!enabled) break;
        await nextButton.click();
      }

      await expect(targetRow).toBeVisible({ timeout: 15000 });
    } finally {
      await Promise.all(
        playerIds.map((id) =>
          cleanupResource(api, `players/${id}`).catch(() => {}),
        ),
      );
    }
  });
});
