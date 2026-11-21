// @ts-check
// Chessdown career (docs/games/chessdown-career.md): tiers, leagues, tickets and side quests.
// Pure functions on a plain career object (kept in the browser for now, checked by
// sanitizeCareer every time it is read). Everything random is drawn from the career's seed,
// so the same career always gives the same rivals, results and quests.
//   - Five tiers, from the town (school) to the world (international). A tier is played in
//     seasons: a league (and, at the international tier, a knockout after the group).
//   - Finishing in the top 3 of a league earns the ticket to the next tier (bus, RER, TGV,
//     plane); one travels between two seasons only.
//   - Each season draws a few side quests from the tier's catalogue; each may be tried once
//     that season, and a quest that is done is gone for good.
// Loaded by the browser (as `window.ChessdownCareer`, after career-coaches.js and
// career-quests.js) and by Node (`require`).
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./career-coaches.js'), require('./career-quests.js'));
    } else {
        root.ChessdownCareer = factory(root.ChessdownCoaches, root.ChessdownQuests);
    }
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function (Coaches, Quests) {
    'use strict';

    const VERSION = 1;
    const YOU = 'you';
    const TIER_IDS = Quests.TIER_IDS;
    /**
     * Each tier: how many clubs in its league (the player's club included), how many legs,
     * the knockout rounds after it (international only), the bot it fields (difficulty, army
     * budget in classic points, level of the pieces) and how many side quests a season draws.
     */
    const TIERS = {
        school: { clubs: 6, legs: 1, knockout: 0, bot: { difficulty: 'novice', budget: 10, level: 1 }, quests: 4 },
        county: { clubs: 6, legs: 2, knockout: 0, bot: { difficulty: 'apprentice', budget: 18, level: 2 }, quests: 4 },
        region: { clubs: 6, legs: 2, knockout: 0, bot: { difficulty: 'apprentice', budget: 26, level: 3 }, quests: 4 },
        national: { clubs: 8, legs: 2, knockout: 0, bot: { difficulty: 'expert', budget: 32, level: 4 }, quests: 5 },
        international: { clubs: 4, legs: 1, knockout: 3, bot: { difficulty: 'master', budget: 39, level: 5 }, quests: 6 },
    };
    /** Rivals drawn per tier: the league's other clubs, and the knockout's opponents. */
    const rivalsNeeded = (tier) => TIERS[tier].clubs - 1 + TIERS[tier].knockout;
    /** The top 3 earns the ticket; at the international tier, the top 2 of the group go on. */
    const TICKET_RANK = 3;
    const KNOCKOUT_RANK = 2;
    const MAX_GAMES = 5; // A best of 3 lasts at most 5 games (draws count for nobody)

    // ---------- Randomness from the seed ----------
    function hash(...parts) {
        let h = 2166136261;
        for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
        return h >>> 0;
    }
    function rng(seed) {
        let s = seed | 0;
        return () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function shuffle(list, random) {
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    }

    // ---------- Fixtures ----------
    /**
     * Round robin (circle method) for n clubs (n even): each round pairs every club once;
     * with 2 legs the second half replays the first with home and away swapped.
     * @returns {[number, number][][]} rounds of [home, away] indexes
     */
    function fixtures(n, legs) {
        const order = Array.from({ length: n }, (_, i) => i);
        const first = [];
        for (let r = 0; r < n - 1; r++) {
            const round = [];
            for (let i = 0; i < n / 2; i++) {
                const a = order[i], b = order[n - 1 - i];
                round.push(/** @type {[number, number]} */ ((r + i) % 2 === 0 ? [a, b] : [b, a]));
            }
            first.push(round);
            order.splice(1, 0, /** @type {number} */ (order.pop())); // Rotate, the first club fixed
        }
        if (legs === 1) return first;
        return [...first, ...first.map((round) => round.map(([a, b]) => /** @type {[number, number]} */ ([b, a])))];
    }

    /** The clubs of the current league, the player's first. */
    function leagueClubs(career) {
        return [YOU, ...career.rivals[career.tier].slice(0, TIERS[career.tier].clubs - 1)];
    }
    const roundsOf = (career) => fixtures(TIERS[career.tier].clubs, TIERS[career.tier].legs);

    // ---------- A new career, a new season ----------
    /** A new career from a seed (an integer): rivals drawn for every tier, first season in town. */
    function newCareer(seed) {
        const s = Number.isInteger(seed) ? seed >>> 0 : hash(String(seed));
        const rivals = {};
        for (const tier of TIER_IDS) {
            rivals[tier] = shuffle(Coaches.coachesOf(tier).map((c) => c.id), rng(hash(s, 'rivals', tier))).slice(0, rivalsNeeded(tier));
        }
        const career = {
            version: VERSION, seed: s, season: 0, tier: 'school', rivals, tickets: [], seasonsIn: {},
            league: { results: [] }, cup: null, quests: { drawn: [], attempted: [] }, questsDone: [], titles: [],
        };
        return startSeason(career, 'school');
    }

    /** The next season, in `tier`: an empty league, a fresh knockout, new side quests. */
    function startSeason(career, tier) {
        const seasonsIn = { ...career.seasonsIn, [tier]: (career.seasonsIn[tier] || 0) + 1 };
        const next = {
            ...career, tier, season: career.season + 1, seasonsIn,
            league: { results: [] }, cup: TIERS[tier].knockout ? { stage: 0, out: false } : null,
        };
        return { ...next, quests: { drawn: drawQuests(next), attempted: [] } };
    }

    // ---------- Matches ----------
    /**
     * The player's next match, or null when the season is over.
     * @returns {{ phase: 'league' | 'knockout', round: number, opponent: string, home: boolean } | null}
     */
    function nextMatch(career) {
        const rounds = roundsOf(career);
        const r = career.league.results.length;
        if (r < rounds.length) {
            const pair = rounds[r].find(([a, b]) => a === 0 || b === 0);
            if (!pair) return null;
            const clubs = leagueClubs(career);
            return { phase: 'league', round: r, opponent: clubs[pair[0] === 0 ? pair[1] : pair[0]], home: pair[0] === 0 };
        }
        const cup = career.cup;
        if (!cup || cup.out || cup.stage >= TIERS[career.tier].knockout || rank(career) > KNOCKOUT_RANK) return null;
        const opponent = career.rivals[career.tier][TIERS[career.tier].clubs - 1 + cup.stage];
        return { phase: 'knockout', round: cup.stage, opponent, home: true };
    }

    /** A series between two rivals, from their strengths: 2-0, 2-1, 1-1 (a draw) and so on. */
    function simulate(random, a, b) {
        const sa = Coaches.coachById(a).strength, sb = Coaches.coachById(b).strength;
        if (random() < 0.1) return [1, 1];
        const aWins = random() < 0.5 + (sa - sb) * 0.6;
        const loser = random() < 0.45 ? 1 : 0;
        return aWins ? [2, loser] : [loser, 2];
    }

    const validScore = (won, lost) => Number.isInteger(won) && Number.isInteger(lost) && won >= 0 && lost >= 0 && won + lost <= MAX_GAMES && won <= 2 && lost <= 2 && !(won === 2 && lost === 2);

    /**
     * The player's series is over (`won` and `lost`: games won and lost). The round's other
     * matches are simulated. Returns the new career, or null when there is no match to play
     * or the score cannot be.
     */
    function recordSeries(career, { won, lost }) {
        const match = nextMatch(career);
        if (!match || !validScore(won, lost)) return null;
        if (match.phase === 'knockout') {
            const cup = won > lost ? { stage: career.cup.stage + 1, out: false } : { stage: career.cup.stage, out: true };
            return { ...career, cup };
        }
        const clubs = leagueClubs(career);
        const random = rng(hash(career.seed, 'round', career.season, career.tier, match.round));
        const round = roundsOf(career)[match.round].map(([a, b]) => {
            if (a === 0) return { a: clubs[a], b: clubs[b], wa: won, wb: lost };
            if (b === 0) return { a: clubs[a], b: clubs[b], wa: lost, wb: won };
            const [wa, wb] = simulate(random, clubs[a], clubs[b]);
            return { a: clubs[a], b: clubs[b], wa, wb };
        });
        return { ...career, league: { results: [...career.league.results, round] } };
    }

    /**
     * The league table: 3 points for a series won, 1 for a draw; then games won minus lost,
     * games won, and the drawing order.
     */
    function standings(career) {
        const clubs = leagueClubs(career);
        const rows = clubs.map((club, order) => ({ club, order, played: 0, won: 0, drawn: 0, lost: 0, gamesFor: 0, gamesAgainst: 0, points: 0 }));
        const row = (id) => rows[clubs.indexOf(id)];
        for (const round of career.league.results) {
            for (const m of round) {
                for (const [me, mine, theirs] of [[m.a, m.wa, m.wb], [m.b, m.wb, m.wa]]) {
                    const r = row(me);
                    r.played++; r.gamesFor += mine; r.gamesAgainst += theirs;
                    if (mine > theirs) { r.won++; r.points += 3; } else if (mine === theirs) { r.drawn++; r.points += 1; } else r.lost++;
                }
            }
        }
        return rows.sort((x, y) => y.points - x.points || (y.gamesFor - y.gamesAgainst) - (x.gamesFor - x.gamesAgainst) || y.gamesFor - x.gamesFor || x.order - y.order);
    }

    /** The player's place in the league table (1 is first). */
    function rank(career) {
        return standings(career).findIndex((r) => r.club === YOU) + 1;
    }

    const leagueOver = (career) => career.league.results.length === roundsOf(career).length;
    /** The season is over: every league round played, and the knockout (if any) decided. */
    function seasonOver(career) {
        return leagueOver(career) && nextMatch(career) === null;
    }

    /**
     * End of the season: the ticket (top 3, towards the next tier), the title (first of the
     * league, or the knockout won), then the next season in the same tier. Null before the end.
     * @returns {{ career: any, rank: number, ticket: string | null, title: boolean } | null}
     */
    function finishSeason(career) {
        if (!seasonOver(career)) return null;
        const place = rank(career);
        const t = TIER_IDS.indexOf(career.tier);
        const nextTier = TIER_IDS[t + 1] || null;
        const ticket = nextTier && place <= TICKET_RANK && !career.tickets.includes(nextTier) ? nextTier : null;
        const knockout = TIERS[career.tier].knockout;
        const title = knockout ? career.cup.stage === knockout : place === 1;
        const updated = {
            ...career,
            tickets: ticket ? [...career.tickets, ticket] : career.tickets,
            titles: title ? [...career.titles, { tier: career.tier, season: career.season }] : career.titles,
        };
        return { career: startSeason(updated, career.tier), rank: place, ticket, title };
    }

    /** One travels between two seasons only (no match played yet), to a tier one has the ticket for. */
    function canTravel(career, tier) {
        return TIER_IDS.includes(tier) && tier !== career.tier && career.league.results.length === 0
            && (tier === 'school' || career.tickets.includes(tier));
    }

    /** Travel to another tier: the season starts again there. Null when not allowed. */
    function travel(career, tier) {
        if (!canTravel(career, tier)) return null;
        const seasonsIn = { ...career.seasonsIn, [career.tier]: career.seasonsIn[career.tier] - 1 }; // The season left unplayed
        return startSeason({ ...career, season: career.season - 1, seasonsIn }, tier);
    }

    // ---------- Opponents ----------
    /** The bot a rival coach fields: the tier's, its army bigger or smaller with the coach's strength. */
    function rivalOpponent(career, coachId) {
        const coach = Coaches.coachById(coachId);
        const base = TIERS[coach.tier].bot;
        const budget = Math.min(39, Math.max(4, base.budget + Math.round((coach.strength - 0.5) * 8)));
        return { difficulty: base.difficulty, budget, level: base.level, archetype: coach.archetype };
    }

    /** The bot of a side quest: the tier's, stronger with every season spent in the tier; the quest may set its own. */
    function questOpponent(career, quest) {
        const base = TIERS[quest.tier].bot;
        const extra = Math.max(0, (career.seasonsIn[quest.tier] || 1) - 1);
        return {
            difficulty: base.difficulty,
            budget: Math.min(39, base.budget + 2 * extra),
            level: Math.min(5, base.level + Math.floor(extra / 2)),
            archetype: 'normal',
            ...(quest.opponent || {}),
        };
    }

    // ---------- Side quests ----------
    /** The goals the game can play now (puzzles need their positions: not drawn yet). */
    const PLAYABLE_GOALS = ['win', 'touchdownWith', 'touchdowns', 'streak'];

    /** This season's draw: quests of the tier not done yet, open from this season on in the tier. */
    function drawQuests(career) {
        const seasons = career.seasonsIn[career.tier] || 1;
        const pool = Quests.QUESTS.filter((q) => q.tier === career.tier && q.minSeason <= seasons && !career.questsDone.includes(q.id)
            && PLAYABLE_GOALS.includes(q.goal.type)).map((q) => q.id);
        return shuffle(pool, rng(hash(career.seed, 'quests', career.season, career.tier))).slice(0, TIERS[career.tier].quests);
    }

    /** The quests on the map this season: drawn, not tried yet. */
    function availableQuests(career) {
        return career.quests.drawn.filter((id) => !career.quests.attempted.includes(id)).map((id) => Quests.questById(id));
    }

    /** A quest was tried (once a season); when it succeeded it is gone for good. Null if it was not open. */
    function attemptQuest(career, id, success) {
        if (!career.quests.drawn.includes(id) || career.quests.attempted.includes(id)) return null;
        return {
            ...career,
            quests: { drawn: career.quests.drawn, attempted: [...career.quests.attempted, id] },
            questsDone: success ? [...career.questsDone, id] : career.questsDone,
        };
    }

    // ---------- Checks on a stored career ----------
    const isInt = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= min && v <= max;
    const uniqueIds = (list, valid) => Array.isArray(list) && list.every((id) => typeof id === 'string' && valid(id)) && new Set(list).size === list.length;

    /** A career read back from storage, checked and rebuilt; null when it cannot be trusted. */
    function sanitizeCareer(data) {
        if (!data || typeof data !== 'object' || data.version !== VERSION) return null;
        if (!isInt(data.seed, 0, 0xffffffff) || !isInt(data.season, 1, 9999) || !TIER_IDS.includes(data.tier)) return null;
        const rivals = {};
        for (const tier of TIER_IDS) {
            const list = data.rivals && data.rivals[tier];
            if (!uniqueIds(list, (id) => Coaches.coachById(id)?.tier === tier) || list.length !== rivalsNeeded(tier)) return null;
            rivals[tier] = list.slice();
        }
        if (!uniqueIds(data.tickets, (id) => TIER_IDS.includes(id) && id !== 'school')) return null;
        if (data.tier !== 'school' && !data.tickets.includes(data.tier)) return null;
        const seasonsIn = {};
        for (const tier of TIER_IDS) {
            const n = data.seasonsIn && data.seasonsIn[tier];
            if (n === undefined) continue;
            if (!isInt(n, 0, 9999)) return null;
            seasonsIn[tier] = n;
        }
        if (!isInt(seasonsIn[data.tier], 1)) return null;
        const base = { version: VERSION, seed: data.seed, season: data.season, tier: data.tier, rivals, tickets: data.tickets.slice(), seasonsIn };
        // The league: every round must be the fixture's, scores possible
        const clubs = leagueClubs(base);
        const rounds = roundsOf(base);
        const stored = data.league && data.league.results;
        if (!Array.isArray(stored) || stored.length > rounds.length) return null;
        const results = [];
        for (let r = 0; r < stored.length; r++) {
            if (!Array.isArray(stored[r]) || stored[r].length !== rounds[r].length) return null;
            const round = [];
            for (let i = 0; i < rounds[r].length; i++) {
                const m = stored[r][i], [a, b] = rounds[r][i];
                if (!m || m.a !== clubs[a] || m.b !== clubs[b] || !validScore(m.wa, m.wb)) return null;
                round.push({ a: m.a, b: m.b, wa: m.wa, wb: m.wb });
            }
            results.push(round);
        }
        let cup = null;
        if (TIERS[data.tier].knockout) {
            const c = data.cup;
            if (!c || !isInt(c.stage, 0, TIERS[data.tier].knockout) || typeof c.out !== 'boolean') return null;
            cup = { stage: c.stage, out: c.out };
        }
        const valid = (id) => Quests.questById(id) !== null;
        if (!uniqueIds(data.questsDone, valid)) return null;
        const q = data.quests;
        if (!q || !uniqueIds(q.drawn, (id) => Quests.questById(id)?.tier === data.tier) || !uniqueIds(q.attempted, (id) => q.drawn.includes(id))) return null;
        if (!Array.isArray(data.titles) || !data.titles.every((t) => t && TIER_IDS.includes(t.tier) && isInt(t.season, 1, data.season))) return null;
        return {
            ...base, league: { results }, cup,
            quests: { drawn: q.drawn.slice(), attempted: q.attempted.slice() },
            questsDone: data.questsDone.slice(),
            titles: data.titles.map((t) => ({ tier: t.tier, season: t.season })),
        };
    }

    return {
        VERSION, YOU, TIER_IDS, TIERS, TICKET_RANK, KNOCKOUT_RANK, PLAYABLE_GOALS,
        fixtures, leagueClubs, newCareer, nextMatch, recordSeries, standings, rank, seasonOver, finishSeason,
        canTravel, travel, rivalOpponent, questOpponent, availableQuests, attemptQuest, sanitizeCareer,
    };
});
