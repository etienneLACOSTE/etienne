// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// The career's screen (js/career-view.js, js/career-map.js; docs/games/chessdown-career.md):
// the map of the tier, a button per place, the card shown only once the coach gets there,
// the transport and its ticket, the journal behind a tab; and its matches
// (js/career-match.js): a matchday, a quest with its rules, the result and the reward.

const CLUB = {
  version: 1, coach: 'Etienne', name: 'Racing Rook', primary: '#7b1e3a', secondary: '#c9a227',
  pattern: 'stripes', shape: 'shield', emblem: 'wolf', season: 1, tier: 'school', recruits: 0, lineups: [],
  players: [['k', 'The Captain', 5], ['r', 'Alex', 1], ['n', 'Lina', 1], ['b', 'Hugo', 1], ['p', 'Noah', 1], ['p', 'Mila', 1], ['p', 'Sam', 1]]
    .map(([type, name, level], i) => ({ id: i + 1, type, name, level, xp: 0, stats: { games: 0, moves: 0, captures: 0, captured: 0, touchdowns: 0 } })),
};

/**
 * Open the career with the club (and, with `ticket`, a career that has just won the
 * county ticket: the school season played and won).
 * @param {import('@playwright/test').Page} page
 */
async function openCareer(page, { ticket = false } = {}) {
  await page.goto('/chessdown/');
  await page.evaluate(async ({ club, ticket }) => {
    localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
    if (ticket) {
      const Career = /** @type {any} */ (window).ChessdownCareer;
      let c = Career.newCareer(5);
      while (Career.nextMatch(c)) c = Career.recordSeries(c, { won: 2, lost: 0 });
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(Career.finishSeason(c).career));
    }
    const events = await import('/chessdown/js/events.js');
    events.openCareerPage(club);
  }, { club: CLUB, ticket });
  await expect(page.locator('#career-screen')).toBeVisible();
}
const card = (page) => page.locator('#career-card');
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.career') || 'null'));

