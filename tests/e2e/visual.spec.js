// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Reference screenshots of the main screens, for desktop and mobile (375 px).
// External fonts/icons are blocked, so icons are absent from these images on purpose.
// After an intended visual change: `npm run test:update`, then review the new images.

test.describe('Visual baseline', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('hub landing page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveScreenshot('hub.png', { fullPage: true });
  });

  test('chessdown main menu', async ({ page }) => {
    await page.goto('/chessdown/');
    await expect(page).toHaveScreenshot('chessdown-menu.png', { mask: [page.locator('#crowd')] }); // The crowd moves
  });

  test('chessdown draft screen', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.locator('#btn-start-local').click();
    await page.locator('.shop-item[data-type="k"]').click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await expect(page).toHaveScreenshot('chessdown-draft.png', { mask: [page.locator('#crowd')] });
  });

  test("ches'spell main menu", async ({ page }) => {
    await page.goto('/chesspell/');
    await expect(page).toHaveScreenshot('chesspell-menu.png');
  });

  test("ches'spell game board", async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    // The turn timer text changes every second.
    await expect(page).toHaveScreenshot('chesspell-board.png', { mask: [page.locator('#side-status')] });
  });
});
