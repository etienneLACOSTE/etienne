// @ts-check
// Genetic training of the Ches'spell campaign bot.
//
// A population of bot profiles (piece values, positional terms, threat of the
// opponent's cards, and the value of each card kept in hand) plays full games with the
// real rules (games/chesspell/game.js) and the very bot the page uses
// (games/chesspell/bot.js). Decks are drawn at random (3 cards of 20) and the first
// moves are random, so the games differ. Each bot meets other bots, the standard
// profile and the original bot (heuristic spells), so it does not only learn to beat
// copies of itself. Genes stay in sensible, ordered ranges.
//
// At the end the best profile is validated, at a deeper search, against the standard
// profile and against the original bot, on the same games. Adopt the output
// (games/chesspell/training_data.json, read by the game) only if it beats the standard
// profile there.
//
// Usage: node tools/chesspell/train_spells.js [--generations 60] [--population 32]
//          [--games 6] [--standardGames 2] [--legacyGames 2] [--depth 2]
//          [--validationDepth 3] [--validation 300] [--workers N] [--seed 1] [--out path]
//          [--from earlier-output.json]   (start from the best bot of an earlier run)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const Rules = require('../../games/chesspell/rules.js');
const Game = require('../../games/chesspell/game.js');
const Bot = require('../../games/chesspell/bot.js');

const MAX_PLIES = 160; // Then the game is decided on material (or drawn)
const OPENING_PLIES = 4; // Random first moves, so that games differ
const DECK_SIZE = 3;
const SPELLS = Array.from({ length: 20 }, (_, i) => i + 1);

/** Allowed range of each gene. */
const BOUNDS = {
    p: [70, 130], n: [250, 420], b: [250, 420], r: [400, 650], q: [750, 1150],
    pstScale: [0, 2], pawnScale: [0, 2], kingScale: [0, 2], developmentScale: [0, 2],
    adjacencyThreat: [0, 0.8], domiThreat: [0, 0.5],
    card: [-50, 500],
};
const SCALE_GENES = ['pstScale', 'pawnScale', 'kingScale', 'developmentScale', 'adjacencyThreat', 'domiThreat'];
const clamp = (key, v, round = true) => {
    const x = Math.max(BOUNDS[key][0], Math.min(BOUNDS[key][1], v));
    return round ? Math.round(x) : Math.round(x * 100) / 100;
};

/** Keep a profile sensible: genes in range, queen > rook > minor pieces > pawn. */
function normalize(profile) {
    const w = profile.weights;
    for (const k of ['p', 'n', 'b', 'r', 'q']) w[k] = clamp(k, w[k]);
    w.p = Math.min(w.p, Math.min(w.n, w.b) - 100);
    w.r = Math.max(w.r, Math.max(w.n, w.b) + 50);
    w.q = Math.max(w.q, w.r + 200);
    for (const k of SCALE_GENES) profile[k] = clamp(k, profile[k], false);
    for (const id of SPELLS) profile.cardValues[id] = clamp('card', profile.cardValues[id]);
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

/** Cast a spell with game.js; false if it did not go through (the spell is dropped). */
function castSpell(state, spell, random) {
    const res = Game.activateSpell(state, spell.cardId);
    if (res.status === 'instant') return true;
    if (res.status !== 'targeting') return false;
    for (const t of spell.targets) {
        const click = Game.clickSquare(state, t.r, t.c, random);
        if (click.status === 'done') {
            if (click.endTurn) Game.endTurn(state);
            Game.completeSpell(state);
            return true;
        }
        if (click.status !== 'next') break;
    }
    Game.cancelSpell(state);
    return false;
}

/** Play a move with game.js, Assassin's victim included; the turn ends as in the page. */
function playMove(state, plan) {
    const { from, to } = plan.move;
    const result = Game.move(state, from.r, from.c, to.r, to.c);
    if (result === 'reverted') return; // The player moves again (as in the page)
    if (result === 'assassin_kill') {
        const kill = plan.kill || state.assassinTargets[0];
        Game.clickSquare(state, kill.r, kill.c);
    }
    Game.endTurn(state);
}

/** Any legal move of the player to move (for the random opening). */
function randomMove(state, random) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = state.board[r][c];
            if (p && p !== 'W' && Rules.getColor(p) === state.turn) {
                for (const m of Rules.getValidMoves(state, r, c)) moves.push({ from: { r, c }, to: { r: m.r, c: m.c } });
            }
        }
    }
    return moves.length ? { move: moves[Math.floor(random() * moves.length)], kill: null } : null;
}

