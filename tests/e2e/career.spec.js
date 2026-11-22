// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// The career's screen (js/career-view.js, js/career-map.js; docs/games/chessdown-career.md):
// the map of the tier, a button per place, the card shown only once the coach gets there,
// the transport and its ticket, the journal behind a tab; and its matches
// (js/career-match.js): a tournament match, a quest with its rules, the result and the reward;
// the black screen of a knock-out, the next season, the date that moves on.

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
      while (Career.nextMatch(c)) { const m = Career.nextMatch(c); c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 0 } : { won: 1, lost: 0 }); }
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(Career.finishSeason(c).career));
    }
    const events = await import('/chessdown/js/events.js');
    events.openCareerPage(club);
  }, { club: CLUB, ticket });
  await expect(page.locator('#career-screen')).toBeVisible();
}
const card = (page) => page.locator('#career-card');
/** The career on one of its views ('map', 'journal', 'guide'), as the club page's buttons open it. */
const careerView = (page, view) => page.evaluate(async (v) => (await import('/chessdown/js/events.js'))
  .openCareerPage(JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'), '', false, v), view);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.career') || 'null'));

test.describe('Career', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
    // Gérard's tour opens by itself on a first visit: seen already, except in its own test
    await context.addInitScript(() => { if (!location.search.includes('tour')) localStorage.setItem('pawnet.chessdown.tourSeen', '1'); });
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
    await expect(page.locator('.career-marker.side')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Boss: North district street pitch' })).toBeVisible(); // The town's boss, every season until beaten
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
    await expect(card(page)).not.toContainText('Tournament');
    await expect(card(page).locator('h3')).toHaveText('Schools Tournament · Round 1', { timeout: 15000 });
    await expect(card(page).locator('.career-rival canvas')).toBeVisible();
    await expect(card(page)).toContainText('One game');
    await expect(card(page)).toContainText('A defeat knocks you out');
    await expect(card(page)).toContainText(/levels 1 and 2/);
    await expect(card(page).getByRole('button', { name: 'Play the match' })).toBeVisible();
  });

  test('with reduced motion the coach is there at once; a side quest says what it asks and gives', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCareer(page);
    const marker = page.locator('.career-marker.side').first();
    const place = /** @type {string} */ (await marker.getAttribute('data-place'));
    await careerView(page, 'journal');
    await expect(page.locator('#career-journal')).toBeVisible();
    await expect(page.locator('#career-title')).toHaveText('Journal');
    await expect(page.locator(`#career-journal [data-place="${place}"]`)).toContainText('Quest to discover');
    await page.locator(`#career-journal [data-place="${place}"]`).click();
    await expect(page.locator('#career-stage')).toBeVisible();
    await expect(card(page).locator('.career-kind')).toHaveText('Side quest');
    await expect(card(page)).toContainText('Gone once done');
    const title = await card(page).locator('h3').textContent();
    await careerView(page, 'journal');
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

  test('no tabs on the career: the journal, then the club button goes back to the club', async ({ page }) => {
    await openCareer(page);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await careerView(page, 'journal');
    await expect(page.locator('#career-journal')).toContainText('Still in the running.');
    await expect(page.locator('.career-next')).toContainText('Next match: Round 1 against');
    await expect(page.locator('.career-news')).toContainText('Season 1 begins: Schools Tournament.');
    await page.locator('#career-back').click();
    await expect(page.locator('#club-screen')).toBeVisible();
  });

  test('from the club\'s page: Map, Journal and Pieces open the career on that tab', async ({ page }) => {
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    for (const [button, title, panel] of [['Journal', 'Journal', '#career-journal'], ['Pieces', 'Pieces', '#career-guide'], ['Map', 'Map', '#career-stage']]) {
      await page.getByRole('button', { name: 'All Star: my club' }).click();
      await page.getByRole('button', { name: button, exact: true }).click();
      await expect(page.locator('#career-title')).toHaveText(title);
      await expect(page.locator(panel)).toBeVisible();
      // The way back to the club: a button that says it, on a phone too
      const club = page.getByRole('button', { name: 'Club', exact: true });
      await expect(club).toBeVisible();
      await expect(club).toContainText('Club');
      await club.click(); // Back to the club, then the menu
      await page.locator('#club-menu').click();
    }
  });

  test('Gérard\'s tour: big on the screen, he tells where to click and the menus really open', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/?tour');
    await page.evaluate(async (club) => {
      localStorage.removeItem('pawnet.chessdown.tourSeen');
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    const tour = page.getByRole('dialog', { name: /^Gérard · 1\/13$/ });
    await expect(tour).toBeVisible();
    await expect(page.locator('.tour-gerard')).toBeVisible();
    const box = await page.locator('.tour-gerard').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(96); // Gérard, big
    await expect(page.locator('#career-canvas')).toHaveAttribute('data-crest', 'on'); // The crest on the HQ
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => v.id)).toEqual([]);
    const next = page.locator('.tour [data-tour="next"]');
    const doThis = page.locator('#tour-do');
    await next.click();
    await next.click();
    await next.click();
    // He asks for a click on the HQ: the rest is covered, the HQ is open
    await expect(doThis).toHaveText('Click your HQ.');
    await expect(next).toBeHidden();
    await expect(page.locator('.career-marker[data-place="home"]')).toBeFocused();
    await page.locator('.career-marker[data-place="home"]').click();
    await expect(page.locator('#tour-text')).toContainText('Every place has its card');
    await next.click();
    await expect(doThis).toHaveText('Click the stadium.');
    await page.locator('.career-marker.main').click();
    await expect(page.locator('#tour-text')).toContainText('Your next match');
    await expect(card(page).locator('h3')).toContainText('Schools Tournament'); // The card really opened
    await next.click();
    await page.locator('.career-marker.side').first().click();
    await expect(page.locator('#tour-text')).toContainText('A quest’s card');
    for (let i = 0; i < 3; i++) await next.click();
    await expect(page.locator('#tour-text')).toContainText('open from your club’s page');
    await expect(page.locator('.tour-hole')).toBeVisible(); // Around the club button
    await next.click();
    await expect(page.locator('.tour [data-tour="next"]')).toHaveText('Let’s play!');
    await next.click();
    await expect(page.locator('.tour')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pawnet.chessdown.tourSeen'))).toBe('1');
    // Again from its button; Escape ends it
    await page.getByRole('button', { name: 'Tour with Gérard' }).click();
    await expect(page.locator('.tour-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tour')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('on phones: markers of 24 px at least, nothing wider than the screen, the map and the card in view', async ({ page }) => {
    for (const [w, h] of [[320, 568], [375, 812], [667, 375]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openCareer(page);
      const sizes = await page.evaluate(() => [...document.querySelectorAll('.career-marker')].map((m) => m.getBoundingClientRect()).map((r) => [r.width, r.height]));
      expect(sizes.every(([mw, mh]) => mw >= 24 && mh >= 24), `${w}x${h}: ${JSON.stringify(sizes)}`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${w}x${h}: no sideways scroll`).toBe(true);
      const map = await page.locator('#career-map').boundingBox();
      const cardBox = await page.locator('#career-card').boundingBox();
      expect(map.width, `${w}x${h}: a map you can use`).toBeGreaterThan(w > h ? 300 : w - 40);
      expect(cardBox.y + 40, `${w}x${h}: the card starts on screen`).toBeLessThan(h);
      await expect(page.getByRole('button', { name: 'Tour with Gérard' })).toBeVisible(); // An icon, named
    }
  });

  test('the club\'s gear: the Settings, and back to the club, in the new language too', async ({ page }) => {
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#timer-modal')).toBeVisible();
    await page.locator('#btn-save-timer').dispatchEvent('pointerdown'); // Nothing changed: back to the club
    await expect(page.locator('#club-screen')).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Language').selectOption('fr');
    await page.locator('#btn-save-timer').dispatchEvent('pointerdown'); // The page reloads in French
    await expect(page.locator('#club-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Carte', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réglages' })).toBeVisible();
  });

  test('line-ups: built and named on the club page, loaded in one click during the draft', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Line-ups' }).click();
    await expect(page.getByRole('heading', { name: 'Line-ups' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.getByLabel('Name of this line-up').fill('Attack');
    const bench = page.getByRole('group', { name: 'Your players: choose one, then a square' });
    // Without the king: refused
    await bench.getByRole('button', { name: /^Alex\b/ }).click();
    await page.getByRole('button', { name: 'd3: empty' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.lineup-message')).toHaveText('Your king must play: place him first.');
    await bench.getByRole('button', { name: /^The Captain\b/ }).click();
    await page.getByRole('button', { name: 'e1: empty' }).click();
    await expect(page.locator('.lineup-points')).toHaveText('Points: 3/39');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.lineup-message')).toHaveText('“Attack” saved.');
    await expect(page.getByRole('button', { name: '1 · Attack' })).toBeVisible();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null').lineups);
    expect(kept).toEqual([{ name: 'slot1', title: 'Attack', pieces: [{ id: 2, r: 9, c: 3 }, { id: 1, r: 11, c: 4 }] }]);
    await page.getByRole('button', { name: 'Back to the club' }).click();
    // In a tournament match's draft: one click
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    await page.getByRole('button', { name: 'Start the draft' }).click(); // After the tournament's progress
    await page.getByRole('button', { name: 'Load: Attack' }).click();
    await expect(page.locator('#status-bar')).toHaveText('“Attack” loaded.');
    const placed = await page.evaluate(() => chessdown.state.board.flat().filter((p) => p && p.player === 1).map((p) => p.clubId).sort());
    expect(placed).toEqual([1, 2]);
    expect(errors).toEqual([]);
  });

  test('in French', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pawnet.language', 'fr'));
    await openCareer(page);
    await expect(page.locator('#career-title')).toHaveText('Carte');
    await expect(page.getByRole('button', { name: 'Quête principale : Stade municipal Léo-Lagrange' })).toBeVisible();
    await expect(page.locator('#career-gerard-said')).toContainText('Bienvenue en ville, coach !');
  });

  test('from the club\'s page: the first tournament match, no special rule, Gérard\'s lesson and word', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((club) => { if (!localStorage.getItem('pawnet.chessdown.club')) localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)); }, CLUB);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Map' }).click();
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await expect(card(page).locator('.career-lesson')).toContainText('Your first tournament match!');
    await expect(page.locator('#career-gerard-said')).toContainText('Your first tournament match!');
    await expect(card(page)).toContainText('30 seconds a turn');
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    // The bracket first: the tree, the club's next match outlined
    await expect(page.locator('#bracket-screen')).toBeVisible();
    await expect(page.locator('#bracket-view .bt-box.next')).toHaveCount(1);
    await expect(page.locator('#bracket-view .bt-name.you')).toHaveText('Racing Rook');
    await expect(page.locator('#bracket-view')).toContainText('32 clubs still in.');
    await page.getByRole('button', { name: 'Start the draft' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await expect(bench.getByRole('button', { name: /^Place Alex,/ })).toBeEnabled(); // No special rule
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const setup = await page.evaluate(() => ({
      timer: chessdown.state.timerBaseSeconds, format: chessdown.state.series.format, career: chessdown.state.career.kind,
      levels: chessdown.state.board.flat().filter((p) => p && p.player === 2 && p.type !== 'k').map((p) => p.level),
    }));
    expect(setup.timer).toBe(30);
    expect(setup.format).toBe('single');
    expect(setup.career).toBe('league');
    expect(setup.levels.every((level) => level === 1 || level === 2)).toBe(true); // The first round: levels 1 and 2
    // Both sides in their small jerseys: the club's, and the rival's (career-match.js)
    const jerseys = await page.evaluate(() => {
      const dressed = [...document.querySelectorAll('#chessboard .square .piece-jersey')];
      return { count: dressed.length, pieces: chessdown.state.board.flat().filter(Boolean).length, rival: chessdown.state.allStar.rivalJersey };
    });
    expect(jerseys.count).toBe(jerseys.pieces);
    expect(jerseys.rival.primary).toMatch(/^#[0-9a-f]{6}$/i);
    // One game won: through to the second round
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king'));
    await expect(page.locator('#victory-club')).toContainText('Won! Next: Round 2.');
    // The end screen: the progress, the next match or the club
    await expect(page.locator('#victory-bracket .bt-branch.road')).toHaveCount(1); // The road in gold to round 2
    await expect(page.locator('#btn-restart')).toHaveText('Next match');
    await expect(page.locator('#btn-to-club')).toBeVisible();
    await expect(page.locator('#btn-main-menu')).toBeHidden();
    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(page.locator('#bracket-screen')).toBeVisible(); // Straight on: the next match's progress
    await expect(page.locator('#bracket-view .bt-box.next')).toHaveCount(1);
    await expect(page.locator('#bracket-view .bt-name.you')).toHaveCount(2); // Round 1 and round 2
    await page.getByRole('button', { name: 'Back to the map' }).click();
    await expect(page.locator('#career-screen')).toBeVisible();
    const career = await stored(page);
    expect(career.tournament.results).toEqual([{ won: 1, lost: 0 }]);
    await careerView(page, 'journal');
    // The journal: the next match, the news (the match won, the season's start), the bracket folded
    await expect(page.locator('.career-next')).toContainText('Next match: Round 2 against');
    await expect(page.locator('.career-news .news-match.won')).toContainText('Round 1: won 1–0 against');
    await expect(page.locator('.career-news .news-season')).toContainText('Season 1 begins: Schools Tournament.');
    await expect(page.locator('.career-news li').first()).not.toHaveClass(/news-season/); // The latest first
    await expect(page.locator('.career-bracket-tree .bracket-tree')).toBeHidden();
    await page.getByText('Show the bracket').click();
    await expect(page.locator('.career-bracket-tree .bt-box.next')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a draw in a one-game round is played again', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCareer(page);
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    await page.getByRole('button', { name: 'Start the draft' }).click(); // After the tournament's progress
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Draw', '', 0, 'agreement'));
    await expect(page.locator('#victory-club')).toContainText('A draw: the game is played again.');
    await expect(page.locator('#btn-restart')).toHaveText('Play again');
    expect((await stored(page)).tournament.results).toEqual([]);
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
    await expect(page.locator('#victory-club')).toContainText('+5 XP from the quest.');
    const club = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    // +5 for each piece that played (the three pawns); the rook stayed on the bench.
    expect(club.players.filter((p) => p.type === 'p').every((p) => p.xp >= 5 && p.level === 1)).toBe(true);
    expect(club.players.find((p) => p.type === 'r').xp).toBe(0);
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
  /** Player 1 plays a move, then the other side answers: back to player 1 (or the game is over). */
  async function play(page, from, to) {
    await expect.poll(() => page.evaluate(() => chessdown.state.currentPlayer === 1 && !chessdown.state.isAnimating)).toBe(true);
    await page.evaluate(([f, t]) => chessdown.movePiece(f[0], f[1], t[0], t[1]), [from, to]);
    await expect.poll(() => page.evaluate(() => chessdown.state.gameState === 'over' || chessdown.state.lastMove?.piece?.player === 1)).toBe(true);
    await expect.poll(() => page.evaluate(() => chessdown.state.gameState === 'over'
      || (chessdown.state.currentPlayer === 1 && chessdown.state.lastMove?.piece?.player === 2 && !chessdown.state.isAnimating)), { timeout: 15_000 }).toBe(true);
  }

  test('a puzzle: its position without a draft, the other side answering, solved in its moves', async ({ page }) => {
    await withPuzzle(page);
    const rook = await page.evaluate(() => chessdown.state.board[4][4]);
    expect([rook.type, rook.level, rook.player]).toEqual(['r', 1, 1]);
    for (let left = 3; left > 0; left--) {
      if (await page.evaluate(() => chessdown.state.gameState === 'over')) break;
      // The winning move against whatever was answered (the shared solver, bot-search.js)
      const m = await page.evaluate((n) => window.ChessdownBot.puzzleSolution(chessdown.state, n), left);
      expect(m).not.toBeNull();
      if (left === 3) await expect(page.locator('#series-score')).toHaveText('Move 1/3');
      await play(page, [m.fromR, m.fromC], [m.toR, m.toC]);
    }
    await expect(page.locator('#victory-club')).toContainText('Quest done: Sunday jog.', { timeout: 10_000 });
    await expect(page.locator('#victory-club')).toContainText('+5 XP from the quest.');
    const clubRook = (await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'))).players.find((p) => p.type === 'r');
    expect(clubRook.xp).toBeGreaterThanOrEqual(5); // The club's rook played the puzzle's rook
    expect((await stored(page)).questsDone).toEqual(['sunday-jog']);
  });

  test('a puzzle lost: no moves left, no score', async ({ page }) => {
    await withPuzzle(page);
    await play(page, [11, 6], [10, 6]); // The king wanders: no score
    await expect(page.locator('#series-score')).toHaveText('Move 2/3');
    await play(page, [10, 6], [11, 6]);
    await play(page, [11, 6], [10, 6]);
    await expect(page.locator('#victory-reason')).toHaveText('No moves left: no score yet.', { timeout: 10_000 });
    await expect(page.locator('#victory-club')).toContainText('Quest failed: Sunday jog.');
    const career = await stored(page);
    expect(career.questsDone).toEqual([]);
    expect(career.quests.attempted).toEqual(['sunday-jog']);
  });

  /** The career in the county with these quests on the map (the school season won). */
  async function inCounty(page, drawn) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async ({ club, drawn }) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const Career = /** @type {any} */ (window).ChessdownCareer;
      let c = Career.newCareer(5);
      while (Career.nextMatch(c)) { const m = Career.nextMatch(c); c = Career.recordSeries(c, m.format === 'bo3' ? { won: 2, lost: 0 } : { won: 1, lost: 0 }); }
      c = Career.travel(Career.finishSeason(c).career, 'county');
      c.quests = { drawn, attempted: [] };
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, { club: CLUB, drawn });
  }

  test('a quest missed with the game won: the end screen says Defeat; only the club wears a jersey in a quest', async ({ page }) => {
    await inCounty(page, ['clean-harvest', 'old-bull', 'ploughing', 'veteran']);
    await page.locator('.career-marker.side').first().click();
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => chessdown.state.allStar.rivalJersey)).toBeNull(); // Jerseys on both sides: the tournament only
    const mine = await page.evaluate(() => chessdown.state.board.flat().filter((p) => p && p.player === 1).length);
    await expect(page.locator('#chessboard .square .piece-jersey')).toHaveCount(mine);
    // The game won, but a piece was lost: no clean sheet
    await page.evaluate(async () => {
      chessdown.state.career.lostPiece = true;
      (await import('/chessdown/js/gameplay.js')).endGame('Victory!', '', 1, 'king');
    });
    await expect(page.locator('#victory-title')).toHaveText('Defeat...');
    await expect(page.locator('#victory-club')).toContainText('Quest failed');
  });

  test('a boss: its portrait and fixed army on the card, the same army on the board', async ({ page }) => {
    await inCounty(page, ['old-bull', 'mud-match', 'ploughing', 'veteran']);
    // On the map: a horned skull for the boss, a crown for the championship
    await expect(page.getByRole('button', { name: 'Boss: Moulin farm' }).locator('svg.pixel-icon.skull')).toBeVisible();
    await expect(page.locator('.career-marker.main svg.pixel-icon.crown')).toBeVisible();
    await page.getByRole('button', { name: 'Boss: Moulin farm' }).click();
    await expect(card(page).locator('h3')).toHaveText('The old bull');
    await expect(card(page).locator('.career-kind')).toHaveText('Boss');
    await expect(card(page).locator('.career-rival')).toContainText('Marcel Taureau');
    await expect(card(page)).toContainText('Boss: Expert bot, a fixed army: ♜ Rook 4★, ♜ Rook 4★');
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const theirs = await page.evaluate(() => chessdown.state.board.flat().filter((p) => p && p.player === 2).map((p) => `${p.type}${p.level || ''}`).sort());
    expect(theirs).toEqual(['k', 'r4', 'r4']);
    expect(await page.evaluate(() => chessdown.state.allStar.rivalJersey)).toBeNull(); // A boss wears no jersey
  });

  test('the pieces\' guide: only the levels unlocked; a click on a boss\'s piece tells what it does', async ({ page }) => {
    const errors = trackPageErrors(page);
    await inCounty(page, ['old-bull', 'mud-match', 'ploughing', 'veteran']);
    await careerView(page, 'guide');
    const rook = page.getByRole('region', { name: 'Rook' });
    await expect(rook.locator('li').nth(0)).toContainText('Straight lines, 3 squares at most.'); // The club's rook: level 1
    await expect(rook.locator('li').nth(1)).toContainText('Not discovered yet');
    await expect(rook.locator('li').nth(2)).toContainText('The classic rook'); // Level 3 always shows
    await expect(rook.locator('li').nth(3)).toContainText('Not discovered yet');
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => v.id)).toEqual([]);
    // The boss: its level 4 rooks
    await careerView(page, 'map');
    await page.getByRole('button', { name: 'Boss: Moulin farm' }).click();
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const at = await page.evaluate(() => {
      const b = chessdown.state.board;
      for (let r = 0; r < 12; r++) for (let c = 0; c < 8; c++) if (b[r][c] && b[r][c].player === 2 && b[r][c].type === 'r') return [r, c];
      return null;
    });
    await page.locator(`#chessboard .square[data-vr="${at[0]}"][data-vc="${at[1]}"]`).click();
    const info = page.getByRole('dialog', { name: 'Rook, level 4' });
    await expect(info).toBeVisible();
    await expect(info).toContainText('The classic rook'); // Level 3 and its level 4 bonus
    await expect(info).toContainText('Also hops over a piece of its own side');
    await expect(info.getByRole('button', { name: 'Close' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(info).toHaveCount(0);
    // Met in a match: level 4 shows in the guide from now on
    const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.seen') || '{}'));
    expect(seen.r).toEqual([4]);
    expect(errors).toEqual([]);
  });

  test('touchdowns off: a piece in the end zone wins nothing; the rule is on the card', async ({ page }) => {
    await inCounty(page, ['mud-match', 'old-bull', 'ploughing', 'veteran']);
    await page.getByRole('button', { name: 'Side quest: Carp pond' }).click();
    await expect(card(page)).toContainText('Touchdowns do not count: take the king');
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    // A piece of ours stands in the end zone as our turn starts: the game goes on.
    await page.evaluate(async () => {
      const s = chessdown.state;
      s.board[0][0] = { type: 'r', player: 1, hasMoved: true, level: 1 };
      s.currentPlayer = 1;
      (await import('/chessdown/js/gameplay.js')).startTurn();
    });
    await expect(page.locator('#victory-screen')).toBeHidden();
    expect(await page.evaluate(() => chessdown.state.gameState)).toBe('gameplay');
  });

  test('holding out: once the other side has played its moves, the game is won', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async (club) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const c = /** @type {any} */ (window).ChessdownCareer.newCareer(8);
      c.quests = { drawn: ['hide-and-seek', 'street-match', 'counter-bet', 'shy-knight'], attempted: [] };
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    await page.getByRole('button', { name: 'Side quest: Lime Tree Park' }).click();
    await expect(card(page)).toContainText('Hold out for 10 of their moves (or win before)');
    await card(page).getByRole('button', { name: 'Accept' }).click();
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => { chessdown.state.career.opponentMoves = 9; }); // Nine moves held already
    // Our moves (the king steps back and forth) until the other side plays its tenth.
    for (let i = 0; i < 3; i++) {
      if (await page.locator('#victory-screen').isVisible()) break;
      await expect.poll(() => page.evaluate(() => chessdown.state.gameState === 'over' || (chessdown.state.currentPlayer === 1 && !chessdown.state.isAnimating)), { timeout: 15_000 }).toBe(true);
      if (await page.evaluate(() => chessdown.state.gameState === 'over')) break;
      await page.evaluate(() => {
        const s = chessdown.state;
        const m = chessdown.generateAllMoves(1)[0];
        chessdown.movePiece(m.fromR, m.fromC, m.toR, m.toC);
      });
    }
    await expect(page.locator('#victory-reason')).toHaveText('You held out for 10 moves!', { timeout: 15_000 });
    await expect(page.locator('#victory-club')).toContainText('Quest done: Hide and seek.');
  });

  test('knocked out: the screen goes black, Gérard says it is over; then the next season from the stadium', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/chessdown/');
    await page.evaluate(async (club) => {
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club));
      const Career = /** @type {any} */ (window).ChessdownCareer;
      let c = Career.newCareer(8);
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(club);
    }, CLUB);
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await expect(card(page)).toContainText('A defeat knocks you out');
    await card(page).getByRole('button', { name: 'Play the match' }).click();
    await page.getByRole('button', { name: 'Start the draft' }).click(); // After the tournament's progress
    const bench = page.getByRole('group', { name: 'Your squad: choose a player, then a square' });
    await bench.getByRole('button', { name: /^Place The Captain,/ }).click();
    await page.locator('#chessboard .square[data-vr="5"][data-vc="4"]').click();
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    await page.evaluate(async () => (await import('/chessdown/js/gameplay.js')).endGame('Defeat...', '', 2, 'king'));
    await expect(page.locator('#victory-club')).toContainText('Knocked out: place 17.');
    await expect(page.locator('#btn-restart')).toBeHidden(); // No next match: only the club
    await page.locator('#btn-to-club').click();
    await expect(page.locator('#club-screen')).toBeVisible();
    // The black screen, over the club
    const out = page.getByRole('alertdialog', { name: 'It is over' });
    await expect(out).toBeVisible();
    await expect(out).toContainText('Knocked out, coach: the Schools Tournament is over for us. Place 17.');
    await expect(out).toContainText('All we can do now is wait for next season.');
    await expect(out.getByRole('button', { name: 'Understood' })).toBeFocused();
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()).violations.map((v) => v.id)).toEqual([]);
    await out.getByRole('button', { name: 'Understood' }).click();
    await expect(out).toBeHidden();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    // The side quests are still there; the stadium starts the next season
    await expect(page.locator('.career-marker.side, .career-marker.boss')).toHaveCount(4);
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    await expect(card(page)).toContainText('The tournament is over for the club: place 17.');
    await card(page).getByRole('button', { name: 'Start the next season' }).click();
    await expect(page.locator('#career-gerard-said')).toContainText('Season 2: a new tournament');
    const career = await stored(page);
    expect([career.season, career.tournament.results]).toEqual([2, []]);
    expect(errors).toEqual([]);
  });

  test('the seasons in charge of the club, shown in a corner of the map; the time still kept', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openCareer(page);
    const helm = page.locator('#career-date');
    await expect(helm).toContainText(test.info().project.name === 'mobile' ? 'Season 1' : 'Season 1 in charge of the club');
    await page.getByRole('button', { name: 'Main quest: Léo-Lagrange municipal stadium' }).click();
    const minutes = (await stored(page)).minutes;
    expect(minutes).toBeGreaterThan(0); // The walk took time
    await page.reload(); // Kept with the career
    await page.evaluate(async () => (await import('/chessdown/js/events.js')).openCareerPage(JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null')));
    expect((await stored(page)).minutes).toBe(minutes);
    // A second season: the count goes on
    await page.evaluate(async () => {
      const Career = /** @type {any} */ (window).ChessdownCareer;
      const c = Career.finishSeason(Career.recordSeries(JSON.parse(localStorage.getItem('pawnet.chessdown.career') || 'null'), { won: 0, lost: 1 })).career;
      localStorage.setItem('pawnet.chessdown.career', JSON.stringify(c));
      (await import('/chessdown/js/events.js')).openCareerPage(JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    });
    await expect(helm.locator(test.info().project.name === 'mobile' ? '.helm-short' : '.helm-long')).toHaveText(test.info().project.name === 'mobile' ? 'Season 2' : 'Season 2 in charge of the club');
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
