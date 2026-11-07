// @ts-check
// Genetic training of the Chessdown campaign bot.
//
// A population of bot profiles (piece weights and positional bonuses) plays games
// against itself with the very draft and search the game uses (games/chessdown/
// bot-search.js); the best profiles breed. At the end the best profile plays the
// standard profile, and the result is saved with the generations in
// games/chessdown/training_data.json, which the game reads at startup.
//
// Usage: node tools/chessdown/train.js [--generations 60] [--population 40]
//          [--games 6] [--depth 3] [--validation 200] [--workers N] [--seed 1] [--out path]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const Engine = require('../../games/chessdown/engine.js');
const Bot = require('../../games/chessdown/bot-search.js');

const MAX_PLIES = 80; // Longer games are draws

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
function playGame(profile1, profile2, depth, random) {
    const state = { board: Engine.createBoard(), lastMove: null };
    const profiles = { 1: profile1, 2: profile2 };
    for (const player of [1, 2]) {
        for (const p of Bot.draftArmy(profiles[player], player, { random }).pieces) {
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
    const between = (min, max) => min + Math.floor(random() * (max - min));
    return {
        id,
        fitness: 0, wins: 0, losses: 0, draws: 0,
        pieceWeights: { p: between(50, 150), n: between(200, 400), b: between(200, 400), r: between(300, 700), q: between(600, 1200), k: 10000 },
        centerBonusCols: between(5, 20),
        centerBonusRows: between(10, 40),
        pawnForwardBonus: between(5, 20),
        touchdownBonus: between(1000, 3000),
    };
}

/** A child mixes its parents' genes; each gene may mutate by up to ±20 %. */
function crossover(parent1, parent2, id, random) {
    const child = randomProfile(id, random);
    const mutate = (val, min, max) => {
        if (random() >= 0.2) return val;
        return Math.max(min, Math.min(max, Math.floor(val * (0.8 + random() * 0.4))));
    };
    const pick = (a, b) => (random() < 0.5 ? a : b);
    for (const k of ['p', 'n', 'b', 'r', 'q']) {
        child.pieceWeights[k] = mutate(pick(parent1.pieceWeights[k], parent2.pieceWeights[k]), 10, 2000);
    }
    child.centerBonusCols = mutate(pick(parent1.centerBonusCols, parent2.centerBonusCols), 0, 50);
    child.centerBonusRows = mutate(pick(parent1.centerBonusRows, parent2.centerBonusRows), 0, 100);
    child.pawnForwardBonus = mutate(pick(parent1.pawnForwardBonus, parent2.pawnForwardBonus), 0, 50);
    child.touchdownBonus = mutate(pick(parent1.touchdownBonus, parent2.touchdownBonus), 0, 5000);
    return child;
}

/** Games run in worker threads; each task is { p1, p2, depth, seed }. */
function createPool(size) {
    const workers = Array.from({ length: size }, () => new Worker(__filename));
    /** @type {((err: Error) => void) | null} */
    let fail = null;
    workers.forEach((w) => w.on('error', (err) => fail && fail(err)));
    return {
        /** @param {Array<{p1: any, p2: any, depth: number, seed: number}>} tasks @returns {Promise<number[]>} */
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
    const opts = { generations: 60, population: 40, games: 6, depth: 3, validation: 200, workers: Math.max(1, os.cpus().length - 1), seed: 1, out: path.join(__dirname, '..', '..', 'games', 'chessdown', 'training_data.json') };
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
    let population = Array.from({ length: opts.population }, (_, i) => randomProfile(i, random));
    const output = { settings: { ...opts, out: undefined, maxPlies: MAX_PLIES }, generations: [], validation: null };
    console.log(`Training: ${opts.population} bots, ${opts.generations} generations, depth ${opts.depth}, ${opts.workers} workers`);

    for (let gen = 1; gen <= opts.generations; gen++) {
        population.forEach((p) => Object.assign(p, { fitness: 0, wins: 0, losses: 0, draws: 0 }));
        // Each bot meets random opponents, once with each colour (the first move matters a lot).
        const pairs = [];
        population.forEach((bot, i) => {
            for (let g = 0; g < opts.games / 2; g++) {
                let j = Math.floor(random() * population.length);
                if (j === i) j = (j + 1) % population.length;
                pairs.push([i, j], [j, i]);
            }
        });
        const tasks = pairs.map(([a, b]) => ({ p1: strip(population[a]), p2: strip(population[b]), depth: opts.depth, seed: Math.floor(random() * 2 ** 31) }));
        const winners = await pool.run(tasks);
        winners.forEach((winner, k) => {
            const [a, b] = pairs[k];
            const [w, l] = winner === 1 ? [a, b] : [b, a];
            if (winner === 0) {
                population[a].fitness += 1; population[b].fitness += 1;
                population[a].draws++; population[b].draws++;
            } else {
                population[w].fitness += 3; population[w].wins++; population[l].losses++;
            }
        });
        population.sort((x, y) => y.fitness - x.fitness);
        const best = population[0];
        const worst = population[population.length - 1];
        const avgFitness = population.reduce((s, p) => s + p.fitness, 0) / population.length;
        console.log(`Gen ${gen}: best ${best.wins}W ${best.draws}D ${best.losses}L, weights ${JSON.stringify(best.pieceWeights)}, avg fitness ${avgFitness.toFixed(1)}`);
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

    // Validation: the best bot against the standard profile, half the games with each colour.
    const best = strip(population[0]);
    const standard = strip({ id: 'standard', ...Bot.DEFAULT_PROFILE });
    const tasks = Array.from({ length: opts.validation }, (_, k) => ({
        p1: k % 2 ? standard : best, p2: k % 2 ? best : standard, depth: opts.depth, seed: Math.floor(random() * 2 ** 31),
    }));
    const winners = await pool.run(tasks);
    pool.close();
    const result = { games: opts.validation, wins: 0, draws: 0, losses: 0 };
    winners.forEach((winner, k) => {
        const bestSide = k % 2 ? 2 : 1;
        if (winner === 0) result.draws++;
        else if (winner === bestSide) result.wins++;
        else result.losses++;
    });
    output.validation = { opponent: 'standard profile (bot-search.js DEFAULT_PROFILE)', ...result };
    fs.writeFileSync(opts.out, JSON.stringify(output, null, 2) + '\n');
    console.log(`Validation vs standard profile: ${result.wins}W ${result.draws}D ${result.losses}L out of ${result.games}`);
    return output;
}

if (!isMainThread) {
    parentPort.on('message', ({ p1, p2, depth, seed }) => parentPort.postMessage(playGame(p1, p2, depth, seededRandom(seed))));
} else if (require.main === module) {
    train(parseArgs(process.argv.slice(2))).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { playGame, randomProfile, crossover, seededRandom, parseArgs, train };
