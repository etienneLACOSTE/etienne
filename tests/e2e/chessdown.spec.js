// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors, readGlobal, waitForGlobal } = require('./helpers');

// Board: 12 rows x 8 cols. Player 1 drafts rows 9-11, player 2 rows 0-2.
// In draft, each player sees a 6x8 view; rows 3-5 of the view are the deployment zone.
// Player 1 view (vr, vc) -> board (vr + 6, vc); player 2 view -> board (5 - vr, 7 - vc).

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} vr
 * @param {number} vc
 */
function square(page, vr, vc) {
  return page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`);
}

/**
 * Buy a piece in the draft shop and drop it on a view square.
 * @param {import('@playwright/test').Page} page
 * @param {string} type
 * @param {number} vr
 * @param {number} vc
 */
async function place(page, type, vr, vc) {
  await page.locator(`.shop-item[data-type="${type}"]`).click();
  await square(page, vr, vc).click();
  await expect(square(page, vr, vc)).toHaveClass(/has-piece/);
}

/**
 * Click a piece then its destination, in board coordinates.
 * `flipped` is true for the online player 2, whose view is rotated.
 * @param {import('@playwright/test').Page} page
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {boolean} [flipped]
 */
async function move(page, from, to, flipped = false) {
  const view = ([r, c]) => (flipped ? [11 - r, 7 - c] : [r, c]);
  const [fr, fc] = view(from);
  const [tr, tc] = view(to);
  await square(page, fr, fc).click();
  await expect(square(page, tr, tc)).toHaveClass(/highlight/);
  await square(page, tr, tc).click();
}

/** Wait for the coin flip to finish and return the starting player. */
async function waitForGameplay(page) {
  await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
  return /** @type {Promise<number>} */ (readGlobal(page, 'currentPlayer'));
}

test.describe('Chessdown', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('local game: draft both armies, then capture the king', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');

    await page.locator('#btn-start-local').click();
    // Player 1: king (11,4), rook (9,3)
    await place(page, 'k', 5, 4);
    await place(page, 'r', 3, 3);
    await expect(page.locator('#draft-points')).toHaveText('34');
    await page.locator('#btn-validate-draft').click();

    // Player 2: king (0,3), rook (2,4)
    await page.locator('#btn-ready').click();
    await place(page, 'k', 5, 4);
    await place(page, 'r', 3, 3);
    await page.locator('#btn-validate-draft').click();

    const starter = await waitForGameplay(page);
    // Each rook has an open file to the enemy king.
    if (starter === 1) await move(page, [9, 3], [0, 3]);
    else await move(page, [2, 4], [11, 4]);

    await expect(page.locator('#victory-title')).toHaveText('Victory!');
    await expect(page.locator('#victory-reason')).toHaveText(`Player ${starter} captured the King!`);
    expect(errors).toEqual([]);
  });

  test('local game: touchdown wins after surviving one turn', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');

    await page.locator('#btn-start-local').click();
    // Player 1: king (11,4), rook (9,0)
    await place(page, 'k', 5, 4);
    await place(page, 'r', 3, 0);
    await page.locator('#btn-validate-draft').click();
    // Player 2: king only, at (0,3)
    await page.locator('#btn-ready').click();
    await place(page, 'k', 5, 4);
    await page.locator('#btn-validate-draft').click();

    const starter = await waitForGameplay(page);
    if (starter === 2) await move(page, [0, 3], [1, 3]);
    await waitForGlobal(page, 'currentPlayer', 1);
    await move(page, [9, 0], [0, 0]); // Rook enters the endzone
    await waitForGlobal(page, 'currentPlayer', 2);
    const kingRow = starter === 2 ? 1 : 0;
    await move(page, [kingRow, 3], [kingRow + 1, 3]); // Player 2 does not capture

    await expect(page.locator('#victory-title')).toHaveText('Victory!');
    await expect(page.locator('#victory-reason')).toHaveText(/TOUCHDOWN!/);
    expect(errors).toEqual([]);
  });

  test('campaign: the bot answers a move', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');

    await page.locator('#btn-start-bot').click();
    await page.locator('.btn-difficulty[data-level="novice"]').click();
    await page.locator('#btn-confirm-campaign').click();
    await place(page, 'k', 5, 4);
    await place(page, 'p', 4, 4); // Shields the king's open file from a first-move capture
    await place(page, 'r', 3, 0);
    await page.locator('#btn-validate-draft').click();

    await waitForGameplay(page);
    await waitForGlobal(page, 'currentPlayer', 1); // Let the bot open if it won the flip
    // The bot may have taken a piece, so pick any legal non-king move that is still available.
    const playable = await page.evaluate(() => {
      const { board } = chessdown.state;
      const { getValidMoves } = chessdown;
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
          const piece = board[r][c];
          if (!piece || piece.player !== 1 || piece.type === 'k') continue;
          const moves = getValidMoves(r, c);
          if (moves.length) return { from: [r, c], to: [moves[0].r, moves[0].c] };
        }
      }
      return null;
    });
    expect(playable).not.toBeNull();
    await move(page, playable.from, playable.to);
    // The bot must reply with its own move.
    await expect
      .poll(() => page.evaluate(() => chessdown.state.lastMove && chessdown.state.lastMove.piece.player), { timeout: 20_000 })
      .toBe(2);
    expect(errors).toEqual([]);
  });

  test('online: two players draft, then the starter captures the king', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    await blockExternalRequests(ctx1);
    await blockExternalRequests(ctx2);
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const errors = [...[p1, p2].map(trackPageErrors)];

    await p1.goto('/chessdown/');
    await p2.goto('/chessdown/');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).toHaveText(/^[A-Z]{6}$/);
    await expect(codeEl).not.toHaveText('ABCD');
    const code = await codeEl.textContent();

    await p2.locator('#room-code-input').fill(code ?? '');
    await p2.locator('#btn-join-room').click();

    // Same view squares for both players; boards: P1 king (11,4) rook (9,3), P2 king (0,3) rook (2,4)
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await place(page, 'r', 3, 3);
      await page.locator('#btn-validate-draft').click();
    }

    const starter = await waitForGameplay(p1);
    await waitForGameplay(p2);
    if (starter === 1) await move(p1, [9, 3], [0, 3]);
    else await move(p2, [2, 4], [11, 4], true);

    const winner = starter === 1 ? p1 : p2;
    const loser = starter === 1 ? p2 : p1;
    await expect(winner.locator('#victory-title')).toHaveText('Victory!');
    await expect(loser.locator('#victory-title')).toHaveText('Defeat...');
    expect(errors.flat()).toEqual([]);

    await ctx1.close();
    await ctx2.close();
  });

  test('online: when the turn timer runs out, both players move on together', async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    await blockExternalRequests(ctx1);
    await blockExternalRequests(ctx2);
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const errors = [p1, p2].map(trackPageErrors);
    await p1.goto('/chessdown/');
    await p2.goto('/chessdown/');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).not.toHaveText('ABCD');
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await page.locator('#btn-validate-draft').click();
    }
    const starter = await waitForGameplay(p1);
    await waitForGameplay(p2);

    // Nobody moves: after the 10 s turn timer, the server passes the turn.
    for (const page of [p1, p2]) {
      await expect.poll(() => readGlobal(page, 'currentPlayer'), { timeout: 20_000 }).toBe(3 - starter);
    }
    expect(errors.flat()).toEqual([]);
    await ctx1.close();
    await ctx2.close();
  });

  test('online: en passant works between two players', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    await blockExternalRequests(ctx1);
    await blockExternalRequests(ctx2);
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const errors = [p1, p2].map(trackPageErrors);

    await p1.goto('/chessdown/');
    await p2.goto('/chessdown/');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).not.toHaveText('ABCD');
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    // Player 1: king (11,4) + pawn (9,3). Player 2: king (0,3) + pawn (2,4). Same view squares for both.
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await place(page, 'p', 3, 3);
      await page.locator('#btn-validate-draft').click();
    }
    await waitForGameplay(p1);
    await waitForGameplay(p2);

    // Real moves only (the server referees): the white pawn walks to row 4 while
    // player 2 shuffles the king, then the black pawn double-steps next to it.
    const whitePawn = [[[9, 3], [7, 3]], [[7, 3], [6, 3]], [[6, 3], [5, 3]], [[5, 3], [4, 3]]];
    const kingShuffle = [[[0, 3], [0, 2]], [[0, 2], [0, 3]]];
    let p2Moves = 0;
    while (whitePawn.length) {
      const turn = await readGlobal(p1, 'currentPlayer');
      await expect.poll(() => readGlobal(p2, 'currentPlayer')).toBe(turn);
      if (turn === 1) {
        const [from, to] = whitePawn.shift();
        await move(p1, from, to);
      } else {
        const [from, to] = kingShuffle[p2Moves++ % 2];
        await move(p2, from, to, true);
      }
      await expect.poll(() => readGlobal(p1, 'currentPlayer')).toBe(3 - turn);
    }
    await expect.poll(() => readGlobal(p2, 'currentPlayer')).toBe(2);
    await move(p2, [2, 4], [4, 4], true); // Double step lands next to the white pawn
    await expect.poll(() => readGlobal(p1, 'currentPlayer')).toBe(1);
    await move(p1, [4, 3], [3, 4]); // En passant

    for (const page of [p1, p2]) {
      await expect.poll(() => page.evaluate(() => [chessdown.state.board[3][4]?.player, chessdown.state.board[4][4]])).toEqual([1, null]);
    }
    expect(errors.flat()).toEqual([]);
    await ctx1.close();
    await ctx2.close();
  });
});
