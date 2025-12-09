import { randomUUID } from 'crypto';

import { expect, test, type APIRequestContext } from '@playwright/test';

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
  nationality?: string;
  position: string;
  i18n_names: Record<string, string>;
};

type BulkPlayerRow = PlayerIngestionRow & {
  height?: number;
  weight?: number;
};

type VenueIngestionRow = {
  venue_id: string;
  name: string;
  city: string;
  country_name: string;
  capacity: number;
  surface: string;
};

type RefereeIngestionRow = {
  referee_id: string;
  name: string;
  country_name: string;
  years_of_experience: number;
};

const buildPlayerIngestionRow = (
  overrides: Partial<PlayerIngestionRow> = {},
): PlayerIngestionRow => ({
  player_id: overrides.player_id ?? uniqueId('INGPLY'),
  name: overrides.name ?? `Ingestion Player ${Math.random().toString(16).slice(2, 6)}`,
  nickname: overrides.nickname ?? 'Playwright Ingested',
  birth_date:
    overrides.birth_date ?? new Date('1994-03-15T00:00:00Z').toISOString(),
  player_height: overrides.player_height ?? 183,
  player_weight: overrides.player_weight ?? 79,
  country_name: overrides.country_name ?? 'USA',
  position: overrides.position ?? 'CM',
  i18n_names: overrides.i18n_names ?? {},
});

const buildBulkPlayerRow = (
  overrides: Partial<BulkPlayerRow> = {},
): BulkPlayerRow => {
  const baseHeight = overrides.height ?? overrides.player_height ?? 182;
  const baseWeight = overrides.weight ?? overrides.player_weight ?? 76;
  const baseCountry = overrides.country_name ?? 'USA';

  return {
    player_id: overrides.player_id ?? uniqueId('BULKPLY'),
    name: overrides.name ?? `Bulk Player ${Math.random().toString(16).slice(2, 6)}`,
    nickname: overrides.nickname ?? 'BulkNick',
    birth_date:
      overrides.birth_date ?? new Date('1992-05-05T00:00:00Z').toISOString(),
    player_height: overrides.player_height ?? baseHeight,
    player_weight: overrides.player_weight ?? baseWeight,
    height: baseHeight,
    weight: baseWeight,
    country_name: baseCountry,
    nationality: overrides.nationality ?? baseCountry,
    position: overrides.position ?? 'CM',
    i18n_names: overrides.i18n_names ?? {},
  } as BulkPlayerRow;
};

const buildVenueIngestionRow = (
  overrides: Partial<VenueIngestionRow> = {},
): VenueIngestionRow => ({
  venue_id: overrides.venue_id ?? uniqueId('INGVEN'),
  name:
    overrides.name ?? `Ingestion Venue ${Math.random().toString(16).slice(2, 6)}`,
  city: overrides.city ?? 'Austin',
  country_name: overrides.country_name ?? 'USA',
  capacity: overrides.capacity ?? 22000,
  surface: overrides.surface ?? 'Grass',
});

const buildRefereeIngestionRow = (
  overrides: Partial<RefereeIngestionRow> = {},
): RefereeIngestionRow => ({
  referee_id: overrides.referee_id ?? uniqueId('INGREF'),
  name:
    overrides.name ?? `Ingestion Referee ${Math.random().toString(16).slice(2, 6)}`,
  country_name: overrides.country_name ?? 'USA',
  years_of_experience: overrides.years_of_experience ?? 6,
});

async function createIngestionBatch(
  api: APIRequestContext,
  targetModel: string,
  rows: Array<Record<string, unknown>>,
  batchName: string,
): Promise<string> {
  const response = await api.post('ingestions/', {
    data: {
      target_model: targetModel,
      data: rows,
      batch_name: batchName,
      metadata: { source: 'playwright-e2e' },
    },
  });
  const payload = await apiJson<{ ingestion_id: string }>(response);
  return payload.ingestion_id;
}

async function cleanupPaths(api: APIRequestContext, paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await cleanupResource(api, path);
    } catch (error) {
      console.warn('[ingestion-management] Cleanup skipped', path, error);
    }
  }
}

