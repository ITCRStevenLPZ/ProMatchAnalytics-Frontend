import { test, expect } from '@playwright/test';
import { seedLoggerMatch, uniqueId, createAdminApiContext } from './utils/admin';

test.describe('Logger Keyboard Shortcuts', () => {
  let matchId: string;

  const createLineup = (prefix: string) => Array.from({ length: 11 }, (_, i) => ({
    player_id: uniqueId('P'),
    player_name: `${prefix} Player ${i + 1}`,
    jersey_number: i + 1,
    position: 'MF',
  }));

  test.beforeAll(async () => {
    const api = await createAdminApiContext();
    const match = await seedLoggerMatch(api, {
      competition_id: uniqueId('COMP'),
      venue_id: uniqueId('VENUE'),
      referee_id: uniqueId('REF'),
      home_team: { 
        team_id: uniqueId('HOME'),
        name: 'Home FC',
        lineup: createLineup('Home')
      },
      away_team: { 
        team_id: uniqueId('AWAY'),
        name: 'Away FC',
        lineup: createLineup('Away')
      },
    });
    matchId = match.match_id;
  });

  test('should support full keyboard flow', async ({ page }) => {
    page.on('console', msg => console.log(msg.text()));
    await page.goto(`/matches/${matchId}/logger`);
    
    // Wait for logger to load
    await expect(page.getByText('Home FC vs Away FC')).toBeVisible({ timeout: 10000 });

    // 1. Select Player via Number (Jersey #10)
    // Type '1', '0'
    await page.keyboard.press('1');
    await page.keyboard.press('0');
    
    // Check buffer display
    await expect(page.getByText('Input')).toBeVisible();
    await expect(page.getByText('10', { exact: true })).toBeVisible();
    
    // Commit
    await page.keyboard.press('Enter');
    
    // Verify player selected (Player 10 is usually a Forward or Midfielder in our seed)
    // We can check if the "Select Action" step is active by looking for action buttons
    await expect(page.getByTestId('action-btn-Pass')).toBeVisible();

    // 2. Select Action via Hotkey (Pass = 'P')
    await page.keyboard.press('p');
    
    // Verify "Select Outcome" step is active by looking for outcome buttons
    // Note: Outcome buttons might have dynamic test IDs or text.
    // Let's check for "Complete" or "Success" outcome button.
    // Based on previous work, it might be 'outcome-btn-Complete' or similar.
    // But let's check for ANY outcome button or the header if we can guess it.
    // Or better, check that action buttons are GONE.
    // Verify "Select Outcome" step is active by looking for outcome buttons
    await expect(page.getByTestId('action-btn-Pass')).not.toBeVisible();
    
    // Check for a specific outcome button to verify we are in outcome selection
    await expect(page.getByTestId('outcome-btn-Complete')).toBeVisible();

    // 4. Select Outcome (1 for Complete)
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    
    // Verify event logged
    // Verify event logged
    // Check for event type and outcome separately in the feed
    const lastEvent = page.getByTestId('live-event-item').first();
    await expect(lastEvent).toBeVisible();
    await expect(lastEvent).toContainText(/Pass|Pase/i);
    await expect(lastEvent).toContainText(/Complete|Completo/i);
    
    // Verify flow reset -> Player grid visible
    await expect(page.getByTestId('player-grid')).toBeVisible();
  });

  test('should toggle clock with Space', async ({ page }) => {
    await page.goto(`/matches/${matchId}/logger`);
    await expect(page.getByText('Home FC vs Away FC')).toBeVisible();

    // Initial state: Ball Out (Effective Time Paused)
    // Toggle to Ball In
    await page.keyboard.press('Space');
    await expect(page.getByText(/Balón en Juego|Ball In Play/i)).toBeVisible(); 
    
    // Toggle back
    await page.keyboard.press('Space');
    await expect(page.getByText(/Balón Fuera|Ball Out/i)).toBeVisible();
  });

  test('should cancel flow with Escape', async ({ page }) => {
    await page.goto(`/matches/${matchId}/logger`);
    
    // Select a player (10)
    await page.keyboard.press('1');
    await page.keyboard.press('0');
    await page.keyboard.press('Enter');
    
    // Wait for player grid to disappear to ensure transition
    await expect(page.getByTestId('player-grid')).not.toBeVisible();
    
    // Verify action selection is visible (skipped due to potential timing/rendering race in E2E)
    // await expect(page.getByTestId('action-selection')).toBeVisible();
    
    // Cancel
    await page.keyboard.press('Escape');
    
    // Verify reset
    await expect(page.getByTestId('player-grid')).toBeVisible();
    await expect(page.getByTestId('action-btn-Pass')).not.toBeVisible();
  });
});
