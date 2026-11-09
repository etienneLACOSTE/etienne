// The browser modules of each game import each other in one direction only:
// no file may end up importing itself through other files.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const IMPORT = /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm;

/** Relative imports of every module reachable from a game's entry point. */
function importGraph(entry) {
    const graph = new Map();
    const pending = [entry];
    while (pending.length) {
        const file = pending.pop();
        if (graph.has(file)) continue;
        const source = fs.readFileSync(file, 'utf8');
        const deps = [...source.matchAll(IMPORT)].map((m) => path.resolve(path.dirname(file), m[1]));
        graph.set(file, deps);
        pending.push(...deps);
    }
    return graph;
}

/** Every import cycle, as a list of files relative to the repository. */
function cycles(graph) {
    const found = [];
    const state = new Map(); // file -> 'open' while on the current path, 'done' after
    const stack = [];
    const visit = (file) => {
        state.set(file, 'open');
        stack.push(file);
        for (const dep of graph.get(file) || []) {
            if (state.get(dep) === 'open') {
                found.push(stack.slice(stack.indexOf(dep)).concat(dep).map((f) => path.relative(ROOT, f)).join(' -> '));
            } else if (!state.has(dep)) {
                visit(dep);
            }
        }
        stack.pop();
        state.set(file, 'done');
    };
    for (const file of graph.keys()) if (!state.has(file)) visit(file);
    return found;
}

for (const game of ['chessdown', 'chesspell']) {
    test(`${game}: no import cycle between browser modules`, () => {
        const graph = importGraph(path.join(ROOT, 'games', game, 'js', 'main.js'));
        assert.ok(graph.size > 5, 'the import graph was read');
        assert.deepEqual(cycles(graph), []);
    });
}