test.describe('Ingestion management flows', () => {
  test.describe.configure({ mode: 'serial' });

  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('deletes settled batches and blocks pending/conflict batches', async () => {
    const cleanupTargets: string[] = [];

    try {
      const refereeRows = [
        buildRefereeIngestionRow({ name: 'Delete Batch Referee Alpha' }),
        buildRefereeIngestionRow({ name: 'Delete Batch Referee Beta' }),
      ];
      cleanupTargets.push(
        ...refereeRows.map((row) => `referees/${row.referee_id}`),
      );

      const refereeBatchId = await createIngestionBatch(
        api,
        'referees',
        refereeRows,
        'Playwright Delete Referee Batch',
      );
      const refereeStatus = await waitForIngestionStatus(
        api,
        refereeBatchId,
        /^(success)$/,
      );
      expect(refereeStatus).toBe('success');

      const deleteResp = await api.delete(`ingestions/${refereeBatchId}`);
      expect(deleteResp.status()).toBe(200);
      const deletePayload = await apiJson<{ batches_deleted: number }>(deleteResp);
      expect(deletePayload.batches_deleted).toBe(1);

      const listResp = await api.get('ingestions?page=1&page_size=5&status=success');
      const listPayload = await apiJson<{
        batches: Array<{ ingestion_id: string }>;
      }>(listResp);
      expect(
        listPayload.batches.some((batch) => batch.ingestion_id === refereeBatchId),
      ).toBeFalsy();

      const basePlayerResp = await api.post('players/', {
        data: {
          player_id: uniqueId('DELBASE'),
          name: 'Delete Conflict Player',
          nickname: 'DeleteConf',
          birth_date: new Date('1994-03-02T00:00:00Z').toISOString(),
          player_height: 182,
          player_weight: 77,
          country_name: 'USA',
          position: 'CM',
          i18n_names: {},
        },
      });
      expect(basePlayerResp.status()).toBe(201);
      const basePlayerPayload = await apiJson<{ player_id: string }>(basePlayerResp);
      const basePlayerId = basePlayerPayload.player_id;
      cleanupTargets.push(`players/${basePlayerId}`);

      const conflictRows = [
        buildPlayerIngestionRow({
          name: 'Delete Conflict Player',
          country_name: 'USA',
          birth_date: new Date('1994-03-02T00:00:00Z').toISOString(),
          position: 'CM',
        }),
      ];
      cleanupTargets.push(
        ...conflictRows.map((row) => `players/${row.player_id}`),
      );

      const conflictBatchId = await createIngestionBatch(
        api,
        'players',
        conflictRows,
        'Playwright Delete Conflict Batch',
      );
      const conflictStatus = await waitForIngestionStatus(
        api,
        conflictBatchId,
        /^(conflicts)$/,
      );
      expect(conflictStatus).toBe('conflicts');

      const blockedResp = await api.delete(`ingestions/${conflictBatchId}`);
      expect(blockedResp.status()).toBe(400);
      cleanupTargets.push(`admin/cleanup/batch/${conflictBatchId}`);
    } finally {
      await cleanupPaths(api, cleanupTargets);
    }
  });

  test('paginates batches, filters items, and reprocesses conflicts', async () => {
    const cleanupTargets: string[] = [];

    try {
      const venueRows = [
        buildVenueIngestionRow({ name: 'Batch Venue Alpha', city: 'Austin' }),
        buildVenueIngestionRow({ name: 'Batch Venue Beta', city: 'Dallas' }),
        buildVenueIngestionRow({ name: 'Batch Venue Gamma', city: 'Houston' }),
      ];
      cleanupTargets.push(
        ...venueRows.map((row) => `venues/${row.venue_id}`),
      );

      const venueBatchId = await createIngestionBatch(
        api,
        'venues',
        venueRows,
        'Playwright Venue Success',
      );
      const successStatus = await waitForIngestionStatus(
        api,
        venueBatchId,
        /^(success)$/,
      );
      expect(successStatus).toBe('success');

      const baseConflictPlayers = [
        buildPlayerIngestionRow({
          player_id: uniqueId('BASEPA'),
          name: 'Conflict Target Alpha',
          country_name: 'Canada',
          position: 'CM',
          birth_date: new Date('1994-04-20T00:00:00Z').toISOString(),
        }),
        buildPlayerIngestionRow({
          player_id: uniqueId('BASEPB'),
          name: 'Conflict Target Beta',
          country_name: 'Mexico',
          position: 'ST',
          birth_date: new Date('1992-09-12T00:00:00Z').toISOString(),
        }),
      ];
      for (const existing of baseConflictPlayers) {
        const resp = await api.post('players/', { data: existing });
        expect(resp.status()).toBe(201);
        cleanupTargets.push(`players/${existing.player_id}`);
      }

      const conflictRows = [
        buildPlayerIngestionRow({
          name: baseConflictPlayers[0].name,
          country_name: baseConflictPlayers[0].country_name,
          birth_date: baseConflictPlayers[0].birth_date,
          position: 'CDM',
          nickname: 'Alpha Shadow',
        }),
        buildPlayerIngestionRow({
          name: baseConflictPlayers[1].name,
          country_name: baseConflictPlayers[1].country_name,
          birth_date: baseConflictPlayers[1].birth_date,
          position: 'CF',
          nickname: 'Beta Shadow',
        }),
      ];
      cleanupTargets.push(
        ...conflictRows.map((row) => `players/${row.player_id}`),
      );

      const conflictBatchId = await createIngestionBatch(
        api,
        'players',
        conflictRows,
        'Playwright Conflict Batch',
      );
      const conflictStatus = await waitForIngestionStatus(
        api,
        conflictBatchId,
        /^(conflicts)$/,
      );
      expect(conflictStatus).toBe('conflicts');

      const successListResp = await api.get(
        'ingestions?page=1&page_size=10&target_model=venues&status=success',
      );
      const successList = await apiJson<{
        batches: Array<{ ingestion_id: string }>;
      }>(successListResp);
      expect(
        successList.batches.some(
          (batch) => batch.ingestion_id === venueBatchId,
        ),
      ).toBeTruthy();

      const conflictListResp = await api.get(
        'ingestions?page=1&page_size=10&target_model=players&status=conflicts',
      );
      const conflictList = await apiJson<{
        batches: Array<{ ingestion_id: string }>;
      }>(conflictListResp);
      expect(
        conflictList.batches.some(
          (batch) => batch.ingestion_id === conflictBatchId,
        ),
      ).toBeTruthy();

      const paginatedItemsResp = await api.get(
        `ingestions/${venueBatchId}/items?page=1&page_size=2`,
      );
      const paginatedItems = await apiJson<{ items: any[]; total: number }>(
        paginatedItemsResp,
      );
      expect(paginatedItems.total).toBe(venueRows.length);
      expect(paginatedItems.items.length).toBe(2);

      const conflictItemsResp = await api.get(
        `ingestions/${conflictBatchId}/items?page=1&page_size=10&status_filter=conflict_open`,
      );
      const conflictItems = await apiJson<{ items: any[]; total: number }>(
        conflictItemsResp,
      );
      expect(conflictItems.total).toBeGreaterThanOrEqual(1);
      expect(
        conflictItems.items.some((item) =>
          conflictRows.some(
            (row) => item.raw_payload?.name === row.name,
          ),
        ),
      ).toBeTruthy();

      const reprocessResp = await api.post(
        `ingestions/${conflictBatchId}/reprocess`,
      );
      const reprocessPayload = await apiJson<{ total_items: number }>(
        reprocessResp,
      );
      expect(reprocessPayload.total_items).toBe(conflictRows.length);

      const conflictsListResp = await api.get(
        'ingestions/conflicts/list?target_model=players&page=1&page_size=10',
      );
      const conflictsList = await apiJson<{ conflicts: any[]; total: number }>(
        conflictsListResp,
      );
      expect(conflictsList.total).toBeGreaterThanOrEqual(conflictRows.length);

      const invalidFilterResp = await api.get(
        'ingestions/conflicts/list?status=bogus',
      );
      expect(invalidFilterResp.status()).toBe(400);
    } finally {
      await cleanupPaths(api, cleanupTargets);
    }
  });

  test('accepts JSON bulk uploads and rejects malformed CSV', async () => {
    const cleanupTargets: string[] = [];

    try {
      const competitionId = uniqueId('BULKCOMP');
      const venueId = uniqueId('BULKVEN');
      const refereeId = uniqueId('BULKREF');
      const playerRow = buildBulkPlayerRow({
        player_id: uniqueId('BULKPLY'),
        country_name: 'USA',
        position: 'CM',
      });
      const teamId = uniqueId('BULKTEAM');

      const bulkPayload = {
        competitions: [
          {
            competition_id: competitionId,
            name: `Bulk Competition ${competitionId}`,
            country_name: 'USA',
            gender: 'male',
          },
        ],
        venues: [
          {
            venue_id: venueId,
            name: `Bulk Venue ${venueId}`,
            city: 'Austin',
            country_name: 'USA',
            capacity: 25000,
            surface: 'Grass',
          },
        ],
        referees: [
          {
            referee_id: refereeId,
            name: `Bulk Referee ${refereeId}`,
            country_name: 'USA',
            years_of_experience: 6,
          },
        ],
        players: [playerRow],
        teams: [
          {
            team_id: teamId,
            name: `Bulk Team ${teamId}`,
            short_name: teamId.slice(0, 3),
            gender: 'male',
            country: 'USA',
            country_name: 'USA',
            founded_year: 2010,
          },
        ],
      };

      const bulkResponse = await api.post('ingestions/bulk', {
        data: {
          format: 'json',
          data: bulkPayload,
          metadata: { source: 'playwright-e2e' },
        },
      });
      const bulkResult = await apiJson<{
        bulk_id: string;
        batch_ids: Record<string, string>;
        sections: Record<string, number>;
      }>(bulkResponse);

      expect(Object.keys(bulkResult.batch_ids).length).toBeGreaterThanOrEqual(3);

      for (const [model, batchId] of Object.entries(bulkResult.batch_ids)) {
        const status = await waitForIngestionStatus(api, batchId);
        expect(['success', 'conflicts']).toContain(status);
        console.log(`[ingestion-management] Bulk batch ${model} settled as ${status}`);
      }

      const bulkStatusResp = await api.get(
        `ingestions/bulk/${bulkResult.bulk_id}`,
      );
      const bulkStatus = await apiJson<{
        status: string;
        sections: Record<string, number>;
        batch_statuses: Record<string, { status: string }>;
      }>(bulkStatusResp);
      expect(['success', 'conflicts', 'in_progress']).toContain(
        bulkStatus.status,
      );
      expect(bulkStatus.sections.players).toBe(1);
      expect(
        ['success', 'conflicts'].includes(
          bulkStatus.batch_statuses.players.status,
        ),
      ).toBeTruthy();

      cleanupTargets.push(
        `competitions/${competitionId}`,
        `venues/${venueId}`,
        `referees/${refereeId}`,
        `teams/${teamId}`,
        `players/${playerRow.player_id}`,
      );

      const invalidCsvResponse = await api.post('ingestions/bulk', {
        data: { format: 'csv' },
      });
      expect(invalidCsvResponse.status()).toBe(400);
    } finally {
      await cleanupPaths(api, cleanupTargets);
    }
  });

  test('handles conflict pagination stress and surfaces metrics', async () => {
    test.setTimeout(120000);
    const cleanupTargets: string[] = [];

    try {
      const purgeExistingConflictSeeds = async () => {
        let page = 1;
        const pageSize = 100;
        while (true) {
          const resp = await api.get(
            `players?page=${page}&page_size=${pageSize}&search=${encodeURIComponent('Conflict Seed')}`,
          );
          const payload = await apiJson<{
            items: Array<{ player_id: string; name: string }>;
            total_pages: number;
          }>(resp);
          const seeds = payload.items.filter((player) =>
            player.name?.startsWith('Conflict Seed'),
          );
          for (const seed of seeds) {
            await cleanupResource(api, `players/${seed.player_id}`);
          }
          if (page >= payload.total_pages) {
            break;
          }
          page += 1;
        }
      };

      await purgeExistingConflictSeeds();

      const basePayloads: PlayerIngestionRow[] = [];
      const conflictTargets = 60;
      const seedRunTag = uniqueId('CNFLCTRUN');

      for (let idx = 0; idx < conflictTargets; idx += 1) {
        const uniqueCountry = randomUUID();
        const uniqueBirthDate = new Date(Date.now() - idx * 86400000).toISOString();
        const uniqueNameToken = randomUUID();
        const payload = buildPlayerIngestionRow({
          player_id: uniqueId('BASEPLY'),
          name: `Conflict Seed ${seedRunTag}-${uniqueNameToken}`,
          nickname: `Seed${idx}`,
          birth_date: uniqueBirthDate,
          country_name: uniqueCountry,
          position: idx % 3 === 0 ? 'CM' : 'ST',
        });
        basePayloads.push(payload);
      }

      cleanupTargets.push(
        ...basePayloads.map((payload) => `players/${payload.player_id}`),
      );
      const baselineBatchId = await createIngestionBatch(
        api,
        'players',
        basePayloads,
        'Conflict Baseline Seed',
      );
      const baselineStatus = await waitForIngestionStatus(api, baselineBatchId, /^(success)$/);
      expect(baselineStatus).toBe('success');
      const seededPlayersResp = await api.get(
        `players?page=1&page_size=${conflictTargets}&search=${encodeURIComponent(seedRunTag)}`,
      );
      const seededPlayers = await apiJson<{ total: number }>(seededPlayersResp);
      expect(seededPlayers.total).toBe(conflictTargets);

      const conflictRows = basePayloads.map((base, index) => {
        const conflictPosition = base.position === 'CM' ? 'CDM' : 'CF';
        return buildPlayerIngestionRow({
          player_id: uniqueId('CNFLCT'),
          name: base.name,
          nickname: `ConflictRow${index}`,
          birth_date: base.birth_date,
          country_name: base.country_name,
          position: conflictPosition,
          player_height: base.player_height + 1,
        });
      });

      const conflictBatchId = await createIngestionBatch(
        api,
        'players',
        conflictRows,
        'Conflict Stress Batch',
      );
      const conflictStatus = await waitForIngestionStatus(
        api,
        conflictBatchId,
        /^(conflicts)$/,
      );
      expect(conflictStatus).toBe('conflicts');

      const pageSize = 25;
      const fetchConflictsPage = async (page: number) => {
        const resp = await api.get(
          `ingestions/conflicts/list?target_model=players&page=${page}&page_size=${pageSize}`,
        );
        expect(resp.status()).toBe(200);
        return apiJson<{ conflicts: any[]; total: number }>(resp);
      };

      const firstPage = await fetchConflictsPage(1);
      const secondPage = await fetchConflictsPage(2);
      const thirdPage = await fetchConflictsPage(3);

      expect(firstPage.total).toBeGreaterThanOrEqual(conflictRows.length);
      expect(firstPage.conflicts).toHaveLength(pageSize);
      expect(secondPage.conflicts).toHaveLength(pageSize);
      expect(thirdPage.conflicts.length).toBeGreaterThan(0);

      const firstPageIds = new Set(firstPage.conflicts.map((conflict) => conflict.conflict_id));
      const overlap = secondPage.conflicts.some((conflict) => firstPageIds.has(conflict.conflict_id));
      expect(overlap).toBeFalsy();

      const firstPageNewest = Date.parse(firstPage.conflicts[0].created_at);
      const firstPageOldest = Date.parse(
        firstPage.conflicts[firstPage.conflicts.length - 1].created_at,
      );
      expect(firstPageNewest).toBeGreaterThanOrEqual(firstPageOldest);
      const secondPageNewest = Date.parse(secondPage.conflicts[0].created_at);
      expect(firstPageOldest).toBeGreaterThanOrEqual(secondPageNewest);

      const openConflictsResp = await api.get(
        'ingestions/conflicts/list?target_model=players&status=open&page=1&page_size=10',
      );
      expect(openConflictsResp.status()).toBe(200);
      const openConflicts = await apiJson<{ conflicts: any[]; total: number }>(openConflictsResp);
      expect(openConflicts.total).toBeGreaterThan(0);

      const metricsResponse = await api.get('debug/metrics');
      expect(metricsResponse.status()).toBe(200);
      const metricsBody = await metricsResponse.text();
      expect(metricsBody).toContain('match_event_duplicates_total');
    } finally {
      await cleanupPaths(api, cleanupTargets);
    }
  });
});
