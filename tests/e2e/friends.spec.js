// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Friends from the account page: send a request by username, accept it, remove, block.

const ORIGIN = 'http://127.0.0.1:3100';

async function signedIn(browser) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = `f${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  return { page: await context.newPage(), name, context };
}

test('send a request, accept it, then remove the friend', async ({ browser }) => {
  const a = await signedIn(browser);
  const b = await signedIn(browser);
  const errors = trackPageErrors(a.page);

  await a.page.goto('/account/');
  await a.page.getByLabel('Add a friend by their username').fill(b.name.toUpperCase());
  await a.page.getByRole('button', { name: 'Send request' }).click();
  await expect(a.page.locator('#friend-notice')).toHaveText(`Request sent to ${b.name}.`);
  await expect(a.page.locator('#outgoing-list')).toContainText(b.name);

  await b.page.goto('/account/');
  await b.page.getByRole('button', { name: `Accept ${a.name}` }).click();
  await expect(b.page.locator('#friends-list')).toContainText(a.name);
  await expect(b.page.locator('#incoming-block')).toBeHidden();

  await a.page.reload();
  await expect(a.page.locator('#friends-list')).toContainText(b.name);
  a.page.once('dialog', (d) => d.accept());
  await a.page.getByRole('button', { name: `Remove ${b.name} from your friends` }).click();
  await expect(a.page.locator('#friends-empty')).toBeVisible();

  await a.page.getByLabel('Add a friend by their username').fill('nobody-here');
  await a.page.getByRole('button', { name: 'Send request' }).click();
  await expect(a.page.locator('#friend-error')).toHaveText('No player has this username.');
  expect(errors).toEqual([]);
  await a.context.close();
  await b.context.close();
});
