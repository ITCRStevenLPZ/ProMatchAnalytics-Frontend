import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  uniqueId,
  waitForIngestionStatus,
} from './utils/admin';

type PlayerIngestionRow = {
  player_id: string;
  name: string;
  nickname: string;
  birth_date: string;
  player_height: number;
  player_weight: number;
  country_name: string;
  position: string;
  i18n_names: Record<string, string>;
};

const buildConflictRow = (
  overrides: Partial<PlayerIngestionRow> = {},
): PlayerIngestionRow => ({
  player_id: overrides.player_id ?? uniqueId('INGPLY'),
  name: overrides.name ?? `Conflict Player ${Math.random().toString(16).slice(2, 6)}`,
  nickname: overrides.nickname ?? 'Playwright Conflict',
  birth_date:
    overrides.birth_date ?? new Date('1994-03-15T00:00:00Z').toISOString(),
  player_height: overrides.player_height ?? 182,
  player_weight: overrides.player_weight ?? 78,
  country_name: overrides.country_name ?? 'USA',
  position: overrides.position ?? 'CM',
  i18n_names: overrides.i18n_names ?? {},
});

async function createIngestionBatch(
  api: APIRequestContext,
  rows: PlayerIngestionRow[],
): Promise<string> {
  const response = await api.post('ingestions/', {
    data: {
      target_model: 'players',
      data: rows,
      batch_name: `Conflict Dialog ${uniqueId('BATCH')}`,
      metadata: { source: 'playwright-conflict-dialog' },
    },
  });
  const payload = await apiJson<{ ingestion_id: string }>(response);
  return payload.ingestion_id;
}

async function getFirstConflictItem(
  api: APIRequestContext,
  ingestionId: string,
): Promise<{ item_id: string; has_conflict?: boolean; status: string }> {
  const itemsResponse = await api.get(
    `ingestions/${ingestionId}/items?page=1&page_size=5`,
  );
  const payload = await apiJson<{
    items: Array<{ item_id: string; has_conflict?: boolean; status: string }>;
  }>(itemsResponse);
  const conflictItem = payload.items.find((item) => item.has_conflict);
  if (!conflictItem) {
    throw new Error('Expected at least one conflict item');
  }
  return conflictItem;
}

async function bootstrapAdmin(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (globalThis as any).__PROMATCH_AUTH_STORE__,
  );
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
    () =>
      (globalThis as any).__PROMATCH_AUTH_STORE__?.getState().user?.role ===
      'admin',
  );
}

async function seedConflictScenario(api: APIRequestContext) {
  const cleanupTargets: string[] = [];
  const basePlayerId = uniqueId('PLYBASE');
  const baseRow = buildConflictRow({
    player_id: basePlayerId,
    name: `Conflict Dialog Base ${uniqueId('PLYNAME')}`,
    nickname: 'Dialog Base',
    country_name: 'USA',
    birth_date: new Date('1995-01-01T00:00:00Z').toISOString(),
    position: 'CM',
  });

  const baseIngestionId = await createIngestionBatch(api, [baseRow]);
  const baseStatus = await waitForIngestionStatus(api, baseIngestionId, /^success$/);
  if (baseStatus !== 'success') {
    throw new Error(`Baseline ingestion did not finish successfully: ${baseStatus}`);
  }
  cleanupTargets.push(`players/${baseRow.player_id}`);

  const conflictRow = buildConflictRow({
    name: baseRow.name,
    nickname: baseRow.nickname,
    country_name: baseRow.country_name,
    birth_date: baseRow.birth_date,
    position: 'CDM',
  });
  cleanupTargets.push(`players/${conflictRow.player_id}`);

  const ingestionId = await createIngestionBatch(api, [conflictRow]);
  const finalStatus = await waitForIngestionStatus(
    api,
    ingestionId,
    /^(conflicts|failed)$/,
  );

  if (finalStatus !== 'conflicts') {
    const batchDetailsResp = await api.get(`ingestions/${ingestionId}`);
    const batchDetails = await apiJson<{
      status: string;
      error_log: Array<{ row_index?: number; error: string }>;
    }>(batchDetailsResp);
    throw new Error(
      `Expected conflicts status but received ${batchDetails.status}: ${JSON.stringify(batchDetails.error_log)}`,
    );
  }

  const conflictItem = await getFirstConflictItem(api, ingestionId);

  return {
    cleanupTargets,
    ingestionId,
    conflictItem,
    seededPlayer: { player_id: baseRow.player_id, name: baseRow.name },
  };
}

