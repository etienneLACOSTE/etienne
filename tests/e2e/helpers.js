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

module.exports = { blockExternalRequests, trackPageErrors, readGlobal, waitForGlobal };
