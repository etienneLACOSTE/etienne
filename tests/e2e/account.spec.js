// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Accounts from the hub: create one, see it in the top bar, sign out, sign in, delete it.

test.describe('Account', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  const unique = () => `p${Date.now() % 1e7}${Math.floor(Math.random() * 100)}`;

  test('create an account, sign out, sign in again, then delete it', async ({ page }) => {
    const errors = trackPageErrors(page);
    const name = unique();
    await page.goto('/');
    await page.getByRole('link', { name: 'Sign in or create an account' }).click();
    await expect(page).toHaveURL(/\/account\/$/);

    // Create
    await page.locator('#signup-name').fill(name);
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();

    // Straight on to the games, signed in
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await expect(page.locator('#account-link')).toHaveText(name);

    // The account page, from the top bar
    await page.locator('#account-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hello, ${name}`);
    await expect(page.locator('#fact-email')).toHaveText(`${name}@example.com`);
    await expect(page.locator('#fact-methods')).toHaveText('Password');

    // Sign out, then back in with the email
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account');
    await expect(page.locator('#account-link')).toHaveText('Sign in');
    await page.getByLabel('Username or email').fill(`${name.toUpperCase()}@EXAMPLE.COM`);
    await page.locator('#login-password').fill('correct horse battery');
    await page.locator('#login-form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.locator('#account-link').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hello, ${name}`);

    // Delete: the wrong confirmation is refused, the right one removes the account
    await page.getByText('Delete my account', { exact: true }).click();
    await page.getByLabel('Type your username to confirm').fill('someone else');
    await page.locator('#delete-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Delete my account forever' }).click();
    await expect(page.locator('#delete-error')).toHaveText('Type your username to confirm.');
    await page.getByLabel('Type your username to confirm').fill(name);
    await page.getByRole('button', { name: 'Delete my account forever' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account');
    await page.getByLabel('Username or email').fill(name);
    await page.locator('#login-password').fill('correct horse battery');
    await page.locator('#login-form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#login-error')).toHaveText('Wrong username, email or password.');
    expect(errors).toEqual([]);
  });

  test('an invalid username is explained, and the form keeps what was typed', async ({ page }) => {
    await page.goto('/account/');
    await page.locator('#signup-name').fill('ab');
    await page.getByLabel('Email', { exact: true }).fill('ab@example.com');
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.locator('#signup-error')).toHaveText('A username has 3 to 20 letters, digits, - or _.');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ab@example.com');
  });

  test('after signing in, ?next= returns to a page of this site only', async ({ page }) => {
    const name = unique();
    await page.goto('/account/?next=https://evil.example/');
    await page.locator('#signup-name').fill(name);
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/); // Not the other site: the games

    await page.goto('/account/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/account/?next=/chesspell/');
    await page.getByLabel('Username or email').fill(name);
    await page.locator('#login-password').fill('correct horse battery');
    await page.locator('#login-form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/chesspell\/$/);
  });

  test('the Google button, and the username step after a first sign-in', async ({ page }) => {
    // The test server has no Google or GitHub keys: their answers are simulated here.
    await page.route('**/api/auth/providers', (r) => r.fulfill({ json: { providers: ['google'] } }));
    await page.goto('/account/?next=/chesspell/');
    await expect(page.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/api/auth/google/start?next=%2Fchesspell%2F');

    await page.route('**/api/auth/pending', (r) => r.fulfill({ json: { pending: { provider: 'google', suggestedUsername: 'Zoe' } } }));
    await page.route('**/api/auth/finish', (r) => r.fulfill({ status: 409, json: { error: 'This username is taken.' } }));
    await page.goto('/account/?finish=google');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose your username');
    await expect(page.locator('#finish-name')).toHaveValue('Zoe');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.locator('#finish-error')).toHaveText('This username is taken.');
  });

  test('coming back from a cancelled sign-in says so', async ({ page }) => {
    await page.goto('/account/?error=cancelled');
    await expect(page.locator('#account-notice')).toHaveText('Sign-in was cancelled. Try again whenever you like.');
  });

  test('play as a guest, from the sign-in page', async ({ page }) => {
    await page.goto('/account/');
    await page.getByRole('link', { name: 'Play as a guest' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
    await page.goto('/account/?next=/chessdown/');
    await expect(page.getByRole('link', { name: 'Play as a guest' })).toHaveAttribute('href', '/chessdown/');
  });
});