/** One turn of `me` with `profile`: maybe a spell, then a move (as js/app-bot.js does). */
function playTurn(state, me, profile, decks, random) {
    const cards = Bot.hands(state, decks)[me];
    let plan;
    if (profile.spells === 'heuristic') {
        const spell = Bot.heuristicSpell(state, me, cards, Bot.LEGACY_GENES, random);
        if (spell) castSpell(state, spell, random);
        if (state.winner || state.turn !== me) return;
        plan = Bot.bestMove(state, me, decks, profile, random);
    } else {
        plan = Bot.chooseTurn(state, me, decks, profile, random);
        if (plan.spell) {
            castSpell(state, plan.spell, random);
            if (state.winner || state.turn !== me) return;
            plan = Bot.bestMove(state, me, decks, profile, random);
        }
    }
    if (plan.move) playMove(state, plan);
    else Game.endTurn(state);
}

/** Material balance for white (standard values), to decide unfinished games. */
function material(state) {
    let score = 0;
    for (const row of state.board) {
        for (const p of row) {
            if (!p || p === 'W' || p.toLowerCase() === 'k') continue;
            score += (Rules.getColor(p) === 'white' ? 1 : -1) * Bot.VALUES[p.toLowerCase()];
        }
    }
    return score;
}

/**
 * One game. `white` and `black` are profiles (spells: 'search' or 'heuristic'),
 * `decks` their cards. Returns 'white', 'black' or 'draw'.
 */
function playGame(white, black, depth, random, decks) {
    const state = Game.newGame();
    const profiles = { white: { ...white, depth }, black: { ...black, depth } };
    for (let ply = 0; ply < OPENING_PLIES; ply++) {
        const plan = randomMove(state, random);
        if (plan) playMove(state, plan);
    }
    for (let turn = 0; turn < MAX_PLIES && !state.winner; turn++) {
        playTurn(state, state.turn, profiles[state.turn], decks, random);
    }
    if (state.winner) return state.winner.toLowerCase();
    const balance = material(state);
    return balance >= 300 ? 'white' : balance <= -300 ? 'black' : 'draw';
}

/** A random deck of distinct cards. */
function randomDeck(random) {
    const pool = [...SPELLS];
    const deck = [];
    while (deck.length < DECK_SIZE) deck.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return deck;
}

/** A profile: `base` (the standard one) with every gene drawn at random in its range (`spread` 1), or near it. */
function randomProfile(id, random, spread = 1, base = Bot.DEFAULT_PROFILE) {
    const near = (key, v) => {
        const [lo, hi] = BOUNDS[key];
        return v + (random() * 2 - 1) * spread * (hi - lo) / 2;
    };
    const profile = {
        ...JSON.parse(JSON.stringify(Bot.DEFAULT_PROFILE)),
        ...JSON.parse(JSON.stringify(base)),
        id,
        fitness: 0, wins: 0, losses: 0, draws: 0,
    };
    for (const k of ['p', 'n', 'b', 'r', 'q']) profile.weights[k] = near(k, base.weights[k]);
    for (const k of SCALE_GENES) profile[k] = near(k, base[k]);
    for (const idKey of SPELLS) profile.cardValues[idKey] = near('card', base.cardValues[idKey]);
    return normalize(profile);
}

/** A child mixes its parents' genes; each gene may mutate (±20 %, card values ±60). */
function crossover(parent1, parent2, id, random) {
    const child = randomProfile(id, random, 0);
    const pick = (a, b) => (random() < 0.5 ? a : b);
    const mutate = (v) => (random() >= 0.2 ? v : v * (0.8 + random() * 0.4));
    for (const k of ['p', 'n', 'b', 'r', 'q']) child.weights[k] = mutate(pick(parent1.weights[k], parent2.weights[k]));
    for (const k of SCALE_GENES) child[k] = mutate(pick(parent1[k], parent2[k]));
    for (const s of SPELLS) {
        const v = pick(parent1.cardValues[s], parent2.cardValues[s]);
        child.cardValues[s] = random() >= 0.2 ? v : v + (random() * 2 - 1) * 60;
    }
    return normalize(child);
}

