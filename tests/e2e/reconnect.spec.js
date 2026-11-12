// @ts-check
const { test, expect } = require('@playwright/test');
const { answerDialog, blockExternalRequests, trackPageErrors } = require('./helpers');

// A connection that drops in the middle of an online game keeps its seat for a while
// (server/socket-utils.js seatKeeper, SEAT_HOLD_MS = 3 s in the tests): it comes back
// with the messages it missed and the game goes on. Too late, the game counts as left.

const ORIGIN = 'http://127.0.0.1:3100';
const KINGS = { 1: [{ r: 11, c: 4, type: 'k' }], 2: [{ r: 0, c: 3, type: 'k' }] };

async function signedInContext(browser) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = `r${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  const res = await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  expect(res.ok()).toBe(true);
  return { context, name };
}

/**
 * Two raw connections in an online Chessdown game (kings only). Each page keeps its
 * connection in window.s and every event it received in window.seen.
 * @returns the room code and who moves first
 */
async function onlineChessdown(pa, pb) {
  for (const p of [pa, pb]) {
    await p.goto('/chessdown/');
    await p.evaluate(() => {
      const s = io('/chessdown', { forceNew: true });
      window.s = s;
      window.seen = [];
      s.onAny((event) => window.seen.push(event));
    });
  }
  await pa.evaluate((pieces) => {
    window.ended = new Promise((r) => window.s.on('draftPhaseEnded', (d) => r(d.roomState.currentPlayer)));
    window.code = new Promise((r) => window.s.once('roomCreated', r));
    window.s.once('gameStarted', async () => window.s.emit('draftComplete', { roomCode: await window.code, player: 1, color: 'blue', pieces }));
    window.s.emit('createRoom', {});
  }, KINGS[1]);
  const code = await pa.evaluate(() => window.code);
  await pb.evaluate(([c, pieces]) => {
    window.s.once('gameStarted', () => window.s.emit('draftComplete', { roomCode: c, player: 2, color: 'red', pieces }));
    window.s.emit('joinRoom', c);
  }, [code, KINGS[2]]);
  const starter = await pa.evaluate(() => window.ended);
  return { code, starter };
}

/** The page's connection drops, and does not come back by itself. */
const dropConnection = (page) => page.evaluate(() => {
  window.s.io.reconnection(false);
  window.s.io.engine.close();
});
const seen = (page) => page.evaluate(() => window.seen);

test.describe('Reconnection', () => {
  test('a dropped connection comes back with the moves it missed, and the game goes on', async ({ browser }) => {
    const a = await signedInContext(browser);
    const b = await signedInContext(browser);
    const [pa, pb] = [await a.context.newPage(), await b.context.newPage()];
    const { code, starter } = await onlineChessdown(pa, pb);
    const pages = { 1: pa, 2: pb };
    const mover = pages[starter];
    const away = pages[starter === 1 ? 2 : 1];
    const kingOf = { 1: { r: 11, c: 4 }, 2: { r: 0, c: 3 } };
    const step = { 1: { r: 11, c: 5 }, 2: { r: 0, c: 2 } };

    await dropConnection(away);
    await expect.poll(() => seen(mover)).toContain('opponentDisconnected');
    // The player who stays moves while the other is away.
    await mover.evaluate(([c, f, t]) => window.s.emit('makeMove', { roomCode: c, from: f, to: t }), [code, kingOf[starter], step[starter]]);
    await expect.poll(() => seen(mover)).toContain('moveMade');

    await away.evaluate(() => window.s.connect());
    await expect.poll(() => away.evaluate(() => window.s.recovered)).toBe(true);
    await expect.poll(() => seen(mover)).toContain('opponentReconnected');
    expect(await seen(away)).toContain('moveMade'); // The move it missed

    // Its turn now: the server still knows it.
    const other = starter === 1 ? 2 : 1;
    const moved = mover.evaluate(() => new Promise((r) => window.s.once('moveMade', (d) => r(d.nextPlayer))));
    await away.evaluate(([c, f, t]) => window.s.emit('makeMove', { roomCode: c, from: f, to: t }), [code, kingOf[other], step[other]]);
    expect(await moved).toBe(starter);

    // Nothing was recorded: the game is still in progress.
    const online = async (ctx) => (await (await ctx.request.get('/api/account/stats')).json()).games.chessdown.modes.online;
    expect(await online(a.context)).toEqual({ wins: 0, losses: 0, draws: 0 });
    await a.context.close();
    await b.context.close();
  });

  test('a connection that does not come back in time loses the game', async ({ browser }) => {
    const a = await signedInContext(browser);
    const b = await signedInContext(browser);
    const [pa, pb] = [await a.context.newPage(), await b.context.newPage()];
    await onlineChessdown(pa, pb);

    await dropConnection(pb);
    await expect.poll(() => seen(pa), { timeout: 8000 }).toContain('opponentLeft');
    const stats = async (ctx) => (await (await ctx.request.get('/api/account/stats')).json());
    await expect.poll(async () => (await stats(a.context)).games.chessdown.modes.online).toEqual({ wins: 1, losses: 0, draws: 0 });
    expect((await stats(b.context)).recent[0]).toMatchObject({ result: 'loss', reason: 'forfeit', opponent: a.name });

    // Coming back later: the page learns that its seat is gone.
    await pb.evaluate(() => window.s.connect());
    await expect.poll(() => seen(pb)).toContain('seatLost');
    await a.context.close();
    await b.context.close();
  });

  test('Chessdown page: a notice while the connection is lost, and while the opponent is away', async ({ browser }) => {
    const ctx = await browser.newContext();
    const other = await browser.newContext();
    for (const c of [ctx, other]) await blockExternalRequests(c);
    const page = await ctx.newPage();
    const opponent = await other.newPage();
    const errors = trackPageErrors(page);
    const notice = page.locator('.connection-notice');

    await page.goto('/chessdown/');
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/); // Not the placeholder
    const code = await page.locator('#waiting-room-code').textContent();

    // Our own connection drops: the page says so, and the room is still ours afterwards.
    await page.evaluate(async () => {
      const { socket } = await import('/chessdown/js/state.js');
      socket.io.reconnection(false);
      socket.io.engine.close();
    });
    await expect(notice).toHaveText('Connection lost. Reconnecting…');
    await expect(notice).toHaveAttribute('role', 'status');
    await page.evaluate(async () => (await import('/chessdown/js/state.js')).socket.connect());
    await expect(notice).toHaveCount(0);

    await opponent.goto('/chessdown/');
    await opponent.evaluate((c) => {
      window.s = io('/chessdown', { forceNew: true });
      window.s.emit('joinRoom', c);
    }, code);
    await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toBe('draft1'); // Both players are in: the draft starts

    // The opponent's connection drops: a countdown, then the game is left.
    await dropConnection(opponent);
    await expect(notice).toContainText('Your opponent lost their connection. Waiting for them:');
    await expect(notice.locator('.connection-countdown')).toHaveText(/^[0-3] s$/);
    await answerDialog(page, 'Your opponent left the game.');
    await expect(notice).toHaveCount(0);
    await expect(page.locator('#main-menu')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
    await other.close();
  });

  test('Chessdown page: back too late, the page says the game could not be resumed', async ({ browser }) => {
    const ctx = await browser.newContext();
    const other = await browser.newContext();
    for (const c of [ctx, other]) await blockExternalRequests(c);
    const page = await ctx.newPage();
    const opponent = await other.newPage();

    await page.goto('/chessdown/');
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/); // Not the placeholder
    const code = await page.locator('#waiting-room-code').textContent();
    await opponent.goto('/chessdown/');
    await opponent.evaluate((c) => {
      window.s = io('/chessdown', { forceNew: true });
      window.seen = [];
      window.s.onAny((event) => window.seen.push(event));
      window.s.emit('joinRoom', c);
    }, code);
    await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toBe('draft1');

    await page.evaluate(async () => {
      const { socket } = await import('/chessdown/js/state.js');
      socket.io.reconnection(false);
      socket.io.engine.close();
    });
    await expect.poll(() => seen(opponent), { timeout: 8000 }).toContain('opponentLeft');
    await page.evaluate(async () => (await import('/chessdown/js/state.js')).socket.connect());
    await answerDialog(page, 'Connection lost: the game could not be resumed.');
    await expect(page.locator('#main-menu')).toBeVisible();
    await ctx.close();
    await other.close();
  });
});
