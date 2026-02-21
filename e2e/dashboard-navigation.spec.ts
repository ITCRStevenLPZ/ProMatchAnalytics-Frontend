import { expect, test } from "@playwright/test";

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

test.describe("Dashboard quick actions", () => {
  test("navigates to matches, teams, and players from dashboard cards", async ({
    page,
  }) => {
    await primeAdminStorage(page);
    await page.goto("/dashboard");
    await promoteToAdmin(page);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", {
        name: /dashboard|panel de control/i,
      }),
    ).toBeVisible({ timeout: 20000 });

    await page.locator('a[href="/matches"]').first().click();
    await expect(page).toHaveURL(/\/matches$/);

    await page.goto("/dashboard");
    await page.locator('a[href="/teams"]').first().click();
    await expect(page).toHaveURL(/\/teams$/);

    await page.goto("/dashboard");
    await page.locator('a[href="/players"]').first().click();
    await expect(page).toHaveURL(/\/players$/);
  });
});
