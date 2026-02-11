import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  createAdminApiContext,
  rosterToMatchLineup,
  seedCompetition,
  seedReferee,
  seedTeam,
  seedVenue,
  uniqueId,
} from "./utils/admin";

test.describe("Admin match CRUD + status transitions", () => {
  let api: APIRequestContext;

  test.beforeAll(async () => {
    api = await createAdminApiContext();
  });

  test.afterAll(async () => {
    await api?.dispose();
  });

  test("creates match, walks statuses, and verifies viewer parity", async ({
    page,
  }) => {
    const { competition_id } = await seedCompetition(api, {
      name: "Match Spec Cup",
    });
    const { venue_id } = await seedVenue(api, { name: "Match Spec Arena" });
    const { referee_id } = await seedReferee(api, { name: "Spec Ref" });
    const homeTeam = await seedTeam(api, {
      name: `Match Spec Home ${uniqueId("TEAM")}`,
    });
    const awayTeam = await seedTeam(api, {
      name: `Match Spec Away ${uniqueId("TEAM")}`,
    });

    const matchId = uniqueId("MATCH");
    const now = new Date();
    const matchPayload = {
      match_id: matchId,
      match_date: now.toISOString(),
      kick_off: new Date(now.getTime() + 5 * 60_000).toISOString(),
      competition_id,
      season_name: `${now.getUTCFullYear()}/${now.getUTCFullYear() + 1}`,
      competition_stage: "Friendly",
      home_team: {
        team_id: homeTeam.team_id,
        name: homeTeam.name,
        manager: "Home Manager",
        score: 0,
        lineup: rosterToMatchLineup(homeTeam.roster),
      },
      away_team: {
        team_id: awayTeam.team_id,
        name: awayTeam.name,
        manager: "Away Manager",
        score: 0,
        lineup: rosterToMatchLineup(awayTeam.roster),
      },
      venue: {
        venue_id,
        name: "Match Spec Arena",
      },
      referee: {
        referee_id,
        name: "Spec Ref",
      },
      status: "Pending",
    };

    const createResponse = await api.post("logger/matches", {
      data: matchPayload,
    });
    const createStatus = createResponse.status();
    const createBody = await createResponse.text();
    if (![200, 201].includes(createStatus)) {
      throw new Error(
        `Failed to create match (${createStatus}): ${createBody}`,
      );
    }
    const createdMatch = JSON.parse(createBody);
    expect(createdMatch.match_id).toBe(matchId);
    expect(createdMatch.status).toBe("Pending");

    const invalidTransition = await api.patch(
      `logger/matches/${matchId}/status`,
      {
        data: { status: "Fulltime" },
      },
    );
    expect(invalidTransition.status()).toBe(400);

    const transitions = [
      "Live_First_Half",
      "Halftime",
      "Live_Second_Half",
      "Fulltime",
    ];

    for (const status of transitions) {
      const response = await api.patch(`logger/matches/${matchId}/status`, {
        data: { status },
      });
      const responseBody = await response.text();
      expect(response.status()).toBe(200);
      const payload = JSON.parse(responseBody);
      expect(payload.status).toBe(status);
    }

    const statsResponse = await api.get(`logger/matches/${matchId}/stats`);
    const statsBody = await statsResponse.text();
    expect(statsResponse.status()).toBe(200);
    const stats = JSON.parse(statsBody);
    expect(stats.home_team.team_id).toBe(homeTeam.team_id);
    expect(stats.away_team.team_id).toBe(awayTeam.team_id);

    const eventsResponse = await api.get(
      `logger/matches/${matchId}/events?page=1&page_size=10`,
    );
    const eventsBody = await eventsResponse.text();
    expect(eventsResponse.status()).toBe(200);
    const eventsPayload = JSON.parse(eventsBody);
    const items = Array.isArray(eventsPayload)
      ? eventsPayload
      : eventsPayload.items;
    expect(Array.isArray(items)).toBeTruthy();
    const hasEvents = Array.isArray(items) && items.length > 0;

    await page.goto(`/matches/${matchId}/live`);
    await expect(page.getByText(`Match ID: ${matchId}`)).toBeVisible();
    if (hasEvents) {
      await expect(page.getByTestId("viewer-event-item").first()).toBeVisible();
    } else {
      await expect(page.getByText("No events logged yet.")).toBeVisible();
    }
  });
});
