// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
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

  test('from the club\'s page: the tutorial\'s first matchday, kings and pawns, recorded in the table, Gérard\'s word', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Career' }).click();
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await expect(card(page).locator('.career-lesson')).toContainText('Matchday 1: kings and pawns only.');
    await expect(page.locator('#career-gerard-said')).toContainText('Matchday 1: kings and pawns only.');
    await expect(card(page)).toContainText('60 seconds a turn');
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await expect(bench.getByRole('button', { name: /^Place Alex,/ })).toBeDisabled(); // No rook on matchday 1
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const setup = await page.evaluate(() => ({
      timer: chessdown.state.timerBaseSeconds, format: chessdown.state.series.format, career: chessdown.state.career.kind,
      botTypes: [...new Set(chessdown.state.board.flat().filter((p) => p && p.player === 2).map((p) => p.type))].sort(),
    }));
    expect(setup.timer).toBe(60);
    expect(setup.format).toBe('bo3');
    expect(setup.career).toBe('league');
    expect(['k', 'p']).toEqual(expect.arrayContaining(setup.botTypes)); // The bot too: kings and pawns
    expect(setup.botTypes.every((type) => type === 'k' || type === 'p')).toBe(true);
    // Two games won: the series, then the table
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#btn-restart')).toHaveText('Next game');
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toContainText('Matchday played: you are 1/6 in the table.');
    await expect(page.locator('#btn-restart')).toHaveText('Back to the map');
    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(page.locator('#career-screen')).toBeVisible();
    await expect(page.locator('#career-gerard-said')).toHaveText('A fine win, coach! That is the pawn game. Next matchday: the knight comes in.');
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
    // The reward shows on arrival, without scrolling (375 px too).
    await expect(card(page).locator('.career-chip.reward')).toBeInViewport({ ratio: 1 });
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
    await expect(page.locator('#game-layout')).toBeHidden(); // The pitch went away with the match
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

  /** The career with the town's puzzle (the rook run) drawn this season. */
  async function withPuzzle(page) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async (club) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const c = /** @type {any} */ (window).ChessdownCareer.newCareer(8);
      c.quests = { drawn: ['sunday-jog', 'street-match', 'market-rush', 'counter-bet'], attempted: [] };
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    await page.getByRole('button', { name: 'Side quest: Lime Tree Park' }).click();
    await expect(card(page).locator('h3')).toHaveText('Sunday jog');
    await expect(card(page)).toContainText('Solve the puzzle in 3 moves');
    await card(page).getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#series-score')).toHaveText('Move 1/3');
  }
  /** Player 1 plays a move, then the other side passes: back to player 1. */
  async function play(page, from, to) {
    await expect.poll(() => page.evaluate(() => chessdown.state.currentPlayer)).toBe(1);
    await page.evaluate(([f, t]) => chessdown.movePiece(f[0], f[1], t[0], t[1]), [from, to]);
    await expect.poll(() => page.evaluate(() => chessdown.state.lastMove && `${chessdown.state.lastMove.toR},${chessdown.state.lastMove.toC}`)).toBe(`${to[0]},${to[1]}`);
  }

  test('a puzzle: its position without a draft, the other side passing, solved in its moves', async ({ page }) => {
    await withPuzzle(page);
    const rook = await page.evaluate(() => chessdown.state.board[9][3]);
    expect([rook.type, rook.level, rook.player]).toEqual(['r', 1, 1]);
    await play(page, [9, 3], [6, 3]);
    await expect(page.locator('#series-score')).toHaveText('Move 2/3');
    await play(page, [6, 3], [3, 3]); // Takes the stone in the way
    await play(page, [3, 3], [0, 3]);
    await expect(page.locator('#victory-club')).toContainText('Quest done: Sunday jog.', { timeout: 10_000 });
    await expect(page.locator('#victory-club')).toContainText('+25 XP from the quest.');
    expect((await stored(page)).questsDone).toEqual(['sunday-jog']);
  });

  test('a puzzle lost: no moves left before the end zone', async ({ page }) => {
    await withPuzzle(page);
    await play(page, [9, 3], [9, 2]);
    await play(page, [9, 2], [8, 2]);
    await play(page, [8, 2], [8, 1]);
    await expect(page.locator('#victory-reason')).toHaveText('No moves left: the end zone is still out of reach.', { timeout: 10_000 });
    await expect(page.locator('#victory-club')).toContainText('Quest failed: Sunday jog.');
    const career = await stored(page);
    expect(career.questsDone).toEqual([]);
    expect(career.quests.attempted).toEqual(['sunday-jog']);
  });

  test('the City Cup: closed during the league, then at the town hall; the final won brings the trophy and a recruit', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    const open = (careerScript) => page.evaluate(async ([club, script]) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const Career = /** @type {any} */ (window).ChessdownCareer;
      let c = Career.newCareer(8);
      c.quests = { drawn: ['counter-bet', 'street-match', 'market-rush', 'shy-knight'], attempted: [] };
      if (script === 'final') {
        while (Career.nextMatch(c).phase === 'league') c = Career.recordSeries(c, { won: 2, lost: 0 });
        c = Career.recordSeries(c, { won: 2, lost: 1 }); // The semi-final won
      }
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, [CLUB, careerScript]);

    await open('start');
    await page.getByRole('button', { name: 'Closed for now: Town hall' }).click();
    await expect(card(page)).toContainText('The cup is played once the league is over.');

    await open('final');
    await expect(page.getByRole('button', { name: 'Main quest: Town hall' })).toBeVisible();
    await page.getByRole('button', { name: /Léo-Lagrange municipal stadium/ }).click();
    await expect(card(page)).toContainText('The league is over. City Cup: head for Town hall.');
    await page.getByRole('button', { name: 'Main quest: Town hall' }).click();
    await expect(card(page).locator('h3')).toHaveText('City Cup · Final');
    await expect(card(page)).toContainText('The trophy and a recruit for the club');
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await expect(bench.getByRole('button', { name: /^Place Alex,/ })).toBeEnabled(); // No tutorial limits in the cup
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 2; i++) await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toContainText('City Cup won: the trophy is the club\'s!');
    await expect(page.locator('#victory-club')).toContainText('A recruit is waiting for you on the club page.');
    await expect(page.locator('#victory-club')).toContainText('Ticket won: Bus to the county!');
    const club = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    expect(club.recruits).toBe(1);
    const career = await stored(page);
    expect(career.season).toBe(2);
    expect(career.titles).toEqual([{ tier: 'school', season: 1 }, { tier: 'school', season: 1, cup: true }]);
    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await page.getByRole('tab', { name: 'Journal' }).click();
    await expect(page.locator('.career-titles')).toContainText('City Cup, season 1');
  });

  test('the Heritage jersey won in the career: worn from the club\'s wardrobe', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.addInitScript((club) => localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)), { ...CLUB, cosmetics: ['jersey-heritage'] });
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    const wardrobe = page.getByRole('radiogroup', { name: 'Wardrobe' });
    await expect(wardrobe.getByRole('radio', { name: 'Home jersey' })).toHaveAttribute('aria-checked', 'true');
    await wardrobe.getByRole('radio', { name: 'Heritage jersey' }).click();
    await expect(wardrobe.getByRole('radio', { name: 'Heritage jersey' })).toHaveAttribute('aria-checked', 'true');
    await expect(wardrobe.getByRole('radio', { name: 'Heritage jersey' })).toBeFocused();
    await expect(page.locator('.club-card-jersey svg')).toHaveAttribute('aria-label', /^Heritage jersey: cream/);
    const club = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    expect(club.wear).toBe('jersey-heritage');
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    // Back to the home jersey
    await wardrobe.getByRole('radio', { name: 'Home jersey' }).click();
    await expect(page.locator('.club-card-jersey svg')).toHaveAttribute('aria-label', /^Jersey: /);
    expect(errors).toEqual([]);
  });

  test('without the Heritage jersey, no wardrobe', async ({ page }) => {
    await page.addInitScript((club) => localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)), CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Wardrobe' })).toHaveCount(0);
  });
});
