import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  addPlayerToTeam,
  apiJson,
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
  uniqueId,
} from './utils/admin';

const DEFAULT_COUNTRY = 'USA';

const createTeamPayload = (teamId: string, name: string) => ({
  team_id: teamId,
  name,
  short_name: teamId.slice(0, 6),
  gender: 'male',
  country_name: DEFAULT_COUNTRY,
  managers: [],
  technical_staff: [],
  i18n_names: {},
});

test.describe('Admin roster inline error surfacing', () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('shows inline error banner + field message when jersey conflicts occur', async ({ page }) => {
    page.on('console', (msg) => {
      console.log('[browser]', msg.type(), msg.text());
    });
    const teamId = uniqueId('TEAM');
    const teamName = `Roster Inline ${teamId}`;
    const conflictingJersey = 7;
    let rosterPlayerId: string | null = null;
    let candidatePlayerId: string | null = null;

    try {
      const createTeamResponse = await api.post('teams/', {
        data: createTeamPayload(teamId, teamName),
      });
      await apiJson(createTeamResponse);

      const rosterPlayer = await seedPlayer(api, {
        name: `Roster Existing ${uniqueId('PLY')}`,
        position: 'CM',
      });
      rosterPlayerId = rosterPlayer.player_id;
      await addPlayerToTeam(api, teamId, {
        player_id: rosterPlayer.player_id,
        jersey_number: conflictingJersey,
        position: 'CM',
        is_active: true,
      });

      const candidatePlayer = await seedPlayer(api, {
        name: `Roster Candidate ${uniqueId('PLY')}`,
        position: 'ST',
      });
      candidatePlayerId = candidatePlayer.player_id;

      await page.goto('/teams');
      const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();
      await searchInput.fill(teamName);
      await expect(page.getByRole('cell', { name: teamName, exact: true })).toBeVisible();

      const rosterButton = page
        .locator('tr', { hasText: teamName })
        .locator('button[title="Roster"], button[title="Plantel"]')
        .first();
      await rosterButton.click();

      const rosterForm = page
        .locator('form')
        .filter({ has: page.getByRole('button', { name: /Add to Roster|Agregar al Plantel/i }) })
        .first();

      await expect(rosterForm).toBeVisible();

      await rosterForm.locator('select').first().selectOption(candidatePlayer.player_id);
      await rosterForm.locator('input[type="number"]').fill(String(conflictingJersey));
      await page.getByRole('button', { name: /Add to Roster|Agregar al Plantel/i }).click();

      const rosterFormText = await rosterForm.textContent();
      console.log('[roster-inline-errors] form text after submit:', rosterFormText);

      await expect(
        page.getByText(`Jersey number ${conflictingJersey} already taken`),
      ).toBeVisible();
      await expect(
        page.getByText(/Please fix all validation errors before submitting|Por favor, corrija todos los errores de validación antes de enviar/i),
      ).toBeVisible();
    } finally {
      if (rosterPlayerId) {
        await cleanupResource(api, `teams/${teamId}/players/${rosterPlayerId}`).catch(() => {});
        await cleanupResource(api, `players/${rosterPlayerId}`).catch(() => {});
      }
      if (candidatePlayerId) {
        await cleanupResource(api, `players/${candidatePlayerId}`).catch(() => {});
      }
      await cleanupResource(api, `teams/${teamId}`).catch(() => {});
    }
  });
});
