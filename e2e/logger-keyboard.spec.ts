import { test, expect } from '@playwright/test';
import { gotoLoggerPage, MATCH_ID } from './utils/logger';

test.describe('Logger Keyboard Shortcuts', () => {

  test('should support full keyboard flow', async ({ page }) => {
    page.on('console', msg => console.log(msg.text()));
    await gotoLoggerPage(page, MATCH_ID);

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
    await gotoLoggerPage(page, MATCH_ID);

    // Initial state: Ball Out (Effective Time Paused)
    // Toggle to Ball In
    await page.keyboard.press('Space');
    await expect(page.getByText(/Balón en Juego|Ball In Play/i)).toBeVisible(); 
    
    // Toggle back
    await page.keyboard.press('Space');
    await expect(page.getByText(/Balón Fuera|Ball Out/i)).toBeVisible();
  });

  test('should cancel flow with Escape', async ({ page }) => {
    await gotoLoggerPage(page, MATCH_ID);
    
    // Select a player via click to ensure flow progression
    const playerCard = page.getByTestId('player-card-HOME-1');
    await expect(playerCard).toBeVisible({ timeout: 5000 });
    await playerCard.click();

    // Wait for action buttons to appear to confirm flow advanced
    await expect(page.getByTestId('action-btn-Pass')).toBeVisible({ timeout: 5000 });
    
    // Cancel
    await page.keyboard.press('Escape');
    
    // Verify reset
    await expect(page.getByTestId('player-grid')).toBeVisible();
    await expect(page.getByTestId('action-btn-Pass')).not.toBeVisible();
  });
});
