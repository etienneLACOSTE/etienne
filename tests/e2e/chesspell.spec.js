// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Board: engine.board[r][c], r = 0 is black's back rank (rank 8), c = 0 is file a.
// Pieces are absolutely positioned over the squares, so we click by board geometry.

/** Profiles with ready-made 3-card decks (Wall, Leap Frog, Ghost / Cannibalism, Freeze, Sacrifice). */
const SEEDED_PROFILES = [
  { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] },
  { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [1, 15, 14] },
];

/** @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target */
async function seedProfiles(target) {
  await target.addInitScript((profiles) => {
    localStorage.setItem('spellChessProfiles', JSON.stringify(profiles));
  }, SEEDED_PROFILES);
}

/**
 * Screen point inside board cell (r, c), as seen by this player.
 * Aims at the cell centre, but stays inside the visible part of the screen
 * container: on narrow phones the board overflows and its edge files are
 * half hidden (known layout bug), and a player taps what they can see.
 * @param {import('@playwright/test').Page} page
 * @param {number} r
 * @param {number} c
 * @param {boolean} flipped true for the online black player
 */
async function cellCenter(page, r, c, flipped = false) {
  const box = await page.locator('#chessboard').boundingBox();
  const frame = await page.locator('#game-board').boundingBox();
  if (!box || !frame) throw new Error('chessboard not visible');
  const [vr, vc] = flipped ? [7 - r, 7 - c] : [r, c];
  const size = box.width / 8;
  const left = Math.max(box.x + vc * size, frame.x) + 1;
  const right = Math.min(box.x + (vc + 1) * size, frame.x + frame.width) - 1;
  return { x: (left + right) / 2, y: box.y + (vr + 0.5) * size };
}

/**
 * Select a piece then click its destination.
 * @param {import('@playwright/test').Page} page
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {boolean} [flipped]
 */
async function clickMove(page, from, to, flipped = false) {
  const a = await cellCenter(page, ...from, flipped);
  await page.mouse.click(a.x, a.y);
  const b = await cellCenter(page, ...to, flipped);
  await page.mouse.click(b.x, b.y);
}

/**
 * Drag a piece onto its destination.
 * @param {import('@playwright/test').Page} page
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @param {boolean} [flipped]
 */
