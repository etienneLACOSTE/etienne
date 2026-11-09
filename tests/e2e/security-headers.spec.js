// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Every page is served with a strict Content-Security-Policy (no inline or
// injected scripts) and the usual hardening headers, and runs without violating it.

const PAGES = ['/', '/account/', '/privacy/', '/chessdown/', '/chessdown/?demo=true', '/chesspell/', '/chesspell/?demo=true&v=2'];

test.describe('Security headers', () => {
  test('pages send CSP and hardening headers', async ({ request }) => {
    for (const url of ['/', '/chessdown/', '/chesspell/', '/chesspell/js/match.js']) {
      const res = await request.get(url);
      const h = res.headers();
      const csp = h['content-security-policy'] ?? '';
      expect(csp, url).toContain("default-src 'self'");
      expect(csp, url).toContain("script-src 'self'");
      expect(csp, url).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
      expect(csp, url).toContain("object-src 'none'");
      expect(csp, url).toContain("frame-ancestors 'none'");
      expect(h['x-content-type-options'], url).toBe('nosniff');
      expect(h['referrer-policy'], url).toBe('no-referrer');
      expect(h['x-frame-options'], url).toBe('DENY');
      expect(h['strict-transport-security'], url).toBe('max-age=31536000');
      expect(h['x-powered-by'], url).toBeUndefined();
    }
  });

  test('pages run without CSP violations', async ({ page }) => {
    await blockExternalRequests(page);
    const violations = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    for (const url of PAGES) {
      await page.goto(url);
      await page.waitForTimeout(1_500); // Let demos and startup code run
    }
    expect(violations).toEqual([]);
  });

  test('pages contact no third party and load the self-hosted fonts', async ({ page, baseURL }) => {
    const origin = new URL(String(baseURL)).origin;
    const external = [];
    page.on('request', (r) => {
      if (!/^(data|blob):/.test(r.url()) && new URL(r.url()).origin !== origin) external.push(r.url());
    });
    for (const url of PAGES) {
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
      expect(loaded.length, url).toBeGreaterThan(0);
    }
    expect(external).toEqual([]);
  });
});
