// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, chooseFormat, readGlobal, signedInContext, trackPageErrors } = require('./helpers');

// Chessdown matches (games/chessdown/series.js): a best of 3 with 30 s turns, the loser
// of a game starting the next one; online, the server keeps the series.

const square = (page, vr, vc) => page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`);

async function place(page, type, vr, vc) {
  await page.locator(`.shop-item[data-type="${type}"]`).click();
  await square(page, vr, vc).click();
  await expect(square(page, vr, vc)).toHaveClass(/has-piece/);
}

async function move(page, from, to, flipped = false) {
  const view = ([r, c]) => (flipped ? [11 - r, 7 - c] : [r, c]);
  const [fr, fc] = view(from);
  const [tr, tc] = view(to);
  await square(page, fr, fc).click();
  await expect(square(page, tr, tc)).toHaveClass(/highlight/);
  await square(page, tr, tc).click();
}

/** Both armies on the same screen: king and rook each, the rooks on open files. */
async function draftLocal(page) {
  await place(page, 'k', 5, 4);
  await place(page, 'r', 3, 3);
  await page.locator('#btn-validate-draft').click();
  await page.locator('#btn-ready').click();
  await place(page, 'k', 5, 4);
  await place(page, 'r', 3, 3);
  await page.locator('#btn-validate-draft').click();
}

/** The player to move takes the enemy king with their rook; returns who won. */
async function starterTakesKing(page) {
  await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
  const starter = /** @type {number} */ (await readGlobal(page, 'currentPlayer'));
  if (starter === 1) await move(page, [9, 3], [0, 3]);
  else await move(page, [2, 4], [11, 4]);
  await expect(page.locator('#victory-screen')).toBeVisible();
  return starter;
}

test.describe('Best of 3', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('same screen: 30 s turns, the score, the loser starts, then the series winner', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await page.locator('#btn-start-local').click();
    const question = page.getByRole('alertdialog', { name: 'Which match do you want to play?' });
    await expect(question.getByRole('button', { name: 'Best of 3 (30 s turns)' })).toBeFocused();
    await chooseFormat(page, 'bo3');
    await expect(page.locator('#series-score')).toHaveText('Series 0–0');

    await draftLocal(page);
    await expect(page.locator('#timer-text-overlay')).toHaveText('00:30', { timeout: 15_000 });
    const first = await starterTakesKing(page);
    const wins = { 1: 0, 2: 0 };
    wins[first]++;
    await expect(page.locator('#victory-series')).toHaveText(`Series after game 1: ${wins[1]}–${wins[2]}.`);
    const next = page.locator('#btn-restart');
    await expect(next).toHaveText('Next game');

    // Game 2: no coin, the loser of game 1 starts (and wins it here).
    await next.click();
    await expect(page.locator('#series-score')).toHaveText(`Series ${wins[1]}–${wins[2]}`);
    await draftLocal(page);
    const loser = first === 1 ? 2 : 1;
    await expect(page.locator('#coin-text')).toHaveText(`Player ${loser} lost the last game and starts.`);
    expect(await starterTakesKing(page)).toBe(loser);
    wins[loser]++;
    await expect(page.locator('#victory-series')).toHaveText(`Series after game 2: ${wins[1]}–${wins[2]}.`);

    // Game 3: the first winner lost game 2, starts and wins the series.
    await next.click();
    await draftLocal(page);
    expect(await starterTakesKing(page)).toBe(first);
    wins[first]++;
    await expect(page.locator('#victory-series')).toHaveText(`Player ${first} won the series ${wins[1]}–${wins[2]}!`);
    await expect(next).toHaveText('New match');

    // A new match starts again at 0–0, with the coin.
    await next.click();
    await expect(page.locator('#series-score')).toHaveText('Series 0–0');
    await page.locator('#btn-main-menu').dispatchEvent('pointerdown');
    expect(errors).toEqual([]);
  });

  test('a single game: no score, the Settings timer, Play Again', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.locator('#btn-start-local').click();
    await chooseFormat(page, 'single');
    await expect(page.locator('#series-score')).toBeHidden();
    await draftLocal(page);
    await expect(page.locator('#timer-text-overlay')).toHaveText(/^00:(0\d|10)$/, { timeout: 15_000 });
    await starterTakesKing(page);
    await expect(page.locator('#victory-series')).toBeHidden();
    await expect(page.locator('#btn-restart')).toHaveText('Play Again');
  });

  test('the campaign is always a best of 3', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.locator('#btn-start-bot').dispatchEvent('pointerdown');
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
    await expect(page.locator('#series-score')).toHaveText('Series 0–0');
    expect(await page.evaluate(() => [chessdown.state.series.format, chessdown.state.timerBaseSeconds])).toEqual(['bo3', 30]);
  });

  test('online: both pages follow the server; a reload between two games comes back to it', async ({ browser }) => {
    const ctx1 = (await signedInContext(browser)).context;
    const ctx2 = (await signedInContext(browser)).context;
    const [p1, p2] = [await ctx1.newPage(), await ctx2.newPage()];
    const errors = [p1, p2].map(trackPageErrors);
    await p1.goto('/chessdown/');
    await p2.goto('/chessdown/');
    await p1.locator('#btn-create-room').click();
    await chooseFormat(p1, 'bo3');
    await expect(p1.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
    await p2.locator('#room-code-input').fill((await p1.locator('#waiting-room-code').textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await place(page, 'r', 3, 3);
      await page.locator('#btn-validate-draft').click();
    }
    await expect(p1.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await expect(p2.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    expect(await p2.evaluate(() => chessdown.state.timerBaseSeconds)).toBe(30);
    const starter = await readGlobal(p1, 'currentPlayer');
    if (starter === 1) await move(p1, [9, 3], [0, 3]);
    else await move(p2, [2, 4], [11, 4], true);
    const [winner, loser] = starter === 1 ? [p1, p2] : [p2, p1];
    await expect(winner.locator('#victory-series')).toHaveText('Series after game 1: 1–0.');
    await expect(loser.locator('#victory-series')).toHaveText('Series after game 1: 0–1.');
    await expect(loser.locator('#series-score')).toHaveText('Series 0–1');

    // The loser reloads between the two games: back on the end screen, seat kept.
    await loser.reload();
    await expect(loser.locator('#victory-title')).toHaveText('Defeat...');
    await expect(loser.locator('#victory-series')).toHaveText('Series after game 1: 0–1.');
    await expect(loser.locator('#btn-restart')).toHaveText('Next game');

    // Both ask for the next game: the loser starts it, without a coin.
    await winner.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(loser.locator('#btn-restart')).toHaveText('Next game (1/2)');
    await loser.locator('#btn-restart').dispatchEvent('pointerdown');
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await page.locator('#btn-validate-draft').click();
    }
    await expect(loser.locator('#coin-text')).toHaveText(/lost the last game and starts\.$/);
    await expect(loser.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    expect(await readGlobal(loser, 'currentPlayer')).toBe(await loser.evaluate(() => chessdown.state.myPlayerNumber));
    expect(errors.flat()).toEqual([]);
    await ctx1.close();
    await ctx2.close();
  });
});
