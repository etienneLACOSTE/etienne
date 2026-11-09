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
  return page.evaluate(([row, col]) => chesspell.engine.board[row][col], [r, c]);
}

/** @param {import('@playwright/test').Page} page */
function turn(page) {
  return page.evaluate(() => chesspell.engine.turn);
}

test.describe("Ches'spell", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  /** Draft a local game, then white casts Wall on a4. */
  async function castWall(page) {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await page.locator('#player1-cards .in-game-card[data-card-id="8"]').click();
    await page.locator('#modal-confirm').click();
    const a4 = await cellCenter(page, 4, 0);
    await page.mouse.click(a4.x, a4.y);
  }

  test('a spell plays its effect over the board, then the effect goes away', async ({ page }) => {
    const errors = trackPageErrors(page);
    await castWall(page);
    await expect(page.locator('#spell-fx .fx-rune')).toHaveCount(1);
    await expect(page.locator('#spell-fx')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('#spell-fx > *')).toHaveCount(0, { timeout: 3000 });
    expect(errors).toEqual([]);
  });

  test('no spell effect when the visitor asks for reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await castWall(page);
    expect(await pieceAt(page, 4, 0)).toBe('W');
    await expect(page.locator('#spell-fx > *')).toHaveCount(0);
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
    await clickMove(page, [4, 7], [7, 4]); // Qxe1

    // The end screen: who won and how, over the final board.
    const end = page.getByRole('dialog', { name: 'Guest 2 wins' });
    await expect(end).toBeVisible();
    await expect(end).toContainText('The white king has fallen.');
    // The game is over: no more moves, no more spells.
    await page.evaluate(() => chesspell.engine.move(6, 0, 5, 0));
    expect(await pieceAt(page, 6, 0)).toBe('P');
    expect(await turn(page)).toBe('black'); // No next turn after the king falls
    // Both profiles keep the result.
    const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('spellChessProfiles') || '[]')
      .map((p) => `${p.name}: ${p.stats.played} played, ${p.stats.wins} won`));
    expect(stats).toEqual(['Guest 1: 1 played, 0 won', 'Guest 2: 1 played, 1 won']);

    // Rematch: same decks, a fresh board.
    await end.getByRole('button', { name: 'Rematch' }).click();
    await expect(end).toBeHidden();
    expect(await pieceAt(page, 7, 4)).toBe('K');
    expect(await pieceAt(page, 4, 0)).toBe(null);
    await expect(page.locator('#player1-cards .in-game-card.used')).toHaveCount(0);
    await clickMove(page, [6, 4], [4, 4]); // e4: the board plays again
    expect(await turn(page)).toBe('black');
    expect(errors).toEqual([]);
  });

  test('campaign: a defeat on time ends the game, from the player\'s side', async ({ page }) => {
    const errors = trackPageErrors(page);
    await seedProfiles(page);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.getByRole('button', { name: 'Start Match' }).click();
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await page.evaluate(() => {
      const { app } = chesspell;
      app.timerMode = 'overall';
      app.timeLeftP1 = 1;
    });
    const end = page.getByRole('dialog', { name: 'Defeat' });
    await expect(end).toBeVisible({ timeout: 5000 });
    await expect(end).toContainText('Guest 1 ran out of time.');
    await expect(end.getByRole('button', { name: 'Rematch' })).toBeVisible();
    await end.getByRole('button', { name: 'Main menu' }).click();
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
    expect(errors).toEqual([]);
  });

  // The Python AI (ai/chesspell/) is set aside: the campaign bot is bot.js.
  test('campaign: the bot answers by itself, without calling any AI server', async ({ page }) => {
    const errors = trackPageErrors(page);
    /** @type {string[]} */
    const aiCalls = [];
    page.on('request', (r) => { if (r.url().includes('get_move')) aiCalls.push(r.url()); });
    await seedProfiles(page);
    await page.goto('/chesspell/');

    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.locator('#btn-confirm-campaign').click();
    await expect(page.locator('#game-board')).toHaveClass(/active/);

    await clickMove(page, [6, 4], [4, 4]); // e4
    const afterWhite = await page.evaluate(() => JSON.stringify(chesspell.engine.board));
    expect(await turn(page)).toBe('black');
    await expect.poll(() => turn(page), { timeout: 20_000 }).toBe('white');
    // The bot either moved a piece or cast a spell (which may not change the board).
    const botActed = await page.evaluate((before) =>
      JSON.stringify(chesspell.engine.board) !== before
        || document.querySelectorAll('#player2-cards .in-game-card.used').length > 0, afterWhite);
    expect(botActed).toBe(true);
    expect(aiCalls).toEqual([]);
    expect(errors).toEqual([]);
  });

  /** Start a campaign game, then put a custom position on the board with black (the bot) to move. */
  async function campaignPosition(page, elo, pieces, botDeck) {
    await seedProfiles(page);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.locator('#btn-confirm-campaign').click();
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await page.evaluate(([e, p, deck]) => {
      const { engine, app } = chesspell;
      app.botElo = e;
      engine.board = Array.from({ length: 8 }, () => Array(8).fill(null));
      for (const [key, piece] of Object.entries(p)) {
        const [r, c] = key.split(',').map(Number);
        engine.board[r][c] = piece;
      }
      app.p2Deck = deck;
      app.renderInGameDeck(app.p2Deck, 'player2-cards', 'black');
      engine.turn = 'black';
      app.renderChessboard();
      app.playBotTurn();
    }, [elo, pieces, botDeck]);
  }

  test('campaign: the bot casts a spell when it pays (Sniper on a defended queen)', async ({ page }) => {
    const errors = trackPageErrors(page);
    await campaignPosition(page, 1500, { '0,4': 'k', '7,4': 'K', '4,4': 'Q', '2,2': 'b', '5,5': 'P', '6,0': 'P' }, [7, 8, 16]);
    await expect.poll(() => turn(page), { timeout: 20_000 }).toBe('white');
    expect(await page.evaluate(() => chesspell.engine.board[4][4])).toBe(null); // the queen is gone
    expect(await page.evaluate(() => chesspell.engine.usedCards.black)).toEqual([7]);
    await expect(page.locator('#player2-cards .in-game-card.used')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  for (const elo of [400, 2500]) {
    test(`campaign: the bot plays a few turns without error (ELO ${elo})`, async ({ page }) => {
      const errors = trackPageErrors(page);
      await seedProfiles(page);
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Local Game' }).click();
      await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
      await page.locator('#btn-confirm-campaign').click();
      await expect(page.locator('#game-board')).toHaveClass(/active/);
      await page.evaluate((e) => { chesspell.app.botElo = e; }, elo);
      // White plays the first legal move it finds, three times; the bot answers each time.
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          const { engine } = chesspell;
          for (let r = 7; r >= 0; r--) {
            for (let c = 0; c < 8; c++) {
              const p = engine.board[r][c];
              if (!p || p === 'W' || engine.getColor(p) !== 'white') continue;
              const m = engine.getValidMoves(r, c).find((x) => !x.castle);
              if (m) { engine.move(r, c, m.r, m.c); return; }
            }
          }
        });
        if (await page.evaluate(() => chesspell.engine.winner)) break;
        await expect.poll(() => turn(page), { timeout: 20_000 }).toBe('white');
      }
      expect(errors).toEqual([]);
    });
  }

  test('campaign: the ELO slider sets how the bot picks spells, how far it searches and how often it blunders', async ({ page }) => {
    await page.goto('/chesspell/');
    const strength = await page.evaluate(() => [400, 800, 1200, 1500, 3000].map((elo) => {
      chesspell.app.botElo = elo;
      return chesspell.app.botStrength();
    }));
    expect(strength).toEqual([
      { spells: 'heuristic', depth: 1, randomMoveRate: 0.3 },
      { spells: 'heuristic', depth: 2, randomMoveRate: 0.15 },
      { spells: 'search', depth: 2, randomMoveRate: 0 },
      { spells: 'search', depth: 3, randomMoveRate: 0 },
      { spells: 'search', depth: 4, randomMoveRate: 0 },
    ]);
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

    // White casts Wall on a4: the server resolves it, both players see it.
    await p1.locator('#player1-cards .in-game-card[data-card-id="8"] .card-main').click();
    await p1.locator('#modal-confirm').click();
    await expect(p1.locator('#spell-instruction')).toHaveText(/empty square/);
    await expect(p2.locator('#spell-instruction')).toBeHidden(); // Instructions are for the caster
    const target = await cellCenter(p1, 4, 0, false);
    await p1.mouse.click(target.x, target.y);
    for (const page of [p1, p2]) {
      await expect.poll(() => pieceAt(page, 4, 0)).toBe('W');
      await expect(page.locator('#player1-cards .in-game-card[data-card-id="8"]')).toHaveClass(/used/);
    }
    await expect(p2.locator('#announcer')).toHaveText('White casts Wall. Board: a4 wall. Your turn.');
    expect(await turn(p2)).toBe('black');
    expect(errors.flat()).toEqual([]);

    await ctx1.close();
    await ctx2.close();
  });

  // Regression test: at 375 px the board used to be wider than #game-board
  // (overflow: hidden), so files a and h were half cut off.
  test('the whole board is visible', async ({ page }) => {
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

  // Regression test: squares used to stay unrotated for the online black player,
  // so clicking an empty square targeted the mirrored one.
  test('online: black can move by clicking', async ({ browser }) => {
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
