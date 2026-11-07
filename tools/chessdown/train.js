// @ts-check
// Genetic training of the Chessdown campaign bot.
//
// A population of bot profiles (piece weights and positional bonuses) plays with the
// very draft and search the game uses (games/chessdown/bot-search.js); the best
// profiles breed. Each bot meets other bots and the standard profile, with random
// archetypes on both sides and sometimes a randomly drafted army (as a beginner
// would build), so it does not only learn to beat copies of itself. Genes stay in
// sensible, ordered ranges (queen > rook > minor pieces > pawn).
//
// At the end the best profile is validated, at a deeper search, against the standard
// profile and against random armies. Adopt the output (games/chessdown/
// training_data.json, read by the game) only if it clearly wins.
//
// Usage: node tools/chessdown/train.js [--generations 60] [--population 40]
//          [--games 8] [--standardGames 4] [--depth 3] [--validationDepth 4]
//          [--validation 400] [--workers N] [--seed 1] [--out path]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const Engine = require('../../games/chessdown/engine.js');
const Bot = require('../../games/chessdown/bot-search.js');

const MAX_PLIES = 80; // Longer games are draws
const ARCHETYPES = ['normal', 'ecuries', 'citadelle', 'chapiteau', 'chair', 'sorcieres'];

/** Allowed range of each gene. */
const BOUNDS = {
    p: [60, 140], n: [220, 420], b: [220, 420], r: [380, 650], q: [750, 1150],
    centerBonusCols: [0, 40], centerBonusRows: [0, 60], pawnForwardBonus: [0, 40], touchdownBonus: [100, 450],
};
const clamp = (key, v) => Math.max(BOUNDS[key][0], Math.min(BOUNDS[key][1], Math.round(v)));

/** Keep a profile sensible: genes in range, queen > rook > minor pieces > pawn, end-zone bonus < rook. */
function normalize(profile) {
    const w = profile.pieceWeights;
    for (const k of ['p', 'n', 'b', 'r', 'q']) w[k] = clamp(k, w[k]);
    w.p = Math.min(w.p, Math.min(w.n, w.b) - 40);
    w.r = Math.max(w.r, Math.max(w.n, w.b) + 40);
    w.q = Math.max(w.q, w.r + 150);
    w.k = 10000;
    for (const k of ['centerBonusCols', 'centerBonusRows', 'pawnForwardBonus', 'touchdownBonus']) profile[k] = clamp(k, profile[k]);
    profile.touchdownBonus = Math.min(profile.touchdownBonus, w.r - 50);
    return profile;
}

/** Seeded random numbers (mulberry32), so a run can be reproduced. */
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * One game between two profiles, both drafted and searched like the game bot.
 * Player 1 moves first. Returns 1, 2, or 0 for a draw.
 */
function playGame(profile1, profile2, depth, random, drafts = {}) {
    const state = { board: Engine.createBoard(), lastMove: null };
    const profiles = { 1: profile1, 2: profile2 };
    for (const player of [1, 2]) {
        const options = { ...(drafts[player] || {}), random };
        for (const p of Bot.draftArmy(profiles[player], player, options).pieces) {
            state.board[p.r][p.c] = { type: p.type, player, hasMoved: false };
        }
    }
    let player = 1;
    for (let ply = 0; ply < MAX_PLIES; ply++) {
        // A piece that survived a turn in the opposite end zone scores.
        if (Engine.hasPieceInEndzone(state.board, player)) return player;
        const move = Bot.bestMove(state, player, depth, profiles[player], random);
        if (!move) return player === 1 ? 2 : 1; // No move: loss
        const target = state.board[move.toR][move.toC];
        Engine.applyMove(state, move);
        if (target && target.type === 'k') return player;
        player = player === 1 ? 2 : 1;
    }
    return 0;
}

function randomProfile(id, random) {
    const gene = (key) => BOUNDS[key][0] + Math.floor(random() * (BOUNDS[key][1] - BOUNDS[key][0]));
    return normalize({
        id,
        fitness: 0, wins: 0, losses: 0, draws: 0,
        pieceWeights: { p: gene('p'), n: gene('n'), b: gene('b'), r: gene('r'), q: gene('q'), k: 10000 },
        centerBonusCols: gene('centerBonusCols'),
        centerBonusRows: gene('centerBonusRows'),
        pawnForwardBonus: gene('pawnForwardBonus'),
        touchdownBonus: gene('touchdownBonus'),
    });
}