/** Only the genes (what the game needs). */
function strip(profile) {
    const { id, weights, cardValues, spells, spellCandidates } = profile;
    return { id, spells, spellCandidates, weights: { ...weights }, cardValues: { ...cardValues }, ...Object.fromEntries(SCALE_GENES.map((k) => [k, profile[k]])) };
}

/** Games run in worker threads; each task is { white, black, depth, seed, decks }. */
function createPool(size) {
    const workers = Array.from({ length: size }, () => new Worker(__filename));
    /** @type {((err: Error) => void) | null} */
    let fail = null;
    workers.forEach((w) => w.on('error', (err) => fail && fail(err)));
    return {
        /** @param {Array<{white: any, black: any, depth: number, seed: number, decks: any}>} tasks @returns {Promise<string[]>} */
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
    const opts = {
        generations: 60, population: 32, games: 6, standardGames: 2, legacyGames: 2, depth: 2, validationDepth: 3,
        validation: 300, workers: Math.max(1, os.cpus().length - 1), seed: 1, from: '',
        out: path.join(__dirname, '..', '..', 'games', 'chesspell', 'training_data.json'),
    };
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i].replace(/^--/, '');
        if (!(key in opts)) throw new Error(`Unknown option --${key}`);
        opts[key] = key === 'out' || key === 'from' ? argv[i + 1] : Number(argv[i + 1]);
    }
    return opts;
}

/**
 * `profile` against `opponent` on `games` games (both colours, same decks and seeds
 * for whoever is measured): { games, wins, draws, losses, score }.
 */
async function match(pool, profile, opponent, games, depth, seedOf) {
    const tasks = [];
    const sides = [];
    for (let k = 0; k < games; k++) {
        const random = seededRandom(seedOf(k));
        const decks = { white: randomDeck(random), black: randomDeck(random) };
        const side = k % 2 ? 'black' : 'white';
        tasks.push(side === 'white'
            ? { white: profile, black: opponent, depth, seed: seedOf(k), decks }
            : { white: opponent, black: profile, depth, seed: seedOf(k), decks });
        sides.push(side);
    }
    const winners = await pool.run(tasks);
    const wins = winners.filter((w, k) => w === sides[k]).length;
    const draws = winners.filter((w) => w === 'draw').length;
    return { games, wins, draws, losses: games - wins - draws, score: Math.round(((wins + draws / 2) / games) * 1000) / 10 };
}

