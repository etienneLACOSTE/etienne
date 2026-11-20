// Languages (assets/js/i18n.js): every language has every English text, with the same
// {values}, and every key the Chessdown page uses exists in English.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const LANGS = ['fr', 'es', 'it', 'de'];
const load = async (file) => (await import(path.join(ROOT, file))).default;
const values = (text) => (text.match(/\{\w+\}/g) || []).sort();

for (const [name, dir] of [['shared', 'assets/js/strings'], ['Chessdown', 'games/chessdown/strings']]) {
    test(`${name} texts: each language has the English keys and {values}`, async () => {
        const en = await load(`${dir}/en.js`);
        for (const lang of LANGS) {
            const table = await load(`${dir}/${lang}.js`);
            assert.deepEqual(Object.keys(table).sort(), Object.keys(en).sort(), `${lang}: same keys as English`);
            for (const key of Object.keys(en)) {
                assert.ok(table[key].trim(), `${lang} ${key}: not empty`);
                assert.deepEqual(values(table[key]), values(en[key]), `${lang} ${key}: same {values}`);
                assert.equal(table[key].split('**').length % 2, 1, `${lang} ${key}: bold marks in pairs`);
            }
        }
    });
}

test('every key the Chessdown page uses exists in English', async () => {
    const en = { ...(await load('assets/js/strings/en.js')), ...(await load('games/chessdown/strings/en.js')) };
    const sources = [
        'games/chessdown/index.html',
        ...fs.readdirSync(path.join(ROOT, 'games/chessdown/js')).map((f) => `games/chessdown/js/${f}`),
        ...['dialog', 'draw-offer', 'game-chat', 'presence', 'connection-notice', 'seat', 'session'].map((f) => `assets/js/${f}.js`),
    ];
    const used = new Set();
    for (const file of sources) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const m of text.matchAll(/\bt\('([\w.]+)'/g)) used.add(m[1]);
        for (const m of text.matchAll(/\bsay\(\w+, '([\w.]+)'/g)) used.add(m[1]);
        for (const m of text.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
        for (const m of text.matchAll(/data-i18n-attr="([^"]+)"/g)) {
            for (const pair of m[1].split(';')) used.add(pair.split(':')[1].trim());
        }
    }
    // Keys built from a value: one per piece, colour, owner.
    for (const p of 'pnbrqk') {
        used.add(`piece.${p}`);
        for (const owner of ['own', 'opp', 'bot', 'player']) used.add(`a11y.${owner}.${p}`);
    }
    for (const c of ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'white', 'black']) used.add(`color.${c}`);
    for (const r of ['gone', 'busy', 'over']) used.add(`seat.${r}`);
    const missing = [...used].filter((key) => !(key in en));
    assert.deepEqual(missing, []);
});