/** A child mixes its parents' genes; each gene may mutate by up to ±20 %. */
function crossover(parent1, parent2, id, random) {
    const child = randomProfile(id, random);
    const mutate = (val) => (random() >= 0.2 ? val : val * (0.8 + random() * 0.4));
    const pick = (a, b) => (random() < 0.5 ? a : b);
    for (const k of ['p', 'n', 'b', 'r', 'q']) {
        child.pieceWeights[k] = mutate(pick(parent1.pieceWeights[k], parent2.pieceWeights[k]));
    }
    for (const k of ['centerBonusCols', 'centerBonusRows', 'pawnForwardBonus', 'touchdownBonus']) {
        child[k] = mutate(pick(parent1[k], parent2[k]));
    }
    return normalize(child);
}

/** Games run in worker threads; each task is { p1, p2, depth, seed }. */
function createPool(size) {
    const workers = Array.from({ length: size }, () => new Worker(__filename));
    /** @type {((err: Error) => void) | null} */
    let fail = null;
    workers.forEach((w) => w.on('error', (err) => fail && fail(err)));
    return {
        /** @param {Array<{p1: any, p2: any, depth: number, seed: number, drafts?: any}>} tasks @returns {Promise<number[]>} */
        run(tasks) {
            return new Promise((resolve, reject) => {
                fail = reject;
                const results = new Array(tasks.length);
                let next = 0;
                let done = 0;
                const feed = (worker) => {
                    if (next >= tasks.length) return;
                    const index = next++;
                    worker.once('message', (winner) => {
                        results[index] = winner;
                        if (++done === tasks.length) resolve(results);
                        else feed(worker);
                    });
                    worker.postMessage(tasks[index]);
                };
                if (tasks.length === 0) resolve([]);
                workers.forEach(feed);
            });
        },
        close() { workers.forEach((w) => w.terminate()); },
    };
}

function parseArgs(argv) {
    const opts = { generations: 60, population: 40, games: 8, standardGames: 4, depth: 3, validationDepth: 4, validation: 400, workers: Math.max(1, os.cpus().length - 1), seed: 1, out: path.join(__dirname, '..', '..', 'games', 'chessdown', 'training_data.json') };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        if (!(key in opts)) throw new Error(`Unknown option --${key}`);
        opts[key] = key === 'out' ? argv[i + 1] : Number(argv[i + 1]);
    }
    return opts;
}

