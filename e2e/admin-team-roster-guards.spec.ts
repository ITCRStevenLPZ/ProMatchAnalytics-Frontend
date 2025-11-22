import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  apiJson,
  cleanupResource,
  createAdminApiContext,
  seedTeam,
  uniqueId,
} from './utils/admin';

test.describe('Admin team roster guardrails', () => {
  test.describe.configure({ mode: 'serial' });
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test('team suggestions, roster toggles, duplicate guards, and deletion constraints', async () => {
    const primaryTeam = await seedTeam(api, {
      name: `Roster Guard ${uniqueId('TEAM')}`,
    });

    const opponentTeam = await seedTeam(api, {
      name: `Roster Guard Opp ${uniqueId('TEAM')}`,
    });

    const suggestionsResponse = await api.get(
      `teams/search/suggestions?q=${encodeURIComponent(primaryTeam.name)}`,
    );
    const suggestions = await apiJson<Array<{ team_id: string }>>(suggestionsResponse);
    expect(suggestions.some((team) => team.team_id === primaryTeam.team_id)).toBeTruthy();

    const toggledPlayer = primaryTeam.roster[0];
    const reactivatedPlayer = primaryTeam.roster[1];

    const deactivateResponse = await api.put(
      `teams/${primaryTeam.team_id}/players/${toggledPlayer.player_id}`,
      { data: { is_active: false } },
    );
    expect(deactivateResponse.status()).toBe(200);

    const inactiveRosterResponse = await api.get(
      `teams/${primaryTeam.team_id}/players?page=1&page_size=20&is_active=false`,
    );
    const inactiveRoster = await apiJson<{ items: Array<{ player_id: string }> }>(inactiveRosterResponse);
    expect(inactiveRoster.items.some((entry) => entry.player_id === toggledPlayer.player_id)).toBeTruthy();

    const activeRosterResponse = await api.get(
      `teams/${primaryTeam.team_id}/players?page=1&page_size=20&is_active=true`,
    );
    const activeRoster = await apiJson<{ items: Array<{ player_id: string }> }>(activeRosterResponse);
    expect(activeRoster.items.some((entry) => entry.player_id === toggledPlayer.player_id)).toBeFalsy();

    // Reactivate player to leave roster consistent for downstream tests.
    const reactivateResponse = await api.put(
      `teams/${primaryTeam.team_id}/players/${toggledPlayer.player_id}`,
      { data: { is_active: true } },
    );
    expect(reactivateResponse.status()).toBe(200);

    const duplicateAddResponse = await api.post(`teams/${primaryTeam.team_id}/players`, {
      data: {
        team_id: primaryTeam.team_id,
        player_id: reactivatedPlayer.player_id,
        jersey_number: reactivatedPlayer.jersey_number + 30,
        position: reactivatedPlayer.position,
        is_active: true,
      },
    });
    expect(duplicateAddResponse.status()).toBe(400);
    const duplicatePayload = await duplicateAddResponse.json();
    expect(String(duplicatePayload.detail)).toContain('already in team');

    const guardedDeleteResponse = await api.delete(`admin/teams/${primaryTeam.team_id}`);
    expect(guardedDeleteResponse.status()).toBe(400);
    const deleteDetail = await guardedDeleteResponse.json();
    expect(String(deleteDetail.detail)).toContain('roster assignment');

    const removeRoster = async (teamId: string, roster: typeof primaryTeam.roster) => {
      await Promise.all(
        roster.map((entry) =>
          cleanupResource(api, `teams/${teamId}/players/${entry.player_id}`),
        ),
      );
    };

    await removeRoster(primaryTeam.team_id, primaryTeam.roster);
    await removeRoster(opponentTeam.team_id, opponentTeam.roster);

    const deletePrimaryResponse = await api.delete(`admin/teams/${primaryTeam.team_id}`);
    expect(deletePrimaryResponse.status()).toBe(200);
    const deleteOpponentResponse = await api.delete(`admin/teams/${opponentTeam.team_id}`);
    expect(deleteOpponentResponse.status()).toBe(200);
  });
});
