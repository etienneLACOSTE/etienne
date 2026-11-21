// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { ORIGIN, blockExternalRequests, signedInContext, trackPageErrors } = require('./helpers');

// Chessdown online with an account (docs/games/chessdown-ladders.md): the club and career
// kept with the account (js/cloud-save.js), All Star rooms (the server drafts from the
// account's club), the ranked queue and the leaderboards (js/ladder-view.js).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

/** A signed-in player with a page that has socket.io helpers (window.T); `club`: kept on the account. */
async function player(browser, club = null) {
  const { context, name } = await signedInContext(browser);
  if (club) {
    const res = await context.request.put('/api/account/chessdown', { headers: { origin: ORIGIN }, data: { club } });
    expect(res.ok()).toBe(true);
  }
  const page = await context.newPage();
  await page.goto('/chessdown/');
  await page.evaluate(() => {
    window.T = {
      connect: () => new Promise((resolve) => { const s = io('/chessdown', { forceNew: true }); s.on('connect', () => resolve(s)); }),
      once: (s, event, ms = 2000) => new Promise((resolve) => {
        const t = setTimeout(() => resolve(undefined), ms);
        s.once(event, (data) => { clearTimeout(t); resolve(data === undefined ? true : data); });
      }),
    };
  });
  return { context, page, name };
}

