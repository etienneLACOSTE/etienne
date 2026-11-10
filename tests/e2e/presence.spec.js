// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Friends online: who is online and where, and an invitation straight into a game.

const ORIGIN = 'http://127.0.0.1:3100';

async function signedIn(browser, deck) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = `o${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  const post = (url, data) => context.request.post(url, { headers: { origin: ORIGIN }, data });
  await post('/api/auth/signup', { username: name, email: `${name}@example.com`, password: 'correct horse battery' });
  if (deck) await context.request.put('/api/account/decks/chesspell', { headers: { origin: ORIGIN }, data: { deck } });
  return { context, name, post, page: await context.newPage() };
}

test("a friend sees who is online and where, and joins a Ches'spell room from an invitation", async ({ browser }) => {
  const alice = await signedIn(browser, [8, 15, 12]);
  const bob = await signedIn(browser, [1, 5, 14]);
  await alice.post('/api/friends/requests', { username: bob.name });
  await bob.post(`/api/friends/requests/${alice.name}/accept`, {});
  const errors = [alice.page, bob.page].map(trackPageErrors);

  // Bob is on his account page; Alice opens Ches'spell
  await bob.page.goto('/account/');
  await expect(bob.page.locator('#friends-list')).toContainText(`${alice.name}Offline`);
  await alice.page.goto('/chesspell/');
  await expect(bob.page.locator('#friends-list')).toContainText("Online, playing Ches'spell");

  // Alice creates a room and invites Bob
  await alice.page.getByRole('button', { name: 'Online Multiplayer' }).click();
  await expect(alice.page.locator('#online-p1-select')).toHaveValue('account');
  await alice.page.locator('#btn-create-room').click();
  await expect(alice.page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
  await alice.page.getByRole('button', { name: `Invite ${bob.name} (on the site)` }).click();
  await expect(alice.page.locator('.invite-status')).toHaveText(`Invitation sent to ${bob.name}.`);

  // Bob gets the invitation on the account page and joins
  const invitation = bob.page.getByRole('alertdialog', { name: 'Invitation' });
  await expect(invitation).toContainText(`${alice.name} invites you to play Ches'spell.`);
  await invitation.getByRole('button', { name: 'Join' }).click();
  await expect(bob.page).toHaveURL(/\/chesspell\/\?join=[A-Z]{6}$/);
  for (const page of [alice.page, bob.page]) {
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await expect(page.locator('#player1-banner')).toContainText(alice.name);
    await expect(page.locator('#player2-banner')).toContainText(bob.name);
  }
  expect(errors.flat()).toEqual([]);
  await alice.context.close();
  await bob.context.close();
});

test('only friends can be invited, and only into a room of your own', async ({ browser }) => {
  const a = await signedIn(browser);
  const b = await signedIn(browser);
  await a.page.goto('/chessdown/');
  await b.page.goto('/chessdown/');
  const answer = await a.page.evaluate((name) => new Promise((resolve) => {
    const s = io('/presence', { auth: { page: 'chessdown' }, forceNew: true });
    s.once('inviteResult', resolve);
    s.emit('invite', { username: name, game: 'chessdown', roomCode: 'ABCDEF' });
  }), b.name);
  expect(answer).toEqual({ ok: false, error: 'Create an online room first.' });
  await a.context.close();
  await b.context.close();
});

test('signing out everywhere takes a player offline at once, even on a page left open', async ({ browser }) => {
  const alice = await signedIn(browser);
  const bob = await signedIn(browser);
  await alice.post('/api/friends/requests', { username: bob.name });
  await bob.post(`/api/friends/requests/${alice.name}/accept`, {});

  await bob.page.goto('/account/');
  await alice.page.goto('/chesspell/');
  await expect(bob.page.locator('#friends-list')).toContainText("Online, playing Ches'spell");

  // From another device: a second session, which signs out everywhere
  const other = await browser.newContext();
  const login = await other.request.post('/api/auth/login', { headers: { origin: ORIGIN }, data: { login: alice.name, password: 'correct horse battery' } });
  expect(login.status()).toBe(200);
  expect((await other.request.post('/api/account/sessions/logout-all', { headers: { origin: ORIGIN }, data: {} })).status()).toBe(200);

  await expect(bob.page.locator('#friends-list')).toContainText(`${alice.name}Offline`);
  await other.close();
  await alice.context.close();
  await bob.context.close();
});
