// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// The career's screen (js/career-view.js, js/career-map.js; docs/games/chessdown-career.md):
// the map of the tier, a button per place, the card shown only once the coach gets there,
// the transport and its ticket, the journal behind a tab. Not on the menus yet (its matches
// open in the next step): the tests open it from events.js.

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
});
