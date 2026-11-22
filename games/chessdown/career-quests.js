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
     *   budget: the player's draft points (fewer than the opponent's: an underdog match)
     *   timerSteps: seconds per turn in games 1, 2 and 3 of a best of 3 (a blitz that speeds up)
     *   noTouchdowns: touchdowns do not count, for either side: take the king
     *   noKingCapture: the player may not take the king: a touchdown wins
     */
    const RULES = ['squad', 'banned', 'maxPieces', 'originalSquad', 'noRetreat', 'invertedRows', 'noCaptureMoves', 'timer', 'lockedLineup',
        'budget', 'timerSteps', 'noTouchdowns', 'noKingCapture'];
    /**
     * What must be done: win the match, score with a given piece (the king: an escort), score n
     * touchdowns in the best of 3 (a touchdown wins a game), solve a puzzle, win n games in a
     * row, hold out n turns of the opponent (a win too), take n pieces (the game is won when
     * the n-th falls), win without losing a piece.
     */
    const GOALS = ['win', 'touchdownWith', 'touchdowns', 'puzzle', 'streak', 'survive', 'captures', 'cleanSheet'];
    /** Who the experience goes to: every club player, those who played, or the players of one type. */
    const XP_TARGETS = ['all', 'engaged', ...PIECES];

    /**
     * @typedef {{ squad?: string[], banned?: string[], maxPieces?: number, originalSquad?: boolean, noRetreat?: boolean, invertedRows?: boolean, noCaptureMoves?: number, timer?: number, lockedLineup?: boolean,
     *   budget?: number, timerSteps?: number[], noTouchdowns?: boolean, noKingCapture?: boolean }} Rules
     * @typedef {{ type: string, piece?: string, n?: number, id?: string, moves?: number }} Goal
     * @typedef {{ xp?: { to: string, amount: number }, recruit?: { type: string, level: number, name?: string }, recruitChoice?: { level: number }, cosmetic?: string }} Reward
     * A boss (opponent.army, opponent.boss): a named coach (career-coaches.js, `boss`) whose
     * army is fixed, a king and a few pieces at high levels ([type, level]).
     * @typedef {{ difficulty?: string, budget?: number, level?: number, archetype?: string, army?: [string, number][], boss?: string }} Opponent
     * @typedef {{ id: string, tier: string, place: string, kind: string, format: string, rules: Rules, goal: Goal, reward: Reward, minSeason: number, opponent?: Opponent }} Quest
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

        // Variants (2026-11-21): escorts, holding out, hunting, clean sheets, bosses, underdogs, blitzes
        quest('kings-walk', 'school', 'school', 'challenge', 'single', {}, { type: 'touchdownWith', piece: 'k' }, XP),
        quest('hide-and-seek', 'school', 'park', 'challenge', 'single', {}, { type: 'survive', n: 10 }, XP, 1, { budget: 16 }),
        quest('pillow-fight', 'school', 'gym', 'challenge', 'single', {}, { type: 'captures', n: 3 }, XP),
        quest('city-king', 'school', 'citystade', 'boss', 'single', {}, win, { recruitChoice: { level: 2 } }, 1, { difficulty: 'apprentice', boss: 'caid', army: [['r', 3], ['n', 2], ['p', 2], ['p', 2]] }),
        quest('old-bull', 'county', 'farm', 'boss', 'single', {}, win, { recruit: { type: 'r', level: 3 } }, 1, { difficulty: 'expert', boss: 'taureau', army: [['r', 4], ['r', 4]] }),
        quest('mud-match', 'county', 'pond', 'special', 'single', { noTouchdowns: true }, win, XP),
        quest('clean-harvest', 'county', 'mill', 'challenge', 'single', {}, { type: 'cleanSheet' }, XP, 2),
        quest('peak-queen', 'region', 'pass', 'boss', 'single', {}, win, { recruitChoice: { level: 3 } }, 1, { difficulty: 'expert', boss: 'cimes', army: [['q', 5], ['b', 4]] }),
        quest('avalanche', 'region', 'refuge', 'challenge', 'single', {}, { type: 'survive', n: 16 }, XP, 1, { budget: 39 }),
        quest('grape-race', 'region', 'winery', 'special', 'single', { noKingCapture: true }, win, XP),
        quest('champion', 'national', 'palace', 'boss', 'bo3', {}, win, { recruit: { type: 'q', level: 4 } }, 1, { difficulty: 'master', boss: 'valmont', army: [['q', 5], ['n', 5], ['b', 5]] }),
        quest('underdog', 'national', 'studio', 'challenge', 'bo3', { budget: 25 }, win, XP, 1, { budget: 39 }),
        quest('press-blitz', 'national', 'newspaper', 'special', 'bo3', { timerSteps: [20, 15, 10] }, win, XP),
        quest('legend', 'international', 'oslo', 'boss', 'bo3', {}, win, { recruit: { type: 'r', level: 5 } }, 1, { difficulty: 'master', boss: 'kingsley', army: [['q', 5], ['q', 5], ['r', 5], ['n', 5]] }),
        quest('samba-escort', 'international', 'rio', 'challenge', 'single', {}, { type: 'touchdownWith', piece: 'k' }, XP),
        quest('night-hunt', 'international', 'seoul', 'special', 'single', { noTouchdowns: true }, { type: 'captures', n: 5 }, XP),
    ];

    /**
     * The puzzles of the 'puzzle' quests: player 1's pieces ([row, col, type, level]), the other
     * side's king and its pawns (level 3). The other side plays too (bot-search.js
     * puzzleDefense): win in `moves` moves at most, whatever it answers, by taking the king or
     * by a touchdown it cannot take back. tests/unit/chessdown-puzzles.test.js checks that
     * each one is won by force in exactly that many moves (bot-search.js puzzleFewest).
     */
    const PUZZLES = {
        'rook-run': { moves: 3, mine: [[11, 6, 'k', 5], [4, 4, 'r', 1]], king: [1, 6], stones: [[2, 4], [7, 0], [4, 6], [2, 7]] },
        'pawn-push': { moves: 4, mine: [[11, 6, 'k', 5], [4, 0, 'p', 3]], king: [1, 6], stones: [[3, 0], [6, 1], [6, 7], [3, 1], [7, 1]] },
        'knight-hop': { moves: 3, mine: [[11, 6, 'k', 5], [4, 0, 'n', 3]], king: [1, 0], stones: [[3, 0], [6, 2], [7, 7], [2, 2], [1, 3], [3, 2]] },
        'lake-crossing': { moves: 4, mine: [[11, 6, 'k', 5], [7, 3, 'r', 1]], king: [1, 2], stones: [[2, 3], [3, 5], [1, 7], [7, 2]] },
        'bishop-ray': { moves: 3, mine: [[11, 6, 'k', 5], [5, 3, 'b', 2]], king: [0, 3], stones: [[3, 3], [1, 5], [2, 7], [3, 5], [2, 2], [5, 2]] },
        'queen-tide': { moves: 4, mine: [[11, 6, 'k', 5], [9, 5, 'q', 1]], king: [0, 3], stones: [[8, 5], [3, 5], [1, 6], [3, 6], [2, 7], [1, 0], [6, 5], [1, 3]] },
    };

    const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

    /** What is wrong with a quest (empty when it is fine); the tests run it on the whole catalogue. */
    function checkQuest(q) {
        const errors = [];
        if (!/^[a-z0-9-]{2,32}$/.test(q.id)) errors.push('id');
        if (!TIER_IDS.includes(q.tier)) errors.push('tier');
        else if (!PLACES[q.tier].includes(q.place) || ['home', 'stadium', 'transport'].includes(q.place)) errors.push('place');
        if (!['challenge', 'recruit', 'puzzle', 'special', 'streak', 'cosmetic', 'boss'].includes(q.kind)) errors.push('kind');
        if (!FORMATS.includes(q.format)) errors.push('format');
        if (!isInt(q.minSeason, 1, 99)) errors.push('minSeason');
        const r = q.rules || {};
        for (const key of Object.keys(r)) if (!RULES.includes(key)) errors.push(`rule ${key}`);
        if (r.squad && !(Array.isArray(r.squad) && r.squad.filter((t) => t === 'k').length === 1 && r.squad.every((t) => t === 'k' || PIECES.includes(t)))) errors.push('squad');
        if (r.banned && !(Array.isArray(r.banned) && r.banned.length && r.banned.every((t) => PIECES.includes(t)))) errors.push('banned');
        if (r.maxPieces !== undefined && !isInt(r.maxPieces, 2, 24)) errors.push('maxPieces');
        if (r.noCaptureMoves !== undefined && !isInt(r.noCaptureMoves, 1, 40)) errors.push('noCaptureMoves');
        if (r.timer !== undefined && !isInt(r.timer, 5, 60)) errors.push('timer');
        if (r.budget !== undefined && !isInt(r.budget, 10, 38)) errors.push('budget');
        if (r.timerSteps !== undefined && !(q.format === 'bo3' && Array.isArray(r.timerSteps) && r.timerSteps.length === 3 && r.timerSteps.every((n) => isInt(n, 5, 60)))) errors.push('timerSteps');
        if (r.timer !== undefined && r.timerSteps !== undefined) errors.push('one timer');
        if (r.noTouchdowns && r.noKingCapture) errors.push('a way to win');
        const g = q.goal || {};
        if (!GOALS.includes(g.type)) errors.push('goal');
        if (g.type === 'touchdownWith' && !['k', ...PIECES].includes(g.piece)) errors.push('goal piece');
        if (r.noTouchdowns && ['touchdownWith', 'touchdowns'].includes(g.type)) errors.push('touchdowns are off');
        if ((g.type === 'survive' && !isInt(g.n, 4, 40)) || (g.type === 'captures' && !isInt(g.n, 2, 10))) errors.push('goal n');
        if (['survive', 'captures'].includes(g.type) && q.format !== 'single') errors.push('one game');
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
            if (o.army !== undefined && !(Array.isArray(o.army) && o.army.length >= 1 && o.army.length <= 6
                && o.army.every((a) => Array.isArray(a) && PIECES.includes(a[0]) && isInt(a[1], 1, 5)))) errors.push('opponent army');
            if ((o.boss !== undefined) !== (o.army !== undefined) || (o.army !== undefined) !== (q.kind === 'boss')) errors.push('boss');
        } else if (q.kind === 'boss') errors.push('boss');
        return errors;
    }

    /** A quest by id, or null. */
    function questById(id) {
        return QUESTS.find((q) => q.id === id) || null;
    }

    return { TIER_IDS, PLACES, TRANSPORT, RULES, GOALS, XP_TARGETS, QUEST_XP, QUESTS, PUZZLES, checkQuest, questById };
});