async function train(opts) {
    const random = seededRandom(opts.seed);
    const pool = createPool(opts.workers);
    const standard = strip({ ...Bot.DEFAULT_PROFILE, id: 'standard' });
    const legacy = strip({ ...Bot.LEGACY_PROFILE, id: 'legacy' });
    const seed = () => Math.floor(random() * 2 ** 31);
    const game = (a, b, side) => {
        const decks = { white: randomDeck(random), black: randomDeck(random) };
        return side === 'white'
            ? { white: a, black: b, depth: opts.depth, seed: seed(), decks }
            : { white: b, black: a, depth: opts.depth, seed: seed(), decks };
    };

    // The starting profile (the standard one, or the best of an earlier run with --from),
    // some close variants and some far ones.
    const start = opts.from ? JSON.parse(fs.readFileSync(opts.from, 'utf8')).generations.at(-1).bestBot : Bot.DEFAULT_PROFILE;
    let population = Array.from({ length: opts.population }, (_, i) =>
        (i === 0 ? randomProfile(0, random, 0, start)
            : randomProfile(i, random, i < opts.population / 2 ? 0.15 : opts.from ? 0.4 : 1, start)));
    const output = { settings: { ...opts, out: undefined, maxPlies: MAX_PLIES, openingPlies: OPENING_PLIES, bounds: BOUNDS }, generations: [], validation: null };
    console.log(`Training: ${opts.population} bots, ${opts.generations} generations, depth ${opts.depth}, ${opts.workers} workers`);

    for (let gen = 1; gen <= opts.generations; gen++) {
        const started = Date.now();
        population.forEach((p) => Object.assign(p, { fitness: 0, wins: 0, losses: 0, draws: 0, vsStandard: 0, vsLegacy: 0 }));
        const tasks = [];
        const owners = []; // [bot index, its side, opponent index, or -1 standard, -2 legacy]
        population.forEach((bot, i) => {
            const add = (opponent, j, count) => {
                for (let g = 0; g < count / 2; g++) {
                    for (const side of ['white', 'black']) {
                        tasks.push(game(strip(bot), opponent, side));
                        owners.push([i, side, j]);
                    }
                }
            };
            for (let g = 0; g < opts.games / 2; g++) {
                let j = Math.floor(random() * population.length);
                if (j === i) j = (j + 1) % population.length;
                add(strip(population[j]), j, 2);
            }
            add(standard, -1, opts.standardGames);
            add(legacy, -2, opts.legacyGames);
        });
        const winners = await pool.run(tasks);
        winners.forEach((winner, k) => {
            const [i, side, j] = owners[k];
            const bot = population[i];
            const result = winner === 'draw' ? 'draw' : winner === side ? 'win' : 'loss';
            bot.fitness += result === 'win' ? 3 : result === 'draw' ? 1 : 0;
            bot[result === 'win' ? 'wins' : result === 'draw' ? 'draws' : 'losses']++;
            if (j === -1 && result === 'win') bot.vsStandard++;
            if (j === -2 && result === 'win') bot.vsLegacy++;
            if (j >= 0) population[j].fitness += result === 'loss' ? 3 : result === 'draw' ? 1 : 0;
        });
        population.sort((x, y) => y.fitness - x.fitness);
        const best = population[0];
        const seconds = Math.round((Date.now() - started) / 1000);
        console.log(`Gen ${gen} (${seconds}s): best ${best.wins}W ${best.draws}D ${best.losses}L (${best.vsStandard}/${opts.standardGames} vs standard, ${best.vsLegacy}/${opts.legacyGames} vs original), weights ${JSON.stringify(best.weights)}`);
        output.generations.push({ generation: gen, bestBot: strip(best), fitness: best.fitness, record: { wins: best.wins, draws: best.draws, losses: best.losses } });
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

    // Validation, deeper: the same games (decks, seeds) for the best bot and for the
    // standard profile, against the original bot; and the best bot against the standard.
    const best = strip(population[0]);
    const seedOf = (k) => 7_000_000 + k;
    const d = opts.validationDepth;
    output.validation = {
        depth: d,
        bestVsStandard: await match(pool, best, standard, opts.validation, d, seedOf),
        bestVsOriginal: await match(pool, best, legacy, opts.validation, d, seedOf),
        standardVsOriginal: await match(pool, standard, legacy, opts.validation, d, seedOf),
    };
    pool.close();
    fs.writeFileSync(opts.out, JSON.stringify(output, null, 2) + '\n');
    const line = (r) => `${r.wins}W ${r.draws}D ${r.losses}L / ${r.games} (${r.score}%)`;
    const v = output.validation;
    console.log(`Validation (depth ${d}): best vs standard ${line(v.bestVsStandard)}; best vs original ${line(v.bestVsOriginal)}; standard vs original ${line(v.standardVsOriginal)}`);
    return output;
}

if (!isMainThread) {
    parentPort.on('message', ({ white, black, depth, seed, decks }) => {
        let result;
        try {
            result = playGame(white, black, depth, seededRandom(seed), decks);
        } catch (err) {
            // A bot bug must not end a night of training: report it (with what replays it) and call it a draw.
            console.error(`Game crashed (seed ${seed}, depth ${depth}, decks ${JSON.stringify(decks)}, bots ${white.id} vs ${black.id}):`, err);
            result = 'draw';
        }
        parentPort.postMessage(result);
    });
} else if (require.main === module) {
    train(parseArgs(process.argv.slice(2))).then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
}

module.exports = { playGame, playTurn, castSpell, randomDeck, randomProfile, crossover, normalize, strip, seededRandom, parseArgs, match, createPool, train, BOUNDS };