async function train(opts) {
    const random = seededRandom(opts.seed);
    const pool = createPool(opts.workers);
    const strip = ({ id, pieceWeights, centerBonusCols, centerBonusRows, pawnForwardBonus, touchdownBonus }) =>
        ({ id, pieceWeights, centerBonusCols, centerBonusRows, pawnForwardBonus, touchdownBonus });
    const standard = strip({ id: 'standard', ...Bot.DEFAULT_PROFILE });
    const archetype = () => ARCHETYPES[Math.floor(random() * ARCHETYPES.length)];
    // Opponent armies: a random archetype, and one game in four a beginner's random draft.
    const opponentDraft = () => ({ archetype: archetype(), difficulty: random() < 0.25 ? 'novice' : 'master' });
    const seed = () => Math.floor(random() * 2 ** 31);
    /** A game where `a` plays side `side` (1 or 2) against `b`. */
    const game = (a, b, side, depth) => {
        const mine = { archetype: archetype() };
        const theirs = opponentDraft();
        return side === 1
            ? { p1: a, p2: b, depth, seed: seed(), drafts: { 1: mine, 2: theirs } }
            : { p1: b, p2: a, depth, seed: seed(), drafts: { 1: theirs, 2: mine } };
    };
    /** Points of each game for the side `sides[k]`: 3 a win, 1 a draw. */
    const score = (winners, sides) => winners.map((w, k) => (w === 0 ? 1 : w === sides[k] ? 3 : 0));

    let population = Array.from({ length: opts.population }, (_, i) => randomProfile(i, random));
    const output = { settings: { ...opts, out: undefined, maxPlies: MAX_PLIES, bounds: BOUNDS }, generations: [], validation: null };
    console.log(`Training: ${opts.population} bots, ${opts.generations} generations, depth ${opts.depth}, ${opts.workers} workers`);

    for (let gen = 1; gen <= opts.generations; gen++) {
        population.forEach((p) => Object.assign(p, { fitness: 0, wins: 0, losses: 0, draws: 0, vsStandard: 0 }));
        // Every bot plays other bots and the standard profile, each pairing with both colours.
        const tasks = [];
        const owners = []; // [bot index, side it plays, opponent index or -1 for standard]
        population.forEach((bot, i) => {
            for (let g = 0; g < opts.games / 2; g++) {
                let j = Math.floor(random() * population.length);
                if (j === i) j = (j + 1) % population.length;
                for (const side of [1, 2]) {
                    tasks.push(game(strip(bot), strip(population[j]), side, opts.depth));
                    owners.push([i, side, j]);
                }
            }
            for (let g = 0; g < opts.standardGames / 2; g++) {
                for (const side of [1, 2]) {
                    tasks.push(game(strip(bot), standard, side, opts.depth));
                    owners.push([i, side, -1]);
                }
            }
        });
        const winners = await pool.run(tasks);
        winners.forEach((winner, k) => {
            const [i, side, j] = owners[k];
            const bot = population[i];
            const result = winner === 0 ? 'draw' : winner === side ? 'win' : 'loss';
            bot.fitness += result === 'win' ? 3 : result === 'draw' ? 1 : 0;
            bot[result === 'win' ? 'wins' : result === 'draw' ? 'draws' : 'losses']++;
            if (j === -1 && result === 'win') bot.vsStandard++;
            if (j >= 0) {
                const other = population[j];
                other.fitness += result === 'loss' ? 3 : result === 'draw' ? 1 : 0;
            }
        });
        population.sort((x, y) => y.fitness - x.fitness);
        const best = population[0];
        const worst = population[population.length - 1];
        const avgFitness = population.reduce((sum, p) => sum + p.fitness, 0) / population.length;
        console.log(`Gen ${gen}: best ${best.wins}W ${best.draws}D ${best.losses}L (${best.vsStandard}/${opts.standardGames} vs standard), weights ${JSON.stringify(best.pieceWeights)}, td ${best.touchdownBonus}`);
        output.generations.push({ generation: gen, bestBot: JSON.parse(JSON.stringify(best)), worstBot: JSON.parse(JSON.stringify(worst)), avgFitness });
        fs.writeFileSync(opts.out, JSON.stringify(output, null, 2) + '\n');
        if (gen === opts.generations) break;

        // Keep the top quarter, breed the rest from the top half.
        const next = population.slice(0, Math.floor(opts.population * 0.25)).map((p) => JSON.parse(JSON.stringify(p)));
        const parents = Math.floor(opts.population * 0.5);
        let id = opts.population * gen;
        while (next.length < opts.population) {
            next.push(crossover(population[Math.floor(random() * parents)], population[Math.floor(random() * parents)], id++, random));
        }
        population = next;
    }

    // Validation, deeper than training: the best bot against the standard profile, and
    // against beginners' random armies played with the standard values.
    const best = strip(population[0]);
    const validate = async (opponent, opponentDraftOptions, games) => {
        const tasks = [];
        const sides = [];
        for (let k = 0; k < games; k++) {
            const side = k % 2 ? 2 : 1;
            const mine = { archetype: archetype() };
            const theirs = opponentDraftOptions();
            tasks.push(side === 1
                ? { p1: best, p2: opponent, depth: opts.validationDepth, seed: seed(), drafts: { 1: mine, 2: theirs } }
                : { p1: opponent, p2: best, depth: opts.validationDepth, seed: seed(), drafts: { 1: theirs, 2: mine } });
            sides.push(side);
        }
        const winners = await pool.run(tasks);
        const points = score(winners, sides);
        return {
            games,
            wins: points.filter((p) => p === 3).length,
            draws: points.filter((p) => p === 1).length,
            losses: points.filter((p) => p === 0).length,
        };
    };
    output.validation = {
        depth: opts.validationDepth,
        vsStandard: await validate(standard, () => ({ archetype: archetype() }), opts.validation),
        vsRandomArmies: await validate(standard, () => ({ archetype: archetype(), difficulty: 'novice' }), Math.floor(opts.validation / 2)),
    };
    pool.close();
    fs.writeFileSync(opts.out, JSON.stringify(output, null, 2) + '\n');
    const line = (r) => `${r.wins}W ${r.draws}D ${r.losses}L / ${r.games}`;
    console.log(`Validation (depth ${opts.validationDepth}) vs standard profile: ${line(output.validation.vsStandard)}; vs random armies: ${line(output.validation.vsRandomArmies)}`);
    return output;
}

if (!isMainThread) {
    parentPort.on('message', ({ p1, p2, depth, seed, drafts }) => parentPort.postMessage(playGame(p1, p2, depth, seededRandom(seed), drafts)));
} else if (require.main === module) {
    train(parseArgs(process.argv.slice(2))).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { playGame, randomProfile, crossover, normalize, seededRandom, parseArgs, train, BOUNDS };
