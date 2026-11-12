// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Chat between the two players of an online game (server/chat.js, assets/js/game-chat.js).

const ORIGIN = 'http://127.0.0.1:3100';

/** A page, signed in with a new account unless `guest`. */
async function player(browser, { guest = false } = {}) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  await context.addInitScript((p) => localStorage.setItem('spellChessProfiles', JSON.stringify(p)), [
    { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] },
  ]);
  const name = `c${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  if (!guest) {
    const res = await context.request.post('/api/auth/signup', {
      headers: { origin: ORIGIN },
      data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
    });
    expect(res.ok()).toBe(true);
  }
  const page = await context.newPage();
  return { context, page, name, errors: trackPageErrors(page) };
}

/** Both Chessdown pages in one room: the draft starts. */
async function chessdownRoom(a, b) {
  await a.goto('/chessdown/');
  await a.locator('#btn-create-room').dispatchEvent('pointerdown');
  await expect(a.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
  const code = (await a.locator('#waiting-room-code').textContent()) ?? '';
  await b.goto('/chessdown/');
  await b.locator('#room-code-input').fill(code);
  await b.locator('#btn-join-room').dispatchEvent('pointerdown');
  for (const page of [a, b]) await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toMatch(/^draft/);
}

const chatButton = (page) => page.locator('#btn-chat');
const panel = (page) => page.getByRole('region', { name: 'Chat' });

test.describe('Chat', () => {
  test('Chessdown: two accounts chat, as text, with the keyboard; the panel passes axe', async ({ browser }) => {
    const alice = await player(browser);
    const bob = await player(browser);
    await chessdownRoom(alice.page, bob.page);
    await expect(chatButton(alice.page)).toHaveText('Chat');

    await chatButton(alice.page).click();
    const input = panel(alice.page).getByLabel('Message', { exact: true });
    await expect(input).toBeFocused();
    await input.fill('Good luck <img src=x onerror="window.hacked=1">');
    await alice.page.keyboard.press('Enter');
    await expect(panel(alice.page).getByRole('log')).toContainText('You: Good luck <img src=x');

    // Bob: an unread count on the button, then the message as text.
    await expect(chatButton(bob.page)).toHaveText('Chat (1)');
    await expect(chatButton(bob.page)).toHaveAccessibleName('Chat, 1 unread');
    await chatButton(bob.page).click();
    await expect(panel(bob.page).getByRole('log')).toHaveText(`${alice.name}: Good luck <img src=x onerror="window.hacked=1">`);
    expect(await bob.page.evaluate(() => window.hacked)).toBeUndefined();
    await expect(chatButton(bob.page)).toHaveText('Chat');

    const { violations } = await new AxeBuilder({ page: bob.page }).include('#game-chat')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);

    // Escape closes it, and the focus goes back to the button.
    await bob.page.keyboard.press('Escape');
    await expect(panel(bob.page)).toBeHidden();
    await expect(chatButton(bob.page)).toBeFocused();
    expect([...alice.errors, ...bob.errors]).toEqual([]);
    await alice.context.close();
    await bob.context.close();
  });

  test('Chessdown: a player turns the chat off; the other is told and cannot write', async ({ browser }) => {
    const alice = await player(browser);
    const bob = await player(browser);
    await chessdownRoom(alice.page, bob.page);
    await chatButton(bob.page).click();
    await panel(bob.page).getByRole('button', { name: 'Turn chat off' }).click();
    await expect(panel(bob.page).getByRole('button', { name: 'Turn chat on' })).toBeFocused();
    await expect(panel(bob.page)).toContainText('Chat is off: you do not get messages.');
    await expect(chatButton(bob.page)).toHaveText('Chat off');
    expect(await bob.page.evaluate(() => localStorage.getItem('pawnet.chatOff'))).toBe('1'); // Kept on this device

    await chatButton(alice.page).click();
    await expect(panel(alice.page)).toContainText('Your opponent turned the chat off.');
    await expect(panel(alice.page).getByLabel('Message', { exact: true })).toBeHidden();

    // Back on: Alice can write again.
    await panel(bob.page).getByRole('button', { name: 'Turn chat on' }).click();
    await expect(panel(alice.page).getByLabel('Message', { exact: true })).toBeVisible();
    await alice.context.close();
    await bob.context.close();
  });

  test('Chessdown: no chat with a guest; the guest is asked to sign in', async ({ browser }) => {
    const alice = await player(browser);
    const guest = await player(browser, { guest: true });
    await chessdownRoom(alice.page, guest.page);
    await chatButton(guest.page).click();
    await expect(panel(guest.page)).toContainText('Sign in to chat with your opponent.');
    await expect(panel(guest.page).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account/?next=%2Fchessdown%2F');
    await expect(panel(guest.page).getByLabel('Message', { exact: true })).toBeHidden();
    await chatButton(alice.page).click();
    await expect(panel(alice.page)).toContainText('Your opponent is playing as a guest: no chat.');
    await alice.context.close();
    await guest.context.close();
  });

  test('Chessdown: back at the menu, no chat button and no messages left', async ({ browser }) => {
    const alice = await player(browser);
    const bob = await player(browser);
    await chessdownRoom(alice.page, bob.page);
    await chatButton(alice.page).click();
    await panel(alice.page).getByLabel('Message', { exact: true }).fill('bye');
    await alice.page.keyboard.press('Enter');
    await expect(chatButton(bob.page)).toHaveText('Chat (1)');
    await alice.page.locator('#btn-main-menu').dispatchEvent('pointerdown');
    await expect(chatButton(alice.page)).toBeHidden();
    await expect(alice.page.locator('.chat-message')).toHaveCount(0);
    await expect(chatButton(bob.page)).toBeHidden(); // The opponent left: the room is closed
    await alice.context.close();
    await bob.context.close();
  });

  test("Ches'spell: two accounts chat during the game", async ({ browser }) => {
    const alice = await player(browser);
    const bob = await player(browser);
    for (const { page } of [alice, bob]) {
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Online Multiplayer' }).click();
      await page.locator('#online-p1-select').selectOption('guest1');
    }
    await alice.page.locator('#btn-create-room').click();
    await expect(alice.page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
    await bob.page.locator('#room-code-input').fill((await alice.page.locator('#waiting-room-code').textContent()) ?? '');
    await bob.page.locator('#btn-join-room').click();
    await expect(bob.page.locator('#game-board')).toHaveClass(/active/);

    await chatButton(bob.page).click();
    await panel(bob.page).getByLabel('Message', { exact: true }).fill('gl hf');
    await panel(bob.page).getByRole('button', { name: 'Send' }).click();
    await expect(chatButton(alice.page)).toHaveText('Chat (1)');
    await chatButton(alice.page).click();
    await expect(panel(alice.page).getByRole('log')).toHaveText(`${bob.name}: gl hf`);
    expect([...alice.errors, ...bob.errors]).toEqual([]);
    await alice.context.close();
    await bob.context.close();
  });
});
