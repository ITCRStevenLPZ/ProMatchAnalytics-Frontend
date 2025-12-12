import { test, expect } from "@playwright/test";
import { createAdminApiContext } from "./utils/admin";

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
  page.locator("label", { hasText: label }).locator("..").locator("input");

const selectAfterLabel = (page: any, label: RegExp) =>
  page.locator("label", { hasText: label }).locator("..").locator("select");

test.describe("Admin UI competition validations", () => {
  let api: Awaited<ReturnType<typeof createAdminApiContext>>;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("blocks save when required fields are invalid", async ({ page }) => {
    await primeAdminStorage(page);
    await page.goto("/competitions");
    await promoteToAdmin(page);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", {
        name: /Competitions|Competiciones|Competencias/i,
      }),
    ).toBeVisible({ timeout: 20000 });

    await page
      .getByRole("button", { name: /Create Competition|Crear Competici[oó]n/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).toBeVisible();

    const nameInput = page.getByPlaceholder(/competici[oó]n/i).first();
    await nameInput.fill("UI Validation Competition");

    const shortNameInput = inputAfterLabel(page, /Short Name|Nombre Corto/i);
    await shortNameInput.fill("A");
    await shortNameInput.blur();

    // Leave country empty to trigger required validation
    const countrySelect = selectAfterLabel(page, /Country|Pa[ií]s/i);
    await countrySelect.selectOption("");

    await page.getByRole("button", { name: /Save|Guardar/i }).click();

    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).toBeVisible();
    await expect(countrySelect).toHaveClass(/border-red-500/);

    // Form should remain open; close it to clean up
    await page.getByRole("button", { name: /Cancel|Cancelar/i }).click();
    await expect(
      page.getByRole("heading", { name: /Create|Crear/i }),
    ).not.toBeVisible({ timeout: 5000 });
  });
});
