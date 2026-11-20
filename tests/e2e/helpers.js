// @ts-check
const { expect } = require('@playwright/test');

/**
 * Block every request that does not target the local test server
 * (CDN fonts/icons), so tests are deterministic and work offline.
 * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target
 */
async function blockExternalRequests(target) {
  await target.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
}

/**
 * Collect uncaught page errors so a test can assert none happened.
 * @param {import('@playwright/test').Page} page
 */
function trackPageErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Read a field of the game state (`window.chessdown.state`), or else a global of a
 * classic page script.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 */
function readGlobal(page, name) {
  return page.evaluate((n) => {
    const game = /** @type {any} */ (window).chessdown;
    return game && n in game.state ? game.state[n] : (0, eval)(n);
  }, name);
}

/**
 * Wait until a top-level binding equals the expected value.
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {unknown} value
 */
async function waitForGlobal(page, name, value) {
  await expect.poll(() => readGlobal(page, name), { timeout: 20_000 }).toEqual(value);
}

/**
 * Wait for the page's in-page dialog (assets/js/dialog.js) saying `message`, and answer it.
 * @param {import('@playwright/test').Page} page
 * @param {string} message
 * @param {string} [button] the button to press ('OK', or the confirm / cancel label)
 */
async function answerDialog(page, message, button = 'OK') {
  const dialog = page.getByRole('alertdialog', { name: message, exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

const ORIGIN = 'http://127.0.0.1:3100'; // The test server (playwright.config.js)
let accounts = 0;

/**
 * A new account, signed in in `context` (online games need one). Its pages and their
 * Socket.io connections are that account.
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<string>} its username
 */
async function signUp(context) {
  const name = `t${process.pid % 1000}${Date.now() % 1e6}${++accounts}`.slice(0, 20);
  const res = await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  expect(res.ok()).toBe(true);
  return name;
}

/**
 * A new browser context with outside requests blocked and a new account signed in.
 * @param {import('@playwright/test').Browser} browser
 */
async function signedInContext(browser) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = await signUp(context);
  return { context, name };
}

module.exports = { blockExternalRequests, trackPageErrors, readGlobal, waitForGlobal, answerDialog, signUp, signedInContext, ORIGIN };
