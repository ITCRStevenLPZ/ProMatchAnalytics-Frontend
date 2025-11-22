import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
  uniqueId,
} from './utils/admin';

test.describe('Admin duplicate review flows', () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('duplicate warning inline action opens the SimilarRecordsViewer', async ({ page }) => {
    let seededPlayerId: string | null = null;

    try {
      const seededPlayer = await seedPlayer(api, {
        name: `Duplicate Flow ${uniqueId('PLYBASE')}`,
        position: 'CM',
        country_name: 'United States',
      });
      seededPlayerId = seededPlayer.player_id;

      await page.goto('/players');
      await page.waitForLoadState('networkidle');

      await page.waitForFunction(() => (globalThis as any).__PROMATCH_AUTH_STORE__);
      await page.evaluate(() => {
        (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().setUser({
          uid: 'e2e-admin',
          email: 'e2e@example.com',
          displayName: 'E2E Admin',
          photoURL: '',
          role: 'admin',
        });
      });
      await page.waitForFunction(
        () => (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role === 'admin',
      );

      await page.getByRole('button', { name: /(Create Player|Crear Jugador)/i }).click();

      const form = page.locator('form#player-form');
      const pendingPlayerId = uniqueId('PLYFORM');
      await form.getByRole('textbox', { name: 'player_123' }).fill(pendingPlayerId);
      await form.locator('#name').fill(seededPlayer.name);
      await form.locator('input[type="date"]').fill('1995-01-01');
      await form.locator('select').first().selectOption({ value: 'United States' });
      await form.locator('select').nth(1).selectOption('CM');
      await form.locator('input[type="number"]').first().fill('182');
      await form.locator('input[type="number"]').nth(1).fill('78');

      await page.getByRole('button', { name: /^(Save|Guardar)$/i }).click();

      const duplicateBanner = page.getByText(/(Potential Duplicates Found|Posibles Duplicados Encontrados)/i);
      await expect(duplicateBanner).toBeVisible();

      const reviewButton = page.getByRole('button', { name: /(Review similar records|Revisar registros similares)/i });
      await expect(reviewButton).toBeVisible();
      await reviewButton.click();

      const viewerHeading = page.getByRole('heading', { name: /(Similar Records Found|Registros Similares Encontrados)/i });
      await expect(viewerHeading).toBeVisible();
      await expect(page.getByText(seededPlayer.name).first()).toBeVisible();

      await page.getByRole('button', { name: /^(Close|Cerrar)$/i }).click();
      await expect(viewerHeading).toBeHidden();
    } finally {
      if (seededPlayerId) {
        await cleanupResource(api, `players/${seededPlayerId}`).catch(() => {});
      }
    }
  });
});
