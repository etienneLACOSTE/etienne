// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// The hub's "Watch Demo" links start a scripted tutorial in each game.

test.describe('Demo mode', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('chessdown demo runs without errors', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/?demo=true');
    await expect(page.locator('#chessboard .square').first()).toBeVisible();
    await page.waitForTimeout(3_000); // Let the scripted steps play
    expect(errors).toEqual([]);
  });

  test("ches'spell demo runs without errors", async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/?demo=true&v=2');
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await page.waitForTimeout(3_000);
    expect(errors).toEqual([]);
  });
});
