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

test.describe("Keyboard: Ches'spell", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chesspell/');
  });

  /** Board square by board coordinates (r = 0 is rank 8). */
  const cell = (page, r, c) => page.locator(`#chessboard .square[data-r="${r}"][data-c="${c}"]`);

  /** Select a piece then its destination, keyboard only. */
  async function keyMove(page, from, to) {
    await activate(cell(page, ...from));
    await expect(cell(page, ...to)).toHaveAttribute('aria-label', /can (move here|capture)/);
    await activate(cell(page, ...to));
  }

  test('draft, a spell and a king capture, without a mouse', async ({ page }) => {
    await activate(page.getByRole('button', { name: 'Local Game' }));
    await activate(page.getByRole('button', { name: 'Play Draft Mode' }));
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await activate(page.locator(`#draft-grid .spell-card[data-id="${id}"]`));
      await activate(page.locator('#modal-confirm'));
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await expect(cell(page, 7, 4)).toHaveAttribute('aria-label', 'e1: white king');

    // Board navigation: one tab stop, arrows move the focus.
    expect(await page.locator('#chessboard .square[tabindex="0"]').count()).toBe(1);
    await cell(page, 7, 0).focus();
    await page.keyboard.press('ArrowUp');
    await expect(cell(page, 6, 0)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(cell(page, 6, 1)).toBeFocused();

    // Wall on a4 with the keyboard.
    await activate(page.locator('#player1-cards .in-game-card[data-card-id="8"]'));
    await activate(page.locator('#modal-confirm'));
    await activate(cell(page, 4, 0));
    await expect(cell(page, 4, 0)).toHaveAttribute('aria-label', 'a4: wall');

    await keyMove(page, [1, 4], [3, 4]); // e5
    await keyMove(page, [6, 5], [5, 5]); // f3
    await keyMove(page, [1, 0], [2, 0]); // a6
    await keyMove(page, [6, 6], [4, 6]); // g4
    await keyMove(page, [0, 3], [4, 7]); // Qh4
    await keyMove(page, [6, 1], [5, 1]); // b3
    const gameOver = page.waitForEvent('dialog');
    await keyMove(page, [4, 7], [7, 4]); // Qxe1
    const dialog = await gameOver;
    expect(dialog.message()).toBe('Game Over! Black wins!');
    await dialog.accept();
  });
});

test.describe("Keyboard: Ches'spell dialogs", () => {
  test('dialogs take the focus, keep it inside, close with Escape and give it back', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chesspell/');
    await activate(page.getByRole('button', { name: 'Local Game' }));
    await activate(page.getByRole('button', { name: 'Play Draft Mode' }));

    const card = page.locator('#draft-grid .spell-card[data-id="8"]');
    await activate(card);
    const dialog = page.getByRole('dialog', { name: 'Wall' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#modal-confirm')).toBeFocused();
    // Tab cycles inside the dialog.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.getElementById('card-modal').contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(card).toBeFocused();

    // The info dialog too.
    await activate(card.locator('.btn-info'));
    const info = page.getByRole('dialog', { name: 'Wall' });
    await expect(info).toBeVisible();
    await expect(page.locator('#info-modal-close')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(info).toBeHidden();
  });
});

test.describe('Keyboard: screen changes', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  const focusInside = (page, id) => page.evaluate((i) => document.getElementById(i).contains(document.activeElement), id);

  test("ches'spell: the focus follows to the new screen", async ({ page }) => {
    await page.goto('/chesspell/');
    await activate(page.getByRole('button', { name: 'Card Index' }));
    await expect.poll(() => focusInside(page, 'card-index')).toBe(true);
    await page.keyboard.press('Tab');
    await expect.poll(() => focusInside(page, 'card-index')).toBe(true);
  });

  test('chessdown: the focus follows to the new screen', async ({ page }) => {
    await page.goto('/chessdown/');
    await activate(page.locator('#btn-how-to-play'));
    await expect.poll(() => focusInside(page, 'rules-modal')).toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('#btn-close-rules')).toBeFocused();
  });
});
