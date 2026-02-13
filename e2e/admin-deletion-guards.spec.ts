import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  addPlayerToTeam,
  cleanupResource,
  createAdminApiContext,
  seedPlayer,
  seedTeam,
  uniqueId,
} from "./utils/admin";

test.describe("Admin deletion guardrails", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("blocks deleting players/teams with dependencies until cleanup", async () => {
    const guardTeam = await seedTeam(api, {
      name: `Deletion Guard ${uniqueId("TEAM")}`,
      rosterTemplate: [],
    });

    const rosterPlayer = await seedPlayer(api, {
      name: `Guarded Player ${uniqueId("PLY")}`,
    });

    await addPlayerToTeam(api, guardTeam.team_id, {
      player_id: rosterPlayer.player_id,
      jersey_number: 77,
      position: "CM",
      is_active: true,
    });

    const guardedPlayerDelete = await api.delete(
      `admin/players/${rosterPlayer.player_id}`,
    );
    expect(guardedPlayerDelete.status()).toBe(400);
    const playerDetail = await guardedPlayerDelete.json();
    expect(String(playerDetail.detail)).toContain("team assignment");

    await cleanupResource(
      api,
      `teams/${guardTeam.team_id}/players/${rosterPlayer.player_id}`,
    );
    const deletePlayerResponse = await api.delete(
      `admin/players/${rosterPlayer.player_id}`,
    );
    expect(deletePlayerResponse.status()).toBe(200);

    const rosterHeavyTeam = await seedTeam(api, {
      name: `Block Delete ${uniqueId("TEAM")}`,
    });

    const guardedTeamDelete = await api.delete(
      `admin/teams/${rosterHeavyTeam.team_id}`,
    );
    expect(guardedTeamDelete.status()).toBe(400);
    const teamDetail = await guardedTeamDelete.json();
    expect(String(teamDetail.detail)).toContain("roster assignment");

    await Promise.all(
      rosterHeavyTeam.roster.map((entry) =>
        cleanupResource(
          api,
          `teams/${rosterHeavyTeam.team_id}/players/${entry.player_id}`,
        ),
      ),
    );

    const deleteTeamResponse = await api.delete(
      `admin/teams/${rosterHeavyTeam.team_id}`,
    );
    expect(deleteTeamResponse.status()).toBe(200);
  });
});
