// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, readGlobal } = require('./helpers');

// Everything must work without a mouse (WCAG 2.1.1): menu buttons, the draft shop,
// the colour swatches and the board, which is one tab stop navigated with arrows.

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} vr
 * @param {number} vc
 */
const square = (page, vr, vc) => page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`);

/** Press Enter on an element reached by keyboard focus. */
async function activate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

/** Buy a piece and place it, keyboard only. */
async function place(page, type, vr, vc) {
  await activate(page.locator(`.shop-item[data-type="${type}"]`));
  await activate(square(page, vr, vc));
  await expect(square(page, vr, vc)).toHaveClass(/has-piece/);
}

test.describe('Keyboard: Chessdown', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
  });

  test('menu buttons work with Enter and Space', async ({ page }) => {
    await activate(page.locator('#btn-how-to-play'));
    await expect(page.locator('#rules-modal')).toBeVisible();
    await page.locator('#btn-close-rules').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#main-menu')).toBeVisible();
    await activate(page.locator('#btn-start-local'));
    await expect.poll(() => readGlobal(page, 'gameState')).toBe('draft1');
  });

  test('the board is one tab stop, navigated with arrow keys, and squares say what they hold', async ({ page }) => {
    await activate(page.locator('#btn-start-local'));
    await place(page, 'k', 5, 4);
    // Only one square is in the tab order.
    expect(await page.locator('#chessboard .square[tabindex="0"]').count()).toBe(1);
    await square(page, 5, 4).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(square(page, 5, 3)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(square(page, 4, 3)).toBeFocused();
    await expect(square(page, 5, 4)).toHaveAttribute('aria-label', /king/i);
    await expect(square(page, 4, 3)).toHaveAttribute('aria-label', /empty/i);
  });

  test('a whole local game can be played without a mouse', async ({ page }) => {
    await activate(page.locator('#btn-start-local'));
    await place(page, 'k', 5, 4);
    await place(page, 'r', 3, 3);
    await activate(page.locator('.color-swatch[data-color="green"]'));
    await expect.poll(() => page.evaluate(() => playerColors[1])).toBe('green');
    await activate(page.locator('#btn-validate-draft'));

    await activate(page.locator('#btn-ready'));
    await place(page, 'k', 5, 4);
    await place(page, 'r', 3, 3);
    await activate(page.locator('#btn-validate-draft'));

    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const starter = await readGlobal(page, 'currentPlayer');
    const [from, to] = starter === 1 ? [[9, 3], [0, 3]] : [[2, 4], [11, 4]];
    await activate(square(page, ...from));
    await expect(square(page, ...to)).toHaveAttribute('aria-label', /can move here/i);
    await activate(square(page, ...to));
    await expect(page.locator('#victory-title')).toHaveText('Victory!');
  });
});
