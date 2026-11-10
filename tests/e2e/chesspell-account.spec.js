// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Ches'spell with an account: player 1 is the account, its deck is saved on the server
// and follows the player; guests stay for player 2 and for playing without an account.

const ORIGIN = 'http://127.0.0.1:3100';
const path = require('path');
const AVATAR = path.join(__dirname, 'fixtures', 'avatar.png'); // 64 px test picture

/** A new account, signed in in this context. */
async function signUp(context) {
  const name = `c${Date.now() % 1e7}${Math.floor(Math.random() * 100)}`;
  const res = await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  expect(res.ok()).toBe(true);
  return name;
}

test.describe("Ches'spell with an account", () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('signed out: the deck builder says decks stay on this device', async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(page.locator('#deck-account-invite')).toBeVisible();
    await expect(page.locator('#deck-profile-select option')).toHaveText(['Guest 1', 'Guest 2']);
  });

  test('the account and its deck load even when the stats cannot be read', async ({ page }) => {
    const errors = trackPageErrors(page);
    const name = await signUp(page.context());
    await page.context().request.put('/api/account/decks/chesspell', { headers: { origin: ORIGIN }, data: { deck: [8, 15, 12] } });
    await page.route('**/api/account/stats', (route) => route.fulfill({ status: 500, body: '{}' }));
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(page.locator('#deck-profile-select option').first()).toHaveText(`${name} (you)`);
    await expect(page.locator('#selection-count')).toHaveText('3/3 cards');
    await expect(page.locator('#deck-account-invite')).toBeHidden();
    expect(errors.filter((e) => !/500/.test(e))).toEqual([]);
  });

  test('a deck save sends the deck as it was when Save was pressed, once', async ({ page }) => {
    await signUp(page.context());
    let release = () => {};
    const sent = [];
    await page.route('**/api/account/decks/chesspell', async (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      sent.push(route.request().postDataJSON().deck);
      await new Promise((resolve) => { release = resolve; });
      await route.continue();
    });
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(page.locator('#deck-profile-select option').first()).toHaveText(/\(you\)$/);
    for (const id of [8, 15, 12]) await page.locator(`#deck-grid .spell-card[data-id="${id}"] .card-main`).click();
    await page.getByRole('button', { name: 'Save Deck' }).click();
    await expect(page.getByRole('button', { name: 'Save Deck' })).toBeDisabled(); // No second save meanwhile
    await expect.poll(() => sent.length).toBe(1);
    // A card taken out while the save is on its way: not part of this save
    await page.locator('#deck-grid .spell-card[data-id="12"] .card-main').click();
    release();
    await expect(page.locator('#deck-status')).toContainText('saved on your account');
    expect(sent).toEqual([[8, 15, 12]]);
    const saved = await (await page.context().request.get('/api/account/decks/chesspell')).json();
    expect(saved.deck).toEqual([8, 15, 12]);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(page.locator('#selection-count')).toHaveText('3/3 cards'); // The account kept the saved deck
  });

  test('signed in: build the deck on the account, find it again on another device, play as player 1', async ({ page, browser }) => {
    const errors = trackPageErrors(page);
    const name = await signUp(page.context());
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(page.locator('#deck-profile-select option').first()).toHaveText(`${name} (you)`);
    await expect(page.locator('#deck-account-invite')).toBeHidden();
    for (const id of [8, 15, 12]) await page.locator(`#deck-grid .spell-card[data-id="${id}"] .card-main`).click();
    await page.getByRole('button', { name: 'Save Deck' }).click();
    await expect(page.locator('#deck-status')).toHaveText('Deck saved on your account: it follows you on every device.');

    // Another device: same account, same deck
    const other = await browser.newContext();
    await blockExternalRequests(other);
    const login = await other.request.post('/api/auth/login', { headers: { origin: ORIGIN }, data: { login: name, password: 'correct horse battery' } });
    expect(login.ok()).toBe(true);
    const otherPage = await other.newPage();
    await otherPage.goto('/chesspell/');
    await otherPage.getByRole('button', { name: 'Deck Builder' }).click();
    await expect(otherPage.locator('#deck-slots .deck-slot-name')).toHaveText(['Wall', 'Freeze', 'Leap Frog']);
    await other.close();

    // Local game: player 1 is the account, player 2 a guest
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Local Game' }).click();
    await expect(page.locator('#p1-select')).toHaveValue('account');
    await expect(page.locator('#p2-select option')).toHaveText(['Guest 1', 'Guest 2']);
    expect(errors).toEqual([]);
  });

  test('the account picture is set from the account page and shown to the opponent online', async ({ page, browser }) => {
    const name = await signUp(page.context());
    await page.goto('/account/');
    await page.locator('#avatar-input').setInputFiles(AVATAR);
    await expect(page.locator('#account-avatar img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await expect(page.getByRole('button', { name: 'Remove picture' })).toBeVisible();

    // Online, the opponent receives the account's name and picture (set by the server)
    await page.goto('/chesspell/');
    const guest = await browser.newContext();
    await blockExternalRequests(guest);
    const guestPage = await guest.newPage();
    await guestPage.goto('/chesspell/');
    const code = await page.evaluate(() => new Promise((resolve) => {
      const s = io('/chesspell', { forceNew: true });
      s.once('roomCreated', resolve);
      s.emit('createRoom', { deck: [8, 16, 10], profile: { name: 'x', avatar: '', stats: { played: 0, wins: 0 } } });
    }));
    const profiles = await guestPage.evaluate((c) => new Promise((resolve) => {
      const s = io('/chesspell', { forceNew: true });
      s.once('gameStarted', (d) => resolve(d.roomState.profiles));
      s.emit('joinRoom', { roomCode: c, deck: [1, 15, 14], profile: { name: 'Guest', avatar: '', stats: { played: 0, wins: 0 } } });
    }), code);
    expect(profiles[1].name).toBe(name);
    expect(profiles[1].avatar).toMatch(/^data:image\/jpeg;base64,/);
    await guest.close();
  });
});