test.describe('Admin ingestion conflict dialog', () => {
  test.describe.configure({ mode: 'serial' });

  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('allows admins to edit and accept conflicting ingestion items', async ({ page }) => {
    let cleanupTargets: string[] = [];

    try {
      const {
        ingestionId,
        conflictItem,
        seededPlayer,
        cleanupTargets: seededCleanup,
      } = await seedConflictScenario(api);
      cleanupTargets = seededCleanup;

      await page.goto(`/admin/ingestion/${ingestionId}`);
      await bootstrapAdmin(page);
      await page.waitForLoadState('networkidle');

      const conflictRowLocator = page.locator('tbody tr').first();
      await expect(conflictRowLocator).toBeVisible({ timeout: 30_000 });

      const reviewButton = page.getByRole('button', { name: /(Review|Revisar)/i }).first();
      await expect(reviewButton).toBeVisible({ timeout: 30_000 });
      await reviewButton.click();

      const dialog = page.getByTestId('conflict-review-dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId('conflict-diff-entry').first()).toBeVisible();

      await dialog.getByTestId('conflict-existing-record-toggle').click();
      await expect(dialog.getByTestId('conflict-existing-record')).toContainText(
        seededPlayer.player_id,
      );

      await dialog.getByTestId('conflict-edit-toggle').click();
      const positionInput = dialog.locator(
        '[data-testid="conflict-edit-field-input"][data-field-path="position"]',
      );
      await positionInput.fill('CM');
      await dialog.getByTestId('conflict-notes-input').fill(
        'Playwright resolved conflict with manual edit',
      );

      await dialog.getByTestId('conflict-accept-button').click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });

      await expect(
        conflictRowLocator.getByText(/(accepted|aceptado)/i),
      ).toBeVisible({ timeout: 30_000 });
    } finally {
      for (const target of cleanupTargets) {
        await cleanupResource(api, target).catch(() => {});
      }
    }
  });

  test('allows admins to reject conflicting ingestion items with notes', async ({ page }) => {
    let cleanupTargets: string[] = [];

    try {
      const {
        ingestionId,
        conflictItem,
        seededPlayer,
        cleanupTargets: seededCleanup,
      } = await seedConflictScenario(api);
      cleanupTargets = seededCleanup;

      await page.goto(`/admin/ingestion/${ingestionId}`);
      await bootstrapAdmin(page);
      await page.waitForLoadState('networkidle');

      const conflictRowLocator = page.locator('tbody tr').first();
      await expect(conflictRowLocator).toBeVisible({ timeout: 30_000 });

      const reviewButton = page.getByRole('button', { name: /(Review|Revisar)/i }).first();
      await expect(reviewButton).toBeVisible({ timeout: 30_000 });
      await reviewButton.click();

      const dialog = page.getByTestId('conflict-review-dialog');
      await expect(dialog).toBeVisible();

      await dialog.getByTestId('conflict-existing-record-toggle').click();
      await expect(dialog.getByTestId('conflict-existing-record')).toContainText(
        seededPlayer.player_id,
      );

      await dialog.getByTestId('conflict-reject-button').click();
      await expect(dialog.getByTestId('conflict-reject-panel')).toBeVisible();

      const confirmRejectButton = dialog.getByTestId('conflict-confirm-reject-button');
      await dialog.getByTestId('conflict-reject-reason').selectOption('other');
      await dialog.getByTestId('conflict-reject-notes').fill('Too short');
      await expect(confirmRejectButton).toBeDisabled();

      await dialog
        .getByTestId('conflict-reject-notes')
        .fill('Playwright rejects due to inconsistent source data');
      await expect(confirmRejectButton).toBeEnabled();

      await confirmRejectButton.click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });

      await expect(
        conflictRowLocator.getByText(/(rejected|rechazado)/i),
      ).toBeVisible({ timeout: 30_000 });

      await expect(
        page.getByRole('button', { name: /(Review|Revisar)/i }),
      ).toHaveCount(0);
    } finally {
      for (const target of cleanupTargets) {
        await cleanupResource(api, target).catch(() => {});
      }
    }
  });
});
