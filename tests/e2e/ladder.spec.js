// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, signedInContext, trackPageErrors } = require('./helpers');

// Chessdown online with an account (docs/games/chessdown-ladders.md): the club and career
// kept with the account (js/cloud-save.js).

const CLUB = {
  version: 1, coach: 'Etienne', name: 'Racing Rook', primary: '#7b1e3a', secondary: '#c9a227',
  pattern: 'stripes', shape: 'shield', emblem: 'wolf', season: 1, tier: 'school', recruits: 0, lineups: [],
  players: [['k', 'The Captain', 5], ['r', 'Alex', 1], ['n', 'Lina', 1], ['b', 'Hugo', 1], ['p', 'Noah', 1], ['p', 'Mila', 1], ['p', 'Sam', 1]]
    .map(([type, name, level], i) => ({ id: i + 1, type, name, level, xp: 0, stats: { games: 0, moves: 0, captures: 0, captured: 0, touchdowns: 0 } })),
};

const storedClub = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));

test.describe('Chessdown with an account', () => {
  test('the club follows the account: sent from one browser, found in another, changes kept', async ({ browser }) => {
    const { context } = await signedInContext(browser);
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await page.evaluate((club) => localStorage.setItem('pawnet.chessdown.club', JSON.stringify(club)), CLUB);
    await page.reload(); // Signed in, a club here and none on the account: it is sent
    await expect.poll(async () => (await (await context.request.get('/api/account/chessdown')).json()).club?.name).toBe('Racing Rook');

    // Another browser, same account: the account's club arrives.
    const other = await browser.newContext();
    await blockExternalRequests(other);
    await other.addCookies(await context.cookies());
    const page2 = await other.newPage();
    await page2.goto('/chessdown/');
    await expect.poll(async () => (await storedClub(page2))?.name).toBe('Racing Rook');

    // A change there reaches the account.
    await page2.evaluate(async () => {
      const store = await import('/chessdown/js/club-store.js');
      const club = store.loadClub();
      store.saveClub({ ...club, name: 'Racing Queen' });
    });
    await expect.poll(async () => (await (await context.request.get('/api/account/chessdown')).json()).club?.name).toBe('Racing Queen');
    expect(errors).toEqual([]);
    await other.close();
    await context.close();
  });
});
