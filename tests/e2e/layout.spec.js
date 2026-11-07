// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// No page may scroll sideways, and key elements must sit inside the screen,
// especially at phone width (375 px in the mobile project).

/**
 * Elements (not fixed, not hidden) whose box sticks out of the viewport, or out of
 * `frame` when given (a container that clips its content, like #game-board).
 */
function outOfScreen(page, selector, frame = null) {
  return page.evaluate(([sel, frameSel]) => {
    const f = frameSel ? document.querySelector(frameSel).getBoundingClientRect() : { left: 0, right: innerWidth };
    return [...document.querySelectorAll(sel)]
      .filter((el) => el.getClientRects().length && getComputedStyle(el).position !== 'fixed')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.left < f.left - 1 || r.right > f.right + 1)
      .map((r) => `${Math.round(r.left)}..${Math.round(r.right)}`);
  }, [selector, frame]);
}

test.describe('Layout', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  for (const url of ['/', '/chessdown/', '/chesspell/']) {
    test(`${url} does not scroll sideways`, async ({ page }) => {
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
      expect(await outOfScreen(page, 'h1, h2, .btn, button:not(.btn-info)')).toEqual([]);
    });
  }

  // Before the web fonts arrive (slow network) or if they fail, fallback fonts are wider.
  for (const url of ['/', '/chessdown/', '/chesspell/']) {
    test(`${url} does not scroll sideways with fallback fonts`, async ({ page }) => {
      await page.route('**/assets/fonts/*.woff2', (route) => route.abort());
      await page.goto(url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    });
  }

  test("ches'spell game screen fits: board, spell cards, banners", async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
    expect(await outOfScreen(page, '#chessboard, .in-game-card, .player-banner', '#game-board')).toEqual([]);
  });
});