async function dragMove(page, from, to, flipped = false) {
  const a = await cellCenter(page, ...from, flipped);
  const b = await cellCenter(page, ...to, flipped);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {number} r
 * @param {number} c
 */
function pieceAt(page, r, c) {
  return page.evaluate(([row, col]) => engine.board[row][col], [r, c]);
}

/** @param {import('@playwright/test').Page} page */
function turn(page) {
  return page.evaluate(() => engine.turn);
}

test.describe("Ches'spell", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('local game: draft spells, cast Wall, then capture the king', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/');

    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();

    // Draft order is P1, P2, P2, P1, P1, P2.
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await expect(page.locator('#player1-cards .in-game-card')).toHaveCount(3);

    // White casts Wall on a4 instead of moving.
    await page.locator('#player1-cards .in-game-card[data-card-id="8"]').click();
    await page.locator('#modal-confirm').click();
    const a4 = await cellCenter(page, 4, 0);
    await page.mouse.click(a4.x, a4.y);
    expect(await pieceAt(page, 4, 0)).toBe('W');
    await expect(page.locator('#player1-cards .in-game-card[data-card-id="8"]')).toHaveClass(/used/);
    expect(await turn(page)).toBe('black');

    // Fool's-mate pattern, then the queen takes the king (no checks in this variant).
    await clickMove(page, [1, 4], [3, 4]); // e5
    await clickMove(page, [6, 5], [5, 5]); // f3
    await clickMove(page, [1, 0], [2, 0]); // a6
    await clickMove(page, [6, 6], [4, 6]); // g4
    await clickMove(page, [0, 3], [4, 7]); // Qh4
    await clickMove(page, [6, 1], [5, 1]); // b3
    const gameOver = page.waitForEvent('dialog');
    await clickMove(page, [4, 7], [7, 4]); // Qxe1
    const dialog = await gameOver;
    expect(dialog.message()).toBe('Game Over! Black wins!');
    await dialog.accept();
    expect(errors).toEqual([]);
  });

  test('campaign: the bot plays the move returned by the AI API', async ({ page }) => {
    const errors = trackPageErrors(page);
    await seedProfiles(page);
    /** @type {any} */
    let requestBody = null;
    await page.route('**/get_move', async (route) => {
      requestBody = route.request().postDataJSON();
      await route.fulfill({ json: { type: 'move', from: 'e7', to: 'e5', promotion: null } });
    });
    await page.goto('/chesspell/');

    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.locator('#btn-confirm-campaign').click();
    await expect(page.locator('#game-board')).toHaveClass(/active/);

    await clickMove(page, [6, 4], [4, 4]); // e4
    await expect.poll(() => pieceAt(page, 3, 4)).toBe('p');
    expect(await turn(page)).toBe('white');
    expect(requestBody.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b - - 0 1');
    expect(requestBody.elo).toBe(1500);
    expect(errors).toEqual([]);
  });

  test('campaign: falls back to the JS bot when the AI API is down', async ({ page }) => {
    const errors = trackPageErrors(page);
    await seedProfiles(page);
    await page.route('**/get_move', (route) => route.abort());
    await page.goto('/chesspell/');

    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.locator('#btn-confirm-campaign').click();

    await clickMove(page, [6, 4], [4, 4]); // e4
    const afterWhite = await page.evaluate(() => JSON.stringify(engine.board));
    expect(await turn(page)).toBe('black');
    await expect.poll(() => turn(page), { timeout: 20_000 }).toBe('white');
    // The bot either moved a piece or cast a spell (which may not change the board).
    const botActed = await page.evaluate((before) =>
      JSON.stringify(engine.board) !== before
        || document.querySelectorAll('#player2-cards .in-game-card.used').length > 0, afterWhite);
    expect(botActed).toBe(true);
    expect(errors).toEqual([]);
  });

  test('online: both players see each move', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    for (const ctx of [ctx1, ctx2]) {
      await blockExternalRequests(ctx);
      await seedProfiles(ctx);
    }
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const errors = [p1, p2].map(trackPageErrors);

    for (const page of [p1, p2]) {
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    }
    await p2.locator('#online-p1-select').selectOption('guest2');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).toHaveText(/^[A-Z]{6}$/);
    await expect(codeEl).not.toHaveText('XXXX'); // Placeholder shown before the server answers
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();

    for (const page of [p1, p2]) {
      await expect(page.locator('#game-board')).toHaveClass(/active/);
      await expect(page.locator('#player1-banner')).toContainText('Guest 1');
      await expect(page.locator('#player2-banner')).toContainText('Guest 2');
    }

    await clickMove(p1, [6, 4], [4, 4]); // White e4
    for (const page of [p1, p2]) await expect.poll(() => pieceAt(page, 4, 4)).toBe('P');

    await dragMove(p2, [1, 4], [3, 4], true); // Black e5, from the rotated view
    for (const page of [p1, p2]) await expect.poll(() => pieceAt(page, 3, 4)).toBe('p');
    expect(await turn(p1)).toBe('white');
    expect(errors.flat()).toEqual([]);

    await ctx1.close();
    await ctx2.close();
  });

  // Known bug: at 375 px the board is wider than #game-board (overflow: hidden),
  // so files a and h are half cut off. Remove test.fail() once fixed.
  test('the whole board is visible (known bug on mobile)', async ({ page }, testInfo) => {
    test.fail(testInfo.project.name === 'mobile');
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    const box = await page.locator('#chessboard').boundingBox();
    const frame = await page.locator('#game-board').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(frame.x);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
  });

  // Known bug: for the online black player, pieces are drawn rotated but the
  // clickable squares are not, so click-to-move onto an empty square targets
  // the mirrored square. Drag-and-drop works. Remove test.fail() once fixed.
  test('online: black can move by clicking (known bug)', async ({ browser }) => {
    test.fail();
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    for (const ctx of [ctx1, ctx2]) {
      await blockExternalRequests(ctx);
      await seedProfiles(ctx);
    }
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    for (const page of [p1, p2]) {
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    }
    await p2.locator('#online-p1-select').selectOption('guest2');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).not.toHaveText('XXXX');
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    await expect(p2.locator('#game-board')).toHaveClass(/active/);

    await clickMove(p1, [6, 4], [4, 4]); // White e4
    await expect.poll(() => pieceAt(p2, 4, 4)).toBe('P');
    await clickMove(p2, [1, 4], [3, 4], true); // Black e5 by clicking
    await expect.poll(() => pieceAt(p2, 3, 4), { timeout: 3_000 }).toBe('p');

    await ctx1.close();
    await ctx2.close();
  });
});
