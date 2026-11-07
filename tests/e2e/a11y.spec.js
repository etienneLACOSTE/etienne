// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Screen-reader basics on every page (WCAG 1.1.1, 1.3.1, 2.4.6, 3.1.1, 4.1.2):
// a language, one h1, a name for every control, button and link, alt text on
// images, decorative icons hidden.

test.describe('Accessible names', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  for (const url of ['/', '/chessdown/', '/chesspell/']) {
    test(`${url}: every control, button, link and image has a name`, async ({ page }) => {
      await page.goto(url);
      const issues = await page.evaluate(() => {
        const out = [];
        const labelled = (el) => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')
          || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label');
        document.querySelectorAll('input, select, textarea').forEach((el) => {
          if (!labelled(el)) out.push(`#${el.id || el.type}: no label`);
        });
        document.querySelectorAll('button, a[href], [role=button]').forEach((el) => {
          if (!(el.textContent.trim() || el.getAttribute('aria-label'))) out.push(`${el.tagName}.${el.className}: no name`);
        });
        document.querySelectorAll('img').forEach((el) => { if (!el.hasAttribute('alt')) out.push(`img: no alt`); });
        document.querySelectorAll('i[class*="fa-"]').forEach((el) => {
          if (el.getAttribute('aria-hidden') !== 'true') out.push(`icon ${el.className}: not hidden`);
        });
        if (!document.documentElement.lang) out.push('html: no lang');
        const h1 = document.querySelectorAll('h1').length;
        if (h1 !== 1) out.push(`${h1} h1 elements`);
        return out;
      });
      expect(issues).toEqual([]);
    });
  }
});
