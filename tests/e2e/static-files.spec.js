// @ts-check
const { test, expect } = require('@playwright/test');

// Only the hub and the game clients are public. Source, tooling, AI code,
// model weights and project files must never be downloadable.

const PUBLIC = ['/', '/style.css', '/chessdown/', '/chessdown/js/main.js', '/chessdown/js/state.js', '/chessdown/engine.js', '/chessdown/bot-search.js', '/chessdown/training_data.json',
  '/chesspell/', '/chesspell/js/app.js', '/chesspell/rules.js', '/chesspell/bot.js', '/chesspell/training_data.json',
  '/assets/fonts/fonts.css', '/assets/fonts/bagel-fat-one.woff2', '/assets/fonts/noto-sans-symbols-2-chess.woff2'];

const PRIVATE = [
  '/server.js', '/package.json', '/CLAUDE.md', '/playwright.config.js', '/.gitignore', '/.git/config',
  '/server/index.js', '/docs/strategy.md',
  '/ai/chesspell/api.py', '/chesspell/api.py', '/chesspell/backend-ai/api.py',
  '/chesspell/backend-ai/chesspell_model.pth', '/ai/chesspell/chesspell_model.pth',
  '/tools/chessdown/train.js', '/chessdown/train.js', '/chessdown/server.js',
  '/chessdown/../server.js', '/chesspell/%2e%2e/server.js', '/assets/../server/index.js', '/assets/%2e%2e/package.json',
];

test.describe('Static files', () => {
  for (const url of PUBLIC) {
    test(`serves ${url}`, async ({ request }) => {
      expect((await request.get(url)).status()).toBe(200);
    });
  }

  for (const url of PRIVATE) {
    test(`does not serve ${url}`, async ({ request }) => {
      expect((await request.get(url)).status()).toBe(404);
    });
  }
});
