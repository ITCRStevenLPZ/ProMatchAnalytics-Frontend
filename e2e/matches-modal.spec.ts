import { test, expect } from "@playwright/test";
import {
  createAdminApiContext,
  seedCompetition,
  seedVenue,
  seedReferee,
  seedTeam,
} from "./utils/admin";

test.describe("Matches Modal Selections", () => {
  test.beforeEach(async ({ page }) => {
    // Seed data to ensure dropdowns have content
    const api = await createAdminApiContext();

    // Seed resources
    await seedCompetition(api, { name: "Test Competition" });
    await seedVenue(api, { name: "Test Venue" });
    await seedReferee(api, { name: "Test Referee" });
    await seedTeam(api, { name: "Test Home Team", rosterTemplate: [] });
    await seedTeam(api, { name: "Test Away Team", rosterTemplate: [] });

    // Login as admin - Skipped in E2E mode as App.tsx handles it
    // await page.goto('/login');
    // await page.fill('input[type="email"]', 'admin@example.com');
    // await page.fill('input[type="password"]', 'admin123');
    // await page.click('button:has-text("Sign In")');
    // await page.waitForURL('/dashboard');

    // Just go to dashboard to ensure app is loaded
    await page.goto("/dashboard");
  });

  test("should populate dropdowns in create match modal", async ({ page }) => {
    page.on("console", (msg) => console.log(`BROWSER LOG: ${msg.text()}`));

    // Navigate to Matches
    await page.goto("/matches");
    console.log("Current URL:", page.url());
    await page.waitForSelector('[data-testid="create-match-btn"]');

    // Open Create Match modal
    await page.click('[data-testid="create-match-btn"]');
    await page.waitForSelector('[data-testid="modal-title"]');

    // Check Competitions dropdown
    const competitions = page.locator('[data-testid="competitions-select"]');
    // Wait for options to populate (excluding the default "Select...")
    await expect(competitions.locator("option")).not.toHaveCount(1);

    // Check Teams dropdowns
    const homeTeamSelect = page.locator('[data-testid="home-team-select"]');
    await expect(homeTeamSelect.locator("option")).not.toHaveCount(1);

    // Check Venues dropdown
    const venueSelect = page.locator('[data-testid="venue-select"]');
    await expect(venueSelect.locator("option")).not.toHaveCount(1);

    // Check Referee dropdown
    const refereeSelect = page.locator('[data-testid="referee-select"]');
    await expect(refereeSelect.locator("option")).not.toHaveCount(1);

    // Attempt selection
    await competitions.selectOption({ index: 1 });
    await homeTeamSelect.selectOption({ index: 1 });
    await venueSelect.selectOption({ index: 1 });
    await refereeSelect.selectOption({ index: 1 });
  });
});