test.describe('Career', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('opens at the club, in town: Gérard, the scale, the map and its places', async ({ page }) => {
    const errors = trackPageErrors(page);
    await openCareer(page);
    await expect(card(page).locator('h3')).toHaveText('Racing Rook');
    await expect(page.locator('#career-gerard-said')).toContainText('Welcome to town, coach!');
    await expect(page.locator('#career-scales li[aria-current="step"]')).toHaveText('School');
    await expect(page.locator('#career-scales li.locked')).toHaveCount(4);
    await expect(page.locator('#career-canvas')).toHaveAttribute('aria-label', 'Map: Town · Saint-Aubin. The places are the buttons that follow.');
    await expect(page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transport: Bus station' })).toBeVisible();
    await expect(page.locator('.career-marker.side')).toHaveCount(4);
    const career = await stored(page);
    expect(career.tier).toBe('school');
    expect(career.season).toBe(1);
    // One screen: the page does not scroll
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the place\'s card shows only once the coach gets there', async ({ page }) => {
    await openCareer(page);
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await expect(card(page).locator('.career-kind')).toHaveText('On the way');
    await expect(card(page)).not.toContainText('Matchday');
    await expect(card(page).locator('h3')).toHaveText('Matchday 1', { timeout: 15000 });
    await expect(card(page).locator('.career-rival canvas')).toBeVisible();
    await expect(card(page)).toContainText('Best of 3');
    await expect(card(page).getByRole('button', { name: 'Play the match' })).toBeVisible();
  });

  test('with reduced motion the coach is there at once; a side quest says what it asks and gives', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCareer(page);
    const marker = page.locator('.career-marker.side').first();
    const place = /** @type {string} */ (await marker.getAttribute('data-place'));
    await page.getByRole('tab', { name: 'Journal' }).click();
    await expect(page.locator('#career-journal')).toBeVisible();
    await expect(page.locator(`#career-journal [data-place="${place}"]`)).toContainText('Quest to discover');
    await page.locator(`#career-journal [data-place="${place}"]`).click();
    await expect(page.locator('#career-stage')).toBeVisible();
    await expect(card(page).locator('.career-kind')).toHaveText('Side quest');
    await expect(card(page)).toContainText('Gone once done');
    const title = await card(page).locator('h3').textContent();
    await page.getByRole('tab', { name: 'Journal' }).click();
    await expect(page.locator(`#career-journal [data-place="${place}"]`)).toContainText(/** @type {string} */ (title));
  });

  test('the bus needs a ticket: refused without, the county with it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCareer(page);
    await page.getByRole('button', { name: 'Transport: Bus station' }).click();
    await expect(card(page)).toContainText('No ticket, no trip!');
    await expect(card(page).getByRole('button', { name: 'Board' })).toBeDisabled();

    await openCareer(page, { ticket: true });
    await expect(page.locator('#career-scales li.open')).toHaveText('County');
    await page.getByRole('button', { name: 'Transport: Bus station' }).click();
    await expect(card(page)).toContainText('Ticket checked. All aboard, coach!');
    await card(page).getByRole('button', { name: 'Board' }).click();
    await expect(page.locator('#career-scales li[aria-current="step"]')).toHaveText('County');
    await expect(page.locator('#career-gerard-said')).toContainText('The county!');
    await expect(page.locator('#career-canvas')).toHaveAttribute('aria-label', /County · Val-de-Loir/);
    await expect(page.getByRole('button', { name: 'Transport: Montbrison RER station' })).toBeVisible();
    expect((await stored(page)).tier).toBe('county');
  });

  test('the tabs work with the arrow keys; the club button goes back to the club', async ({ page }) => {
    await openCareer(page);
    await page.getByRole('tab', { name: 'Map' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Journal' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('table')).toContainText('Racing Rook');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#career-stage')).toBeVisible();
    await page.locator('#career-back').click();
    await expect(page.locator('#club-screen')).toBeVisible();
  });

  test('in French', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pawnet.language', 'fr'));
    await openCareer(page);
    await expect(page.getByRole('tab', { name: 'Carte' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Journal' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quête principale : Stade municipal Léo-Lagrange' })).toBeVisible();
    await expect(page.locator('#career-gerard-said')).toContainText('Bienvenue en ville, coach !');
  });

  test('from the club\'s page: a matchday played, recorded in the table, back to the map', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Career' }).click();
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const setup = await page.evaluate(() => ({ timer: chessdown.state.timerBaseSeconds, format: chessdown.state.series.format, career: chessdown.state.career.kind }));
    expect(setup).toEqual({ timer: 30, format: 'bo3', career: 'league' });
    // Two games won: the series, then the table
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#btn-restart')).toHaveText('Next game');
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toContainText('Matchday played: you are 1/6 in the table.');
    await expect(page.locator('#btn-restart')).toHaveText('Back to the map');
    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(page.locator('#career-screen')).toBeVisible();
    const career = await stored(page);
    expect(career.league.results).toHaveLength(1);
    await page.getByRole('tab', { name: 'Journal' }).click();
    await expect(page.locator('.career-table tr.you')).toContainText('Racing Rook');
    await expect(page.locator('.career-table tr.you td').last()).toHaveText('3');
    expect(errors).toEqual([]);
  });

  test('a quest with a squad: only its pieces leave the bench; done, its reward given, gone from the map', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async (club) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const c = /** @type {any} */ (window).ChessdownCareer.newCareer(8);
      c.quests = { drawn: ['counter-bet', 'street-match', 'market-rush', 'shy-knight'], attempted: [] };
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    await page.getByRole('button', { name: 'Side quest: Café Le Touchdown' }).click();
    await expect(card(page).locator('h3')).toHaveText('The counter bet');
    await expect(card(page)).toContainText('Only these pieces');
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await expect(bench.getByRole('button', { name: /^Place Alex,/ })).toBeDisabled(); // A rook: not in this squad
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    for (const [name, vc] of [['Noah', 3], ['Mila', 4], ['Sam', 5]]) {
      await bench.getByRole('button', { name: new RegExp(`^Place ${name},`) }).click();
      await page.locator(`#chessboard .square[data-vr="4"][data-vc="${vc}"]`).click();
    }
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => chessdown.state.series.format)).toBe('single');
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toContainText('Quest done: The counter bet.');
    await expect(page.locator('#victory-club')).toContainText('+40 XP from the quest.');
    const club = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    expect(club.players.filter((p) => p.type === 'p').every((p) => p.xp >= 40 && p.level === 2)).toBe(true);
    expect((await stored(page)).questsDone).toEqual(['counter-bet']);
    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(page.locator('#career-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Side quest: Café Le Touchdown' })).toHaveCount(0);
  });

  test('a quest\'s limits hold: five pieces at most on the bench, and its own turn time', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async (club) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const c = /** @type {any} */ (window).ChessdownCareer.newCareer(8);
      c.quests = { drawn: ['street-match', 'market-rush', 'counter-bet', 'shy-knight'], attempted: [] };
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    await page.getByRole('button', { name: 'Side quest: Covered market' }).click();
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    const place = async (name, vr, vc) => {
      await bench.getByRole('button', { name: new RegExp(`^Place ${name},`) }).click();
      await page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`).click();
    };
    await place('The Captain', 5, 4);
    for (const [name, vc] of [['Noah', 1], ['Mila', 2], ['Sam', 3], ['Alex', 0]]) await place(name, 4, vc);
    await expect(bench.getByRole('button', { name: /^Place Lina,/ })).toBeDisabled(); // Five pieces at most
    // Street match: 15 s turns
    await page.locator('#btn-main-menu').dispatchEvent('pointerdown').catch(() => {});
    await page.evaluate(async (club) => (await import('/chessdown/js/events.js')).openCareerPage(club), CLUB);
    await page.getByRole('button', { name: 'Side quest: North district street pitch' }).click();
    await card(page).getByRole('button', { name: 'Accept' }).click();
    await place('The Captain', 5, 4);
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => chessdown.state.timerBaseSeconds)).toBe(15);
  });
});
