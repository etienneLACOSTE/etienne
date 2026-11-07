// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Screen-reader basics on every page (WCAG 1.1.1, 1.3.1, 2.4.6, 3.1.1, 4.1.2):
// a language, one h1, a name for every control, button and link, alt text on
// images, decorative icons hidden.

test.describe('Accessible names', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  for (const url of ['/', '/chessdown/', '/chesspell/']) {
    test(`${url}: every control, button, link and image has a name`, async ({ page }) => {
      await page.goto(url);
      const issues = await page.evaluate(() => {
        const out = [];
        const labelled = (el) => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
          || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        document.querySelectorAll('input, select, textarea').forEach((el) => {
          if (!labelled(el)) out.push(`#${el.id || el.type}: no label`);
        });
        document.querySelectorAll('button, a[href], [role=button]').forEach((el) => {
          if (!(el.textContent.trim() || el.getAttribute('aria-label'))) out.push(`${el.tagName}.${el.className}: no name`);
        });
        document.querySelectorAll('img').forEach((el) => { if (!el.hasAttribute('alt')) out.push(`img: no alt`); });
        document.querySelectorAll('i[class*="fa-"]').forEach((el) => {
          if (el.getAttribute('aria-hidden') !== 'true') out.push(`icon ${el.className}: not hidden`);
        });
        if (!document.documentElement.lang) out.push('html: no lang');
        const h1 = document.querySelectorAll('h1').length;
        if (h1 !== 1) out.push(`${h1} h1 elements`);
        return out;
      });
      expect(issues).toEqual([]);
    });
  }
});

// Screen readers hear each move and whose turn it is (WCAG 4.1.3): a hidden live region,
// #announcer, filled by js/a11y.js at every turn.
test.describe('Announcements', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  /** @param {import('@playwright/test').Page} page */
  const pointer = (page, selector) => page.locator(selector).dispatchEvent('pointerdown');

  test('chessdown: match start, a move, a skipped turn', async ({ page }) => {
    await page.goto('/chessdown/');
    await pointer(page, '#btn-start-local');
    for (let i = 0; i < 2; i++) {
      if (i) await pointer(page, '#btn-ready');
      await pointer(page, '.shop-item[data-type="k"]');
      await pointer(page, '#chessboard .square[data-vr="5"][data-vc="4"]');
      await pointer(page, '.shop-item[data-type="r"]');
      await pointer(page, '#chessboard .square[data-vr="5"][data-vc="0"]');
      await pointer(page, '#btn-validate-draft');
    }
    const announcer = page.locator('#announcer');
    await expect(announcer).toHaveText(/^Match starts\. Player [12]'s turn\.$/, { timeout: 15_000 });
    await expect(announcer).toHaveAttribute('role', 'status');

    // A rook move, chosen among the legal moves of the player to move.
    await page.evaluate(() => {
      const { board, currentPlayer } = chessdown.state;
      const { generateAllMoves, movePiece } = chessdown;
      const move = generateAllMoves(currentPlayer).find((m) => board[m.fromR][m.fromC].type === 'r' && !board[m.toR][m.toC]);
      movePiece(move.fromR, move.fromC, move.toR, move.toC);
    });
    await expect(announcer).toHaveText(/^Player [12] rook [a-h]\d+ to [a-h]\d+\. Player [12]'s turn\.$/);

    await page.evaluate(() => chessdown.skipTurn());
    await expect(announcer).toHaveText(/^Time's up, turn skipped\. Player [12]'s turn\.$/);
  });

  test("ches'spell: match start, a move, a spell", async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    const announcer = page.locator('#announcer');
    await expect(announcer).toHaveText('Match starts. White to move.');

    await page.evaluate(() => engine.move(6, 4, 4, 4)); // e4
    await expect(announcer).toHaveText('White pawn e2 to e4. Black to move.');

    await page.evaluate(() => engine.move(1, 3, 3, 3)); // d5
    await expect(announcer).toHaveText('Black pawn d7 to d5. White to move.');
    await page.evaluate(() => engine.move(4, 4, 3, 3)); // exd5
    await expect(announcer).toHaveText('White pawn e4 to d5, takes black pawn. Black to move.');
    await page.evaluate(() => engine.move(1, 0, 2, 0)); // a6

    // White casts Wall on a4.
    await page.locator('#player1-cards .in-game-card[data-card-id="8"] .card-main').click();
    await page.locator('#modal-confirm').click();
    await page.locator('#chessboard .square[data-r="4"][data-c="0"]').dispatchEvent('pointerdown');
    await expect(announcer).toHaveText('White casts Wall. Board: a4 wall. Black to move.');
  });
});