test.describe('Online All Star and ladders', () => {
  test('All Star room: each side drafts its own club, checked by the server', async ({ browser }) => {
    const a = await player(browser, CLUB);
    const b = await player(browser, { ...CLUB, name: 'Blue Bishops' });
    const pumped = { ...CLUB, players: CLUB.players.map((p) => (p.type === 'r' ? { ...p, level: 5 } : p)) };
    const cheat = await player(browser, pumped);
    const none = await player(browser);

    // A club whose levels do not match its experience may not play online.
    expect(await cheat.page.evaluate(async () => {
      const s = await T.connect();
      const error = T.once(s, 'errorMsg');
      s.emit('createRoom', { mode: 'allstar', format: 'single' });
      return error;
    })).toBe('Your club cannot play online: its levels do not match its experience.');

    await a.page.evaluate(async () => {
      window.me = await T.connect();
      window.code = await new Promise((r) => { me.once('roomCreated', r); me.emit('createRoom', { mode: 'allstar', format: 'single' }); });
    });
    const code = await a.page.evaluate(() => window.code);
    // No club: cannot join an All Star room.
    expect(await none.page.evaluate(async (code) => {
      const s = await T.connect();
      const error = T.once(s, 'errorMsg');
      s.emit('joinRoom', code);
      return error;
    }, code)).toBe('Create your All Star club first.');

    const clubA = a.page.evaluate(() => T.once(me, 'allStarClub'));
    const started = await b.page.evaluate(async (code) => {
      window.me = await T.connect();
      const started = T.once(me, 'gameStarted');
      window.club = T.once(me, 'allStarClub');
      me.emit('joinRoom', code);
      return started;
    }, code);
    expect(started.roomState.mode).toBe('allstar');
    expect(started.roomState.clubNames).toEqual({ 1: 'Racing Rook', 2: 'Blue Bishops' });
    expect((await clubA).club.name).toBe('Racing Rook');
    expect((await b.page.evaluate(() => window.club)).club.name).toBe('Blue Bishops');

    // Refused: a player not in the club, or the same player twice.
    for (const pieces of [[{ r: 11, c: 4, clubId: 1 }, { r: 9, c: 3, clubId: 99 }], [{ r: 11, c: 4, clubId: 1 }, { r: 9, c: 3, clubId: 2 }, { r: 9, c: 4, clubId: 2 }]]) {
      expect(await a.page.evaluate(async ({ code, pieces }) => {
        const refused = T.once(me, 'draftRefused');
        me.emit('draftComplete', { roomCode: code, player: 1, color: 'red', pieces });
        return refused;
      }, { code, pieces })).toEqual({ reason: 'army' });
    }
    // Accepted: the server puts each club player at its own level (the rook: level 1).
    const ended = a.page.evaluate(() => T.once(me, 'draftPhaseEnded', 4000));
    await a.page.evaluate((code) => me.emit('draftComplete', { roomCode: code, player: 1, color: 'red', pieces: [{ r: 11, c: 4, clubId: 1, type: 'k' }, { r: 9, c: 3, clubId: 2, type: 'q', level: 5 }] }), code);
    await b.page.evaluate((code) => me.emit('draftComplete', { roomCode: code, player: 2, color: 'red', pieces: [{ r: 0, c: 3, clubId: 1 }] }), code);
    const state = (await ended).roomState;
    expect(state.board[9][3]).toMatchObject({ type: 'r', level: 1, player: 1, clubId: 2 });
    expect(state.playerColors[1]).not.toBe(state.playerColors[2]); // Same jersey picked: the second seat changes
    for (const p of [a, b, cheat, none]) await p.context.close();
  });

  // The queue is shared by every test running at once: the Classic queue is only used by the
  // desktop tests of this file (one worker, in order), the All Star queue by the mobile one.
  test('ranked queue: two players are paired for a best of 3; leaving it loses it on the ladder', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Server logic; the Classic queue is the desktop tests\' own');
    const a = await player(browser);
    const b = await player(browser);
    const queued = await a.page.evaluate(async () => {
      window.me = await T.connect();
      const joined = T.once(me, 'queueJoined');
      window.match = T.once(me, 'rankedMatch', 5000);
      me.emit('joinQueue', { mode: 'classic' });
      return joined;
    });
    expect(queued).toEqual({ mode: 'classic', rating: 1000 });
    const matchB = await b.page.evaluate(async () => {
      window.me = await T.connect();
      const match = T.once(me, 'rankedMatch', 5000);
      window.started = T.once(me, 'gameStarted', 5000);
      me.emit('joinQueue', { mode: 'classic' });
      return match;
    });
    const matchA = await a.page.evaluate(() => window.match);
    expect(matchA.roomCode).toBe(matchB.roomCode);
    expect(matchA.opponent).toEqual({ username: b.name, rating: 1000 });
    expect(new Set([matchA.playerNumber, matchB.playerNumber])).toEqual(new Set([1, 2]));
    const started = await b.page.evaluate(() => window.started);
    expect(started.roomState).toMatchObject({ ranked: true, mode: 'classic', series: { format: 'bo3' } });

    // A leaves: B wins the series on the ladder.
    const result = b.page.evaluate(() => T.once(me, 'ladderResult', 5000));
    await a.page.evaluate((code) => me.emit('leaveRoom', { roomCode: code }), matchA.roomCode);
    expect(await result).toEqual({ mode: 'classic', counted: true, before: 1000, after: 1024 });
    const board = await (await b.context.request.get('/api/ladders/classic')).json();
    expect(board.me).toMatchObject({ rating: 1024, wins: 1, series: 1 });
    expect(board.top.find((r) => r.username === b.name)).toMatchObject({ rating: 1024 });
    await a.context.close();
    await b.context.close();
  });

  test('the menu: ranked queue screen, cancel; the leaderboard with its tabs', async ({ browser }, testInfo) => {
    const allStar = testInfo.project.name === 'mobile';
    const { context } = await signedInContext(browser);
    if (allStar) await context.request.put('/api/account/chessdown', { headers: { origin: ORIGIN }, data: { club: CLUB } });
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    if (allStar) await expect.poll(async () => (await storedClub(page))?.name).toBe('Racing Rook'); // From the account
    await page.screenshot({ path: test.info().outputPath('menu.png') });
    await page.getByRole('button', { name: 'Ranked match' }).click();
    if (allStar) await page.getByRole('button', { name: 'All Star: each side drafts its club' }).click(); // Without a club: Classic
    await expect(page.locator('#queue-screen')).toBeVisible();
    await expect(page.locator('#queue-info')).toHaveText(`${allStar ? 'All Star' : 'Classic'} ladder · your rating: 1000. A best of 3 against a player of your level.`);
    await expect(page.locator('#queue-time')).toContainText('Waiting for 0:0');
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`)).toEqual([]);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#main-menu')).toBeVisible();

    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await expect(page.locator('#ladder-screen')).toBeVisible();
    const panel = page.getByRole('tabpanel');
    await expect(panel).toContainText('You have not played a ranked series this month: your rating is 1000.');
    await expect(panel).toContainText(/Season of \w+ \d{4}: \d+ days left\./);
    await page.getByRole('tab', { name: 'Classic' }).press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'All Star' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'All Star' })).toBeFocused();
    await expect(panel).toContainText('your rating is 1000');
    expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`)).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('leaderboard.png') });
    await page.getByRole('button', { name: 'Back to the menu' }).click();
    await expect(page.locator('#main-menu')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  });
});

test('account page: hide me from the public leaderboard, kept by the server', async ({ browser }) => {
  const { context } = await signedInContext(browser);
  const page = await context.newPage();
  await page.goto('/account/');
  const box = page.getByRole('checkbox', { name: 'Hide me from the public leaderboard' });
  await expect(box).not.toBeChecked();
  await box.check();
  await expect.poll(async () => (await (await context.request.get('/api/account')).json()).account.ladderHidden).toBe(true);
  await page.reload();
  await expect(box).toBeChecked();
  expect((await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('account.png'), fullPage: true });
  await context.close();
});
