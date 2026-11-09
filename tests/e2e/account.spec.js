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
    await page.getByLabel('Username', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hello, ${name}`);
    await expect(page.locator('#fact-email')).toHaveText(`${name}@example.com`);
    await expect(page.locator('#fact-methods')).toHaveText('Password');

    // Signed in on every hub page
    await page.goto('/');
    await expect(page.locator('#account-link')).toHaveText(name);

    // Sign out, then back in with the email
    await page.locator('#account-link').click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account');
    await expect(page.locator('#account-link')).toHaveText('Sign in');
    await page.getByLabel('Username or email').fill(`${name.toUpperCase()}@EXAMPLE.COM`);
    await page.locator('#login-password').fill('correct horse battery');
    await page.locator('#login-form').getByRole('button', { name: 'Sign in' }).click();
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
    await page.getByLabel('Username', { exact: true }).fill('ab');
    await page.getByLabel('Email', { exact: true }).fill('ab@example.com');
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.locator('#signup-error')).toHaveText('A username has 3 to 20 letters, digits, - or _.');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('ab@example.com');
  });

  test('after signing in, ?next= returns to a page of this site only', async ({ page }) => {
    const name = unique();
    await page.goto('/account/?next=https://evil.example/');
    await page.getByLabel('Username', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Hello, ${name}`);
    await expect(page).toHaveURL(/\/account\//);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/account/?next=/chesspell/');
    await page.getByLabel('Username or email').fill(name);
    await page.locator('#login-password').fill('correct horse battery');
    await page.locator('#login-form').getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/chesspell\/$/);
  });
});
