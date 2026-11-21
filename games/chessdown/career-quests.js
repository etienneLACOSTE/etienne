// @ts-check
// Chessdown career (docs/games/chessdown-career.md): the places of each map and the catalogue
// of side quests, tier by tier. Data only: each quest says where it is given, what the match
// is (format, special rules, opponent), what must be done and what it brings. Its texts are
// keys: `quest.<id>.title`, `quest.<id>.giver`, `quest.<id>.quote`; places: `place.<id>`.
// A few quests are drawn each season (career-rules.js); one that is done is gone for good.
// Loaded by the browser (as `window.ChessdownQuests`) and by Node (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownQuests = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    const TIER_IDS = ['school', 'county', 'region', 'national', 'international'];

    /**
     * The places of each map. `home` is the club, `stadium` the league's ground, `transport`
     * the way to the next tier (bus, RER, TGV, plane); the others give side quests.
     */
    const PLACES = {
        school: ['home', 'stadium', 'transport', 'cafe', 'school', 'park', 'citystade', 'townhall', 'market', 'gym'],
        county: ['home', 'stadium', 'transport', 'inn', 'farmschool', 'farm', 'pond', 'mill', 'chateau', 'church', 'lodge'],
        region: ['home', 'stadium', 'transport', 'chalet', 'academy', 'winery', 'lake', 'refuge', 'observatory', 'pass', 'thermal'],
        national: ['home', 'stadium', 'transport', 'port', 'academy', 'studio', 'lighthouse', 'racetrack', 'museum', 'palace', 'newspaper'],
        international: ['home', 'stadium', 'seoul', 'lagos', 'sydney', 'kyoto', 'rio', 'oslo', 'prague', 'montreal'],
    };
    /** How the coach travels to the next tier, from that tier's map (none from the world). */
    const TRANSPORT = { school: 'bus', county: 'rer', region: 'tgv', national: 'plane' };

    const PIECES = ['p', 'n', 'b', 'r', 'q'];
    const FORMATS = ['single', 'bo3'];
    /**
     * The special rules a quest may set (games/chessdown/engine.js, step 2 of the plan):
     *   squad: the only pieces the player may field (types, with repeats, king included)
     *   banned: piece types neither side may field
     *   maxPieces: at most this many pieces for the player, king included
     *   originalSquad: only the club's first seven players
     *   noRetreat: no piece may move back towards its own end zone
     *   invertedRows: the player drafts on the three rows nearest the middle
     *   noCaptureMoves: no capture by the player during its first N moves
     *   timer: seconds per turn
     *   lockedLineup: the same line-up for every game of the quest
     */
    const RULES = ['squad', 'banned', 'maxPieces', 'originalSquad', 'noRetreat', 'invertedRows', 'noCaptureMoves', 'timer', 'lockedLineup'];
    /** What must be done: win the match, score with a given piece, score n touchdowns in the best of 3 (a touchdown wins a game), solve a puzzle, win n games in a row. */
    const GOALS = ['win', 'touchdownWith', 'touchdowns', 'puzzle', 'streak'];
    /** Who the experience goes to: every club player, those who played, or the players of one type. */
    const XP_TARGETS = ['all', 'engaged', ...PIECES];

    /**
     * @typedef {{ squad?: string[], banned?: string[], maxPieces?: number, originalSquad?: boolean, noRetreat?: boolean, invertedRows?: boolean, noCaptureMoves?: number, timer?: number, lockedLineup?: boolean }} Rules
     * @typedef {{ type: string, piece?: string, n?: number, id?: string, moves?: number }} Goal
     * @typedef {{ xp?: { to: string, amount: number }, recruit?: { type: string, level: number, name?: string }, recruitChoice?: { level: number }, cosmetic?: string }} Reward
     * @typedef {{ id: string, tier: string, place: string, kind: string, format: string, rules: Rules, goal: Goal, reward: Reward, minSeason: number, opponent?: { difficulty?: string, budget?: number, level?: number, archetype?: string } }} Quest
     */
    /** @returns {Quest} */
    const quest = (id, tier, place, kind, format, rules, goal, reward, minSeason = 1, opponent = undefined) =>
        ({ id, tier, place, kind, format, rules, goal, reward, minSeason, ...(opponent ? { opponent } : {}) });
    const win = { type: 'win' };
    /** Experience a quest done brings: a little, to each piece that played it (the king gains none). */
    const QUEST_XP = 5;
    const XP = { xp: { to: 'engaged', amount: QUEST_XP } };

    /** @type {Quest[]} */
    const QUESTS = [
        // School: the town of Saint-Aubin
        quest('counter-bet', 'school', 'cafe', 'challenge', 'single', { squad: ['k', 'p', 'p', 'p'] }, win, XP),
        quest('shy-knight', 'school', 'school', 'recruit', 'single', {}, { type: 'touchdownWith', piece: 'n' }, { recruit: { type: 'n', level: 2, name: 'Inès' } }),
        quest('sunday-jog', 'school', 'park', 'puzzle', 'single', {}, { type: 'puzzle', id: 'rook-run', moves: 3 }, XP),
        quest('street-match', 'school', 'citystade', 'special', 'single', { timer: 15 }, win, XP),
        quest('market-rush', 'school', 'market', 'challenge', 'single', { maxPieces: 5 }, win, XP),
        quest('gym-warmup', 'school', 'gym', 'puzzle', 'single', {}, { type: 'puzzle', id: 'pawn-push', moves: 4 }, XP),
        quest('mayor-photo', 'school', 'townhall', 'recruit', 'bo3', {}, { type: 'touchdowns', n: 2 }, { recruit: { type: 'p', level: 2, name: 'Basile' } }, 2),
        quest('quiet-pitch', 'school', 'park', 'challenge', 'single', { noCaptureMoves: 6 }, win, XP, 2),
        // County: Val-de-Loir
        quest('veteran', 'county', 'inn', 'recruit', 'bo3', {}, win, { recruit: { type: 'b', level: 3 } }, 1, { difficulty: 'expert', budget: 15 }),
        quest('ploughing', 'county', 'farmschool', 'challenge', 'single', { noCaptureMoves: 10 }, win, XP),
        quest('village-fair', 'county', 'farm', 'streak', 'single', { lockedLineup: true }, { type: 'streak', n: 3 }, XP),
        quest('pond-hop', 'county', 'pond', 'puzzle', 'single', {}, { type: 'puzzle', id: 'knight-hop', moves: 3 }, XP),
        quest('windmill', 'county', 'mill', 'special', 'single', { banned: ['q'] }, win, XP),
        quest('castle-guard', 'county', 'chateau', 'recruit', 'single', {}, { type: 'touchdownWith', piece: 'r' }, { recruit: { type: 'r', level: 2 } }),
        quest('choir', 'county', 'church', 'challenge', 'single', { squad: ['k', 'b', 'b', 'p', 'p', 'p'] }, win, XP, 2),
        quest('hunters', 'county', 'lodge', 'special', 'single', { maxPieces: 6, timer: 20 }, win, XP, 2),
        // Region: the Highlands
        quest('snow-match', 'region', 'chalet', 'special', 'single', { noRetreat: true, timer: 20 }, win, XP),
        quest('scouting', 'region', 'academy', 'recruit', 'single', {}, win, { recruitChoice: { level: 2 } }),
        quest('harvest', 'region', 'winery', 'special', 'bo3', { banned: ['b'] }, win, XP),
        quest('lake-crossing', 'region', 'lake', 'puzzle', 'single', {}, { type: 'puzzle', id: 'lake-crossing', moves: 4 }, XP),
        quest('mountain-hut', 'region', 'refuge', 'challenge', 'single', { maxPieces: 5 }, win, XP),
        quest('stargazer', 'region', 'observatory', 'puzzle', 'single', {}, { type: 'puzzle', id: 'bishop-ray', moves: 3 }, XP),
        quest('mountain-pass', 'region', 'pass', 'special', 'single', { timer: 15 }, win, XP, 2),
        quest('hot-springs', 'region', 'thermal', 'challenge', 'single', { noCaptureMoves: 12 }, win, XP, 2),
        // National
        quest('port-tour', 'national', 'port', 'streak', 'single', { lockedLineup: true }, { type: 'streak', n: 3 }, XP),
        quest('prodigy', 'national', 'academy', 'recruit', 'single', { maxPieces: 5 }, win, { recruit: { type: 'q', level: 3 } }),
        quest('tv-show', 'national', 'studio', 'special', 'single', { invertedRows: true }, win, XP),
        quest('lighthouse', 'national', 'lighthouse', 'puzzle', 'single', {}, { type: 'puzzle', id: 'queen-tide', moves: 4 }, XP),
        quest('grand-prix', 'national', 'racetrack', 'special', 'single', { timer: 10 }, win, XP),
        quest('museum-night', 'national', 'museum', 'recruit', 'single', { squad: ['k', 'q', 'r', 'r', 'b', 'n', 'p', 'p'] }, win, { recruit: { type: 'n', level: 3 } }),
        quest('state-visit', 'national', 'palace', 'special', 'bo3', { noRetreat: true }, win, XP, 2),
        quest('front-page', 'national', 'newspaper', 'challenge', 'bo3', {}, { type: 'touchdowns', n: 2 }, XP, 2),
        // International
        quest('midnight-blitz', 'international', 'seoul', 'special', 'bo3', { timer: 10 }, win, XP),
        quest('founders', 'international', 'lagos', 'cosmetic', 'single', { originalSquad: true }, win, { cosmetic: 'jersey-heritage' }),
        quest('upside-down', 'international', 'sydney', 'special', 'bo3', { invertedRows: true }, win, XP),
        quest('origami', 'international', 'kyoto', 'special', 'single', { banned: ['q', 'r'] }, win, XP),
        quest('carnival', 'international', 'rio', 'streak', 'single', { timer: 20 }, { type: 'streak', n: 3 }, XP),
        quest('fjord', 'international', 'oslo', 'special', 'bo3', { noRetreat: true }, win, XP),
        quest('castle-hill', 'international', 'prague', 'recruit', 'single', { maxPieces: 5 }, win, { recruit: { type: 'r', level: 4 } }, 2),
        quest('cold-snap', 'international', 'montreal', 'challenge', 'bo3', { noCaptureMoves: 15 }, win, XP, 2),
    ];

    /**
     * The puzzles of the 'puzzle' quests: player 1's pieces ([row, col, type, level]), the other
     * side's king and its stones (pawns that never move: the bot passes its turns). Reach the
     * end zone (row 0) or take the king in `moves` moves at most. `solution` is a shortest one;
     * tests/unit/chessdown-puzzles.test.js checks that none is shorter.
     */
    const PUZZLES = {
        'rook-run': { moves: 3, mine: [[11, 6, 'k', 5], [9, 3, 'r', 1]], king: [0, 7], stones: [[8, 7], [5, 5], [6, 1], [3, 3]], solution: 'r9,3>6,3 r6,3>3,3 r3,3>0,3' },
        'pawn-push': { moves: 4, mine: [[11, 6, 'k', 5], [4, 3, 'p', 3]], king: [0, 7], stones: [[3, 4], [3, 3], [3, 6], [1, 1]], solution: 'p4,3>3,4 p3,4>2,4 p2,4>1,4 p1,4>0,4' },
        'knight-hop': { moves: 3, mine: [[11, 6, 'k', 5], [6, 3, 'n', 3]], king: [0, 7], stones: [[4, 7], [1, 4], [2, 2], [4, 0], [1, 3], [5, 5]], solution: 'n6,3>4,2 n4,2>2,1 n2,1>0,0' },
        'lake-crossing': { moves: 4, mine: [[11, 6, 'k', 5], [11, 0, 'r', 1]], king: [0, 7], stones: [[6, 0], [6, 1], [7, 7], [4, 4]], solution: 'r11,0>9,0 r9,0>6,0 r6,0>3,0 r3,0>0,0' },
        'bishop-ray': { moves: 3, mine: [[11, 6, 'k', 5], [8, 2, 'b', 2]], king: [0, 7], stones: [[5, 5], [7, 7], [1, 7], [3, 2], [7, 2], [7, 0]], solution: 'b8,2>7,3 b7,3>4,0 b4,0>0,4' },
        'queen-tide': { moves: 4, mine: [[11, 6, 'k', 5], [11, 1, 'q', 1]], king: [0, 7], stones: [[7, 5], [8, 7], [6, 5], [6, 6], [2, 7], [10, 1], [4, 6], [7, 6], [3, 3], [8, 1], [10, 2]], solution: 'q11,1>10,1 q10,1>8,1 q8,1>4,1 q4,1>0,1' },
    };

    const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

    /** What is wrong with a quest (empty when it is fine); the tests run it on the whole catalogue. */
    function checkQuest(q) {
        const errors = [];
        if (!/^[a-z0-9-]{2,32}$/.test(q.id)) errors.push('id');
        if (!TIER_IDS.includes(q.tier)) errors.push('tier');
        else if (!PLACES[q.tier].includes(q.place) || ['home', 'stadium', 'transport'].includes(q.place)) errors.push('place');
        if (!['challenge', 'recruit', 'puzzle', 'special', 'streak', 'cosmetic'].includes(q.kind)) errors.push('kind');
        if (!FORMATS.includes(q.format)) errors.push('format');
        if (!isInt(q.minSeason, 1, 99)) errors.push('minSeason');
        const r = q.rules || {};
        for (const key of Object.keys(r)) if (!RULES.includes(key)) errors.push(`rule ${key}`);
        if (r.squad && !(Array.isArray(r.squad) && r.squad.filter((t) => t === 'k').length === 1 && r.squad.every((t) => t === 'k' || PIECES.includes(t)))) errors.push('squad');
        if (r.banned && !(Array.isArray(r.banned) && r.banned.length && r.banned.every((t) => PIECES.includes(t)))) errors.push('banned');
        if (r.maxPieces !== undefined && !isInt(r.maxPieces, 2, 24)) errors.push('maxPieces');
        if (r.noCaptureMoves !== undefined && !isInt(r.noCaptureMoves, 1, 40)) errors.push('noCaptureMoves');
        if (r.timer !== undefined && !isInt(r.timer, 5, 60)) errors.push('timer');
        const g = q.goal || {};
        if (!GOALS.includes(g.type)) errors.push('goal');
        if (g.type === 'touchdownWith' && !PIECES.includes(g.piece)) errors.push('goal piece');
        if ((g.type === 'touchdowns' || g.type === 'streak') && !isInt(g.n, 2, 10)) errors.push('goal n');
        if (g.type === 'touchdowns' && (q.format !== 'bo3' || g.n > 2)) errors.push('touchdowns: at most 2, in a best of 3');
        if (g.type === 'puzzle' && !(PUZZLES[g.id] && PUZZLES[g.id].moves === g.moves)) errors.push('puzzle');
        if (g.type === 'streak' && q.format !== 'single') errors.push('streak of single games');
        const w = q.reward || {};
        const rewards = ['xp', 'recruit', 'recruitChoice', 'cosmetic'].filter((k) => w[k] !== undefined);
        if (rewards.length !== 1) errors.push('one reward');
        if (w.xp && !(XP_TARGETS.includes(w.xp.to) && isInt(w.xp.amount, 1, 500))) errors.push('xp');
        if (w.recruit && !(PIECES.includes(w.recruit.type) && isInt(w.recruit.level, 1, 5))) errors.push('recruit');
        if (w.recruitChoice && !isInt(w.recruitChoice.level, 1, 5)) errors.push('recruitChoice');
        if (w.cosmetic !== undefined && !/^[a-z-]{2,32}$/.test(w.cosmetic)) errors.push('cosmetic');
        if (q.opponent) {
            const o = q.opponent;
            if (o.difficulty !== undefined && !['novice', 'apprentice', 'expert', 'master'].includes(o.difficulty)) errors.push('opponent difficulty');
            if (o.budget !== undefined && !isInt(o.budget, 4, 39)) errors.push('opponent budget');
            if (o.level !== undefined && !isInt(o.level, 1, 5)) errors.push('opponent level');
        }
        return errors;
    }

    /** A quest by id, or null. */
    function questById(id) {
        return QUESTS.find((q) => q.id === id) || null;
    }

    return { TIER_IDS, PLACES, TRANSPORT, RULES, GOALS, XP_TARGETS, QUEST_XP, QUESTS, PUZZLES, checkQuest, questById };
});
