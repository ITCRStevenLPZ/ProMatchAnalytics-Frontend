import { expect, test } from "@playwright/test";
import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  waitForIngestionStatus,
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

const selectByLabel = (page: any, label: RegExp) =>
  page.locator("label", { hasText: label }).locator("..").locator("select");

const createPlayerBatch = async (
  api: Awaited<ReturnType<typeof createAdminApiContext>>,
): Promise<{ batchId: string; playerId: string; batchName: string }> => {
  const playerId = `INGPLY-${Date.now()}`;
  const batchName = `Dashboard Smoke ${playerId.slice(-4)}`;
  const response = await api.post("ingestions/", {
    data: {
      target_model: "players",
      batch_name: batchName,
      metadata: { source: "playwright-dashboard-smoke" },
      data: [
        {
          player_id: playerId,
          name: `Smoke Player ${playerId.slice(-4)}`,
          nickname: "Smoke",
          birth_date: new Date("1994-03-15T00:00:00Z").toISOString(),
          player_height: 182,
          player_weight: 78,
          country_name: "USA",
          position: "CM",
          i18n_names: {},
        },
      ],
    },
  });
  const payload = await apiJson<{ ingestion_id: string }>(response);
  return { batchId: payload.ingestion_id, playerId, batchName };
};

test.describe("Ingestion dashboard smoke", () => {
  test.describe.configure({ mode: "serial" });
  let api: Awaited<ReturnType<typeof createAdminApiContext>>;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("lists settled batches with status and conflict counts", async ({
    page,
  }) => {
    const cleanupTargets: string[] = [];
    const { batchId, playerId, batchName } = await createPlayerBatch(api);
    cleanupTargets.push(`players/${playerId}`, `ingestions/${batchId}`);

    try {
      await waitForIngestionStatus(api, batchId, /^(success|conflicts)$/);

      await primeAdminStorage(page);
      await page.goto("/admin/ingestion");
      await promoteToAdmin(page);
      await page.waitForFunction(() => {
        const store = (window as any).__PROMATCH_AUTH_STORE__;
        return store?.getState()?.user?.role === "admin";
      });
      const authState = await page.evaluate(() => {
        const store = (window as any).__PROMATCH_AUTH_STORE__;
        return store?.getState();
      });
      console.log("[ingestion-dashboard] auth state", authState);
      const currentUrl = page.url();
      console.log("[ingestion-dashboard] navigated to", currentUrl);

      await expect(
        page.getByRole("button", { name: /Batches History/i }),
      ).toBeVisible({ timeout: 20000 });
      await page.getByRole("button", { name: /Batches History/i }).click();

      await selectByLabel(page, /Model|Modelo/i).selectOption("players");
      await selectByLabel(page, /Status|Estado/i).selectOption("success");
      await page.getByRole("button", { name: /Refresh/i }).click();

      await expect(page.getByText(/Showing \d+ of \d+ batches/i)).toBeVisible({
        timeout: 20000,
      });

      const row = page.locator("tr", { hasText: batchId.slice(0, 8) });
      await expect(row).toBeVisible({ timeout: 20000 });
      await expect(row.getByText(/Success|Completado/i)).toBeVisible();
      await expect(row.getByText(/0\s*\/\s*0\s*\/\s*0/)).toBeVisible({
        timeout: 20000,
      });
    } finally {
      for (const path of cleanupTargets) {
        try {
          await cleanupResource(api, path);
        } catch (err) {
          console.warn(
            "[ingestion-dashboard-smoke] cleanup skipped",
            path,
            err,
          );
        }
      }
    }
  });
});
