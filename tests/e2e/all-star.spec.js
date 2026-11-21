// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// All Star in the campaign (js/all-star.js): the club's players are drafted from its
// bench, the bot fields an army of the same worth at the squad's level, and each game
// brings experience; a series won brings a recruit (docs/games/chessdown-levels.md).

/** A club in storage: Lina the knight is 1 point short of level 2 once she survives a win. */
async function withClub(page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('pawnet.chessdown.club')) return;
    const stats = { games: 0, moves: 0, captures: 0, captured: 0, touchdowns: 0 };
    const p = (id, type, name, level, xp) => ({ id, type, name, level, xp, stats });
    localStorage.setItem('pawnet.chessdown.club', JSON.stringify({
      version: 1, coach: 'Etienne', name: 'Racing Rook', primary: '#7b1e3a', secondary: '#c9a227',
      pattern: 'stripes', shape: 'shield', emblem: 'wolf', season: 1, tier: 'school', recruits: 0, lineups: [],
      players: [p(1, 'k', 'The Captain', 5, 0), p(2, 'r', 'Alex', 2, 25), p(3, 'n', 'Lina', 1, 17), p(4, 'b', 'Hugo', 1, 0),
        p(5, 'p', 'Noah', 1, 0), p(6, 'p', 'Mila', 1, 0), p(7, 'p', 'Sam', 1, 0)],
    }));
  });
}
const square = (page, vr, vc) => page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));

test.describe('All Star friendly matches', () => {
  test.beforeEach(async ({ context, page }) => {
    await blockExternalRequests(context);
    await withClub(page);
  });

  test('the club drafts from its bench, saves a line-up, and meets an army of its own worth and level', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Play a friendly match' }).click();
    await expect(page.locator('#difficulty-modal')).toBeVisible();
    await page.locator('[data-level="novice"]').dispatchEvent('pointerdown');
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');

    // The bench, not the shop; no jersey colour to choose.
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await expect(bench).toBeVisible();
    await expect(page.locator('.pieces-shop')).toBeHidden();
    await expect(page.locator('#color-picker')).toBeHidden();
    await expect(bench.getByRole('button')).toHaveCount(7);
    expect(await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze().then((r) => r.violations.map((v) => v.id))).toEqual([]);

    for (const [name, vr, vc] of [['The Captain', 5, 4], ['Alex', 5, 0], ['Lina', 4, 2]]) {
      await bench.getByRole('button', { name: new RegExp(`^Place ${name},`) }).click();
      await square(page, vr, vc).click();
    }
    await expect(bench.getByRole('button')).toHaveCount(4); // Each player once
    await expect(page.locator('#draft-points')).toHaveText(String(39 - 0 - 4 - 2)); // King 0, rook level 2: 4, knight level 1: 2
    await expect(square(page, 5, 0)).toHaveAttribute('aria-label', /your rook Alex, level 2/);

    // Line-up 1: saved, cleared, loaded back.
    await page.getByRole('button', { name: 'Save 1' }).click();
    await expect(page.locator('#status-bar')).toHaveText('Line-up 1 saved.');
    await page.locator('#btn-clear-draft').dispatchEvent('pointerdown');
    await expect(bench.getByRole('button')).toHaveCount(7);
    await page.getByRole('button', { name: 'Load 1' }).click();
    await expect(bench.getByRole('button')).toHaveCount(4);
    expect((await stored(page)).lineups).toEqual([{ name: 'slot1', pieces: [{ id: 3, r: 10, c: 2 }, { id: 2, r: 11, c: 0 }, { id: 1, r: 11, c: 4 }] }]);

    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const armies = await page.evaluate(() => {
      const pieces = chessdown.state.board.flat().filter(Boolean);
      const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
      const bot = pieces.filter((p) => p.player === 2);
      return {
        mine: pieces.filter((p) => p.player === 1).map((p) => [p.type, p.level, p.clubId]),
        botLevels: [...new Set(bot.filter((p) => p.type !== 'k').map((p) => p.level))],
        botWorth: bot.reduce((sum, p) => sum + values[p.type], 0),
      };
    });
    expect(armies.mine).toEqual(expect.arrayContaining([['k', 5, 1], ['r', 2, 2], ['n', 1, 3]]));
    expect(armies.botLevels).toEqual([1]); // The squad's average level
    expect(armies.botWorth).toBeLessThanOrEqual(5 + 3 + 3 + 3); // What the squad is worth
    await expect(page.locator('#series-score')).toHaveText('Series 0–0');
    expect(errors).toEqual([]);
  });

  test('a game brings experience; a level reached is told; a series won brings a recruit', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Play a friendly match' }).click();
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    for (const [name, vr, vc] of [['The Captain', 5, 4], ['Alex', 5, 0], ['Lina', 4, 2]]) {
      await bench.getByRole('button', { name: new RegExp(`^Place ${name},`) }).click();
      await square(page, vr, vc).click();
    }
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#chessboard')).toHaveClass(/levels-shown/);

    // Alex (the rook) moves once, then the game is won: +1 for the move, +3 each for being on the field.
    await expect.poll(() => page.evaluate(() => chessdown.state.currentPlayer), { timeout: 20_000 }).toBe(1);
    await page.evaluate(() => chessdown.movePiece(11, 0, 10, 0));
    // The move is played after its 300 ms animation: wait until it is counted.
    await expect.poll(() => page.evaluate(() => chessdown.state.allStar.tally[2]?.moves || 0)).toBe(1);
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toHaveText('Lina reaches level 2!');
    let club = await stored(page);
    const byId = Object.fromEntries(club.players.map((p) => [p.id, p]));
    expect([byId[2].xp, byId[2].level, byId[2].stats.moves, byId[2].stats.games]).toEqual([29, 2, 1, 1]);
    expect([byId[3].xp, byId[3].level]).toEqual([20, 2]);
    expect(byId[4].stats.games).toBe(0); // Hugo did not play
    expect(club.recruits).toBe(0);

    // The series won (2–0): a recruit.
    await page.evaluate(async () => {
      chessdown.state.series = { ...chessdown.state.series, wins: { 1: 1, 2: 0 }, games: 1 };
      (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king');
    });
    await expect(page.locator('#victory-club')).toContainText('Series won: a recruit is waiting for you on the club page.');
    club = await stored(page);
    expect(club.recruits).toBe(1);
  });

  test('the classic campaign keeps the shop and plays without levels', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.locator('#btn-start-bot').dispatchEvent('pointerdown');
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
    await expect(page.locator('.pieces-shop')).toBeVisible();
    await expect(page.locator('#club-bench')).toHaveCount(0);
    expect(await page.evaluate(() => chessdown.state.allStar)).toBeNull();
  });
});
