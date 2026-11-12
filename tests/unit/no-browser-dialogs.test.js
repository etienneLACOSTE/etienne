// The pages use in-page dialogs (assets/js/dialog.js), never the browser's alert(),
// confirm() or prompt(): those freeze the page and ignore the site's style.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CLIENT_DIRS = ['assets', 'hub', 'games'];
const CALL = /(?<![.\w])(?:window\.)?(alert|confirm|prompt)\s*\(/g;

function* jsFiles(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* jsFiles(full);
        else if (entry.name.endsWith('.js')) yield full;
    }
}

test('no browser alert(), confirm() or prompt() in the pages', () => {
    const found = [];
    for (const dir of CLIENT_DIRS) {
        for (const file of jsFiles(path.join(ROOT, dir))) {
            fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
                if (/^\s*(\/\/|\*)/.test(line)) return; // Comments
                for (const m of line.matchAll(CALL)) found.push(`${path.relative(ROOT, file)}:${i + 1} ${m[1]}()`);
            });
        }
    }
    assert.deepEqual(found, []);
});
