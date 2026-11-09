// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Stats of signed-in players: online games recorded by the server for both players,
// games against the bot sent by the page, all shown on the account page.

const ORIGIN = 'http://127.0.0.1:3100';

async function signedInContext(browser) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = `s${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  const res = await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  expect(res.ok()).toBe(true);
  return { context, name };
}

test.describe('Stats', () => {
  test('an online Chessdown game is recorded by the server for both signed-in players', async ({ browser }) => {
    const a = await signedInContext(browser);
    const b = await signedInContext(browser);
    const [pa, pb] = [await a.context.newPage(), await b.context.newPage()];
    for (const p of [pa, pb]) await p.goto('/chessdown/');

    // Player 1: king (11,4) and rook (9,3). Player 2: king (0,3). The rook takes the king.
    await pa.evaluate(() => {
      const s = io('/chessdown', { forceNew: true });
      window.s = s;
      window.ended = new Promise((r) => s.on('draftPhaseEnded', (d) => r(d.roomState.currentPlayer)));
      window.code = new Promise((r) => s.once('roomCreated', r));
      // Player 1 sends their draft once the second player is in (the room is drafting).
      s.once('gameStarted', async () => s.emit('draftComplete', {
        roomCode: await window.code, player: 1, color: 'blue', pieces: [{ r: 11, c: 4, type: 'k' }, { r: 9, c: 3, type: 'r' }],
      }));
      s.emit('createRoom', {});
    });
    const code = await pa.evaluate(() => window.code);
    await pb.evaluate((c) => {
      const s = io('/chessdown', { forceNew: true });
      window.s = s;
      s.once('gameStarted', () => s.emit('draftComplete', { roomCode: c, player: 2, color: 'red', pieces: [{ r: 0, c: 3, type: 'k' }] }));
      s.emit('joinRoom', c);
    }, code);
    const starter = await pa.evaluate(() => window.ended);
    if (starter === 2) { // Black's king steps forward, still on the rook's column
      const moved = pa.evaluate(() => new Promise((r) => window.s.once('moveMade', () => r(true))));
      await pb.evaluate((c) => window.s.emit('makeMove', { roomCode: c, from: { r: 0, c: 3 }, to: { r: 1, c: 3 } }), code);
      await moved;
    }
    const kingRow = starter === 2 ? 1 : 0;
    await pa.evaluate(([c, row]) => window.s.emit('makeMove', { roomCode: c, from: { r: 9, c: 3 }, to: { r: row, c: 3 } }), [code, kingRow]);

    const online = async (ctx) => (await (await ctx.request.get('/api/account/stats')).json()).games.chessdown.modes.online;
    await expect.poll(() => online(a.context)).toEqual({ wins: 1, losses: 0, draws: 0 });
    await expect.poll(() => online(b.context)).toEqual({ wins: 0, losses: 1, draws: 0 });
    const recent = (await (await b.context.request.get('/api/account/stats')).json()).recent;
    expect(recent[0]).toMatchObject({ game: 'chessdown', mode: 'online', result: 'loss', reason: 'king', opponent: a.name });
    await a.context.close();
    await b.context.close();
  });

  test("a Ches'spell game against the bot is sent by the page and shown on the account page", async ({ browser }) => {
    const { context } = await signedInContext(browser);
    const page = await context.newPage();
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/');
    // A deck for the account, then the campaign
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    for (const id of [8, 15, 12]) await page.locator(`#deck-grid .spell-card[data-id="${id}"] .card-main`).click();
    await page.getByRole('button', { name: 'Save Deck' }).click();
    await expect(page.locator('#deck-status')).toContainText('saved on your account');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await page.locator('#btn-confirm-campaign').click();
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await page.evaluate(() => { // A white queen on e7 takes the black king
      chesspell.engine.board[1][4] = 'Q';
      chesspell.engine.move(1, 4, 0, 4);
    });
    await expect(page.getByRole('dialog', { name: 'Victory' })).toBeVisible();

    await page.goto('/account/');
    await expect(page.locator('.stats-game h3')).toHaveText(["Ches'spell"]);
    await expect(page.locator('.stats-game tbody tr')).toHaveText(['Against the bot100']);
    await expect(page.locator('#recent-games li').first()).toContainText("WonChes'spell against Bot (");
    expect(errors).toEqual([]);
    await context.close();
  });
});
