// @ts-check
// Chessdown career (docs/games/chessdown-career.md): tiers, tournaments, tickets, side quests
// and the calendar. Pure functions on a plain career object (kept in the browser and with a
// signed-in player's account, checked by sanitizeCareer every time it is read). Everything
// random is drawn from the career's seed, so the same career always gives the same clubs,
// brackets, results and quests.
//   - Five tiers, from the town (school) to the world (international). A tier is played in
//     seasons; each season is a tournament of 32 clubs, double elimination: a first defeat
//     sends a club to the losers' bracket, a second one knocks it out. The winners' and the
//     losers' champions meet in the grand final (one match, no reset).
//   - Winning the tournament earns the ticket to the next tier (bus, RER, TGV, plane); one
//     travels between two seasons only.
//   - The opponents grow stronger round after round: small armies of level 1 and 2 pieces in
//     the first round in town, bigger ones with a few level 3 pieces at the end.
//   - Each season draws a few side quests from the tier's catalogue; each may be tried once
//     that season, and a quest that is done is gone for good.
//   - A calendar (decorative for now): a season starts on 1 September; moving on the map,
//     playing a match and travelling to another tier take time.
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

    const VERSION = 2; // 1: leagues and cups (2026-11-21, replaced by the tournaments)
    const YOU = 'you';
    const TIER_IDS = Quests.TIER_IDS;
    const FIELD = 32; // Clubs in a tournament, the player's included
    /**
     * Each tier: the bot of its tournament, from the first round to the last (`difficulty`,
     * army `budget` in classic points, average `level` of its pieces: 1.3 means mostly level 1
     * with some level 2), how many side quests a season draws, and how many minutes a map
     * pixel takes to cross (the calendar).
     */
    const TIERS = {
        school: { bot: { difficulty: ['novice', 'apprentice'], budget: [10, 30], level: [1.3, 2.3] }, quests: 4, minutesPerPixel: 1 },
        county: { bot: { difficulty: ['apprentice', 'expert'], budget: [18, 34], level: [2, 3] }, quests: 4, minutesPerPixel: 3 },
        region: { bot: { difficulty: ['apprentice', 'expert'], budget: [24, 37], level: [2.5, 3.5] }, quests: 5, minutesPerPixel: 6 },
        national: { bot: { difficulty: ['expert', 'master'], budget: [30, 39], level: [3, 4.2] }, quests: 5, minutesPerPixel: 12 },
        international: { bot: { difficulty: ['master', 'master'], budget: [34, 39], level: [3.8, 4.8] }, quests: 6, minutesPerPixel: 40 },
    };
    /** A match takes half a day; travelling to another tier, a day. */
    const MATCH_MINUTES = 12 * 60;
    const TRAVEL_MINUTES = 24 * 60;
    const MAX_GAMES = 5; // A best of 3 lasts at most 5 games (draws count for nobody)

    /**
     * The stages of a tournament, in the order they are played. W: the winners' bracket
     * (W1 the 16 first-round matches ... W5 its final); L: the losers' bracket, where the
     * losers of a W stage come in (L2, L4, L6, L8) against the survivors of the stage before;
     * GF: the grand final. The last rounds are best of 3; the others, one game.
     */
    const STAGES = [
        { id: 'W1', matches: 16, bo3: false },
        { id: 'W2', matches: 8, bo3: false },
        { id: 'L1', matches: 8, bo3: false },
        { id: 'L2', matches: 8, bo3: false },
        { id: 'W3', matches: 4, bo3: false },
        { id: 'L3', matches: 4, bo3: false },
        { id: 'L4', matches: 4, bo3: false },
        { id: 'W4', matches: 2, bo3: true },
        { id: 'L5', matches: 2, bo3: false },
        { id: 'L6', matches: 2, bo3: false },
        { id: 'W5', matches: 1, bo3: true },
        { id: 'L7', matches: 1, bo3: true },
        { id: 'L8', matches: 1, bo3: true },
        { id: 'GF', matches: 1, bo3: true },
    ];
    /** How far into the tournament a stage is, 0 (the first round) to 1 (the grand final): the opponents' strength. */
    const DEPTH = { W1: 0, L1: 0.1, W2: 0.2, L2: 0.25, L3: 0.35, W3: 0.4, L4: 0.45, L5: 0.55, W4: 0.6, L6: 0.65, L7: 0.75, W5: 0.8, L8: 0.85, GF: 1 };
    /** A club knocked out in a stage finishes in this place (the best one of its group of places). */
    const PLACE_IF_OUT = { L1: 25, L2: 17, L3: 13, L4: 9, L5: 7, L6: 5, L7: 4, L8: 3, GF: 2 };

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
    const lerp = (a, b, p) => a + (b - a) * p;

    // ---------- The clubs ----------
    /** The rivals of a tier: its named coaches (bosses left out), then generated clubs, 31 in all. */
    function rivalsOf(career, tier) {
        const named = Coaches.coachesOf(tier).map((c) => c.id);
        const generated = Array.from({ length: FIELD - 1 - named.length }, (_, n) => Coaches.generatedId(tier, n));
        return [...named, ...generated];
    }
    /** A rival coach (named or generated) of this career. */
    const coachOf = (career, id) => Coaches.coachById(id, career.seed);

    /** This season's 32 clubs in bracket order (drawn again each season). */
    function fieldOf(career) {
        return shuffle([YOU, ...rivalsOf(career, career.tier)], rng(hash(career.seed, 'field', career.season, career.tier)));
    }

    // ---------- A new career, a new season ----------
    /** A new career from a seed (an integer): the first season in town. */
    function newCareer(seed) {
        const s = Number.isInteger(seed) ? seed >>> 0 : hash(String(seed));
        const career = {
            version: VERSION, seed: s, season: 0, tier: 'school', tickets: [], seasonsIn: {},
            tournament: { results: [] }, quests: { drawn: [], attempted: [] }, questsDone: [], titles: [], minutes: 0,
        };
        return startSeason(career, 'school');
    }

    /** The next season, in `tier`: a new tournament, new side quests, the calendar on 1 September. */
    function startSeason(career, tier) {
        const seasonsIn = { ...career.seasonsIn, [tier]: (career.seasonsIn[tier] || 0) + 1 };
        const next = { ...career, tier, season: career.season + 1, seasonsIn, tournament: { results: [] }, minutes: 0 };
        return { ...next, quests: { drawn: drawQuests(next), attempted: [] } };
    }

    // ---------- The tournament ----------
    /** A match between two rivals, from their strengths: [1, 0] for one game, [2, 1] and so on for a best of 3. */
    function simulate(random, career, a, b, bo3) {
        const sa = coachOf(career, a).strength, sb = coachOf(career, b).strength;
        const aWins = random() < 0.5 + (sa - sb) * 0.6;
        if (!bo3) return aWins ? [1, 0] : [0, 1];
        const loser = random() < 0.45 ? 1 : 0;
        return aWins ? [2, loser] : [loser, 2];
    }

    /** A score the player's match may end with: one game won or lost, or a best of 3 decided. */
    function validScore(won, lost, bo3) {
        if (!Number.isInteger(won) || !Number.isInteger(lost) || won < 0 || lost < 0) return false;
        if (!bo3) return won + lost === 1;
        return won + lost <= MAX_GAMES && won <= 2 && lost <= 2 && won !== lost && (won === 2 || lost === 2);
    }

    /**
     * The whole bracket as far as it can be played: every stage's matches with their scores,
     * the player's from `tournament.results` (in order), the others simulated. It stops at the
     * player's next match (not played yet).
     * @returns {{ stages: { id: string, bo3: boolean, matches: { a: string, b: string, wa: number, wb: number }[] }[],
     *   next: { stage: string, opponent: string, bo3: boolean, played: number } | null, used: number,
     *   losses: number, champion: string | null, place: number | null }}
     */
    function bracket(career) {
        const results = career.tournament.results;
        const stages = [];
        /** @type {Record<string, string[]>} */
        const winners = {};
        /** @type {Record<string, string[]>} */
        const losers = {};
        let used = 0;
        let losses = 0;
        let place = null;
        const pairUp = (list) => Array.from({ length: list.length / 2 }, (_, i) => [list[2 * i], list[2 * i + 1]]);
        // The losers coming in meet the survivors in the reverse order: no rematch too soon.
        const against = (survivors, dropped) => survivors.map((club, i) => [club, dropped[dropped.length - 1 - i]]);
        const pairsOf = (id) => {
            switch (id) {
                case 'W1': return pairUp(fieldOf(career));
                case 'W2': return pairUp(winners.W1);
                case 'W3': return pairUp(winners.W2);
                case 'W4': return pairUp(winners.W3);
                case 'W5': return pairUp(winners.W4);
                case 'L1': return pairUp(losers.W1);
                case 'L2': return against(winners.L1, losers.W2);
                case 'L3': return pairUp(winners.L2);
                case 'L4': return against(winners.L3, losers.W3);
                case 'L5': return pairUp(winners.L4);
                case 'L6': return against(winners.L5, losers.W4);
                case 'L7': return pairUp(winners.L6);
                case 'L8': return against(winners.L7, losers.W5);
                default: return [[winners.W5[0], winners.L8[0]]]; // GF
            }
        };
        for (const stage of STAGES) {
            const matches = [];
            let pending = null;
            for (const [a, b] of pairsOf(stage.id)) {
                let wa, wb;
                if (a === YOU || b === YOU) {
                    if (used >= results.length) {
                        pending = { stage: stage.id, opponent: a === YOU ? b : a, bo3: stage.bo3, played: used };
                        continue;
                    }
                    const r = results[used++];
                    [wa, wb] = a === YOU ? [r.won, r.lost] : [r.lost, r.won];
                    if (r.won <= r.lost) {
                        losses++;
                        if (stage.id === 'GF') place = 2;
                        else if (losses === 2) place = PLACE_IF_OUT[stage.id];
                    }
                } else {
                    [wa, wb] = simulate(rng(hash(career.seed, 'match', career.season, career.tier, stage.id, a, b)), career, a, b, stage.bo3);
                }
                matches.push({ a, b, wa, wb });
            }
            stages.push({ id: stage.id, bo3: stage.bo3, matches });
            if (pending) return { stages, next: losses >= 2 ? null : pending, used, losses, champion: null, place };
            winners[stage.id] = matches.map((m) => (m.wa > m.wb ? m.a : m.b));
            losers[stage.id] = matches.map((m) => (m.wa > m.wb ? m.b : m.a));
        }
        const champion = winners.GF[0];
        if (champion === YOU) place = 1;
        return { stages, next: null, used, losses, champion, place };
    }

    /**
     * The player's next match, or null when the season's tournament is over for the player
     * (knocked out, or the grand final played).
     * @returns {{ phase: 'tournament', stage: string, opponent: string, format: 'single' | 'bo3', played: number, losses: number } | null}
     */
    function nextMatch(career) {
        const b = bracket(career);
        if (!b.next) return null;
        return { phase: 'tournament', stage: b.next.stage, opponent: b.next.opponent, format: b.next.bo3 ? 'bo3' : 'single', played: b.next.played, losses: b.losses };
    }

    /**
     * The player's match is over (`won` and `lost`: games won and lost; a single game: 1-0 or
     * 0-1). Returns the new career (half a day later), or null when there is no match to play
     * or the score cannot be.
     */
    function recordSeries(career, { won, lost }) {
        const match = nextMatch(career);
        if (!match || !validScore(won, lost, match.format === 'bo3')) return null;
        return { ...career, tournament: { results: [...career.tournament.results, { won, lost }] }, minutes: career.minutes + MATCH_MINUTES };
    }

    /** The season is over: the player is out of the tournament, or it is finished. */
    function seasonOver(career) {
        return nextMatch(career) === null;
    }

    /** The season is over without the title: knocked out (a second defeat), or the grand final lost. */
    function knockedOut(career) {
        return seasonOver(career) && placing(career) !== 1;
    }

    /** Where the player finished (1 the champion); null while still in the running. */
    function placing(career) {
        return seasonOver(career) ? bracket(career).place : null;
    }

    /**
     * End of the season: the title and the ticket (the tournament won: towards the next tier),
     * then the next season in the same tier. Null before the end.
     * @returns {{ career: any, place: number, ticket: string | null, title: boolean } | null}
     */
    function finishSeason(career) {
        if (!seasonOver(career)) return null;
        const place = /** @type {number} */ (placing(career));
        const t = TIER_IDS.indexOf(career.tier);
        const nextTier = TIER_IDS[t + 1] || null;
        const title = place === 1;
        const ticket = title && nextTier && !career.tickets.includes(nextTier) ? nextTier : null;
        const titles = title ? [...career.titles, { tier: career.tier, season: career.season }] : career.titles;
        const updated = { ...career, tickets: ticket ? [...career.tickets, ticket] : career.tickets, titles };
        return { career: startSeason(updated, career.tier), place, ticket, title };
    }

    /** One travels between two seasons only (no match played yet), to a tier one has the ticket for. */
    function canTravel(career, tier) {
        return TIER_IDS.includes(tier) && tier !== career.tier && career.tournament.results.length === 0
            && (tier === 'school' || career.tickets.includes(tier));
    }

    /** Travel to another tier: the season starts again there, a day later. Null when not allowed. */
    function travel(career, tier) {
        if (!canTravel(career, tier)) return null;
        const seasonsIn = { ...career.seasonsIn, [career.tier]: career.seasonsIn[career.tier] - 1 }; // The season left unplayed
        const next = startSeason({ ...career, season: career.season - 1, seasonsIn }, tier);
        return { ...next, minutes: career.minutes + TRAVEL_MINUTES };
    }

    // ---------- The calendar ----------
    /** Time passes (minutes): a walk on the map. */
    function advance(career, minutes) {
        return { ...career, minutes: Math.min(MAX_MINUTES, career.minutes + Math.max(0, Math.round(minutes))) };
    }
    const MAX_MINUTES = 400 * 24 * 60;
    /** Minutes a walk of `pixels` on the tier's map takes. */
    const walkMinutes = (career, pixels) => Math.round(pixels * TIERS[career.tier].minutesPerPixel);
    /** The career's date: a season starts on 1 September at 8:00 (the first one in 2026). */
    function dateOf(career) {
        return new Date(Date.UTC(2025 + career.season, 8, 1, 8, 0) + career.minutes * 60_000);
    }

    // ---------- The first season in town ----------
    /** Gérard's lesson before each of the first 5 matches of the first season in town (0 to 4), or -1. */
    function tutorialStep(career) {
        if (career.tier !== 'school' || career.seasonsIn.school !== 1) return -1;
        const m = nextMatch(career);
        return m && m.played < 5 ? m.played : -1;
    }

    // ---------- Opponents ----------
    /**
     * The bot a rival fields in the player's next tournament match: the tier's, stronger the
     * deeper the round (the first round small and of level 1 and 2), its army
     * a little bigger or smaller with the coach's strength. `level` is an average: each piece
     * is of the level below or above it.
     */
    function rivalOpponent(career, coachId) {
        const coach = coachOf(career, coachId);
        const m = nextMatch(career);
        const p = m ? DEPTH[m.stage] : 0;
        const bot = TIERS[career.tier].bot;
        const budget = Math.min(39, Math.max(4, Math.round(lerp(bot.budget[0], bot.budget[1], p) + (coach.strength - 0.5) * 4)));
        const level = Math.round(lerp(bot.level[0], bot.level[1], p) * 10) / 10;
        return { difficulty: p < 0.5 ? bot.difficulty[0] : bot.difficulty[1], budget, level, archetype: coach.archetype };
    }

    /** The bot of a side quest: the tier's middle strength, stronger with every season spent in the tier; the quest may set its own. */
    function questOpponent(career, quest) {
        const bot = TIERS[quest.tier].bot;
        const extra = Math.max(0, (career.seasonsIn[quest.tier] || 1) - 1);
        return {
            difficulty: bot.difficulty[0],
            budget: Math.min(39, Math.round(lerp(bot.budget[0], bot.budget[1], 0.5)) + 2 * extra),
            level: Math.min(5, Math.round((lerp(bot.level[0], bot.level[1], 0.5) + extra / 2) * 10) / 10),
            archetype: 'normal',
            ...(quest.opponent || {}),
        };
    }

    // ---------- Side quests ----------
    /** The goals the game can play (every one now; kept to hold a new kind back until it plays). */
    const PLAYABLE_GOALS = ['win', 'touchdownWith', 'touchdowns', 'streak', 'puzzle', 'survive', 'captures', 'cleanSheet'];

    /**
     * This season's draw: quests of the tier not done yet, open from this season on in the tier;
     * one a place (a place shows one quest).
     */
    function drawQuests(career) {
        const seasons = career.seasonsIn[career.tier] || 1;
        const pool = Quests.QUESTS.filter((q) => q.tier === career.tier && q.minSeason <= seasons && !career.questsDone.includes(q.id)
            && PLAYABLE_GOALS.includes(q.goal.type));
        const places = new Set();
        const drawn = [];
        for (const q of shuffle(pool, rng(hash(career.seed, 'quests', career.season, career.tier)))) {
            if (places.has(q.place)) continue;
            places.add(q.place);
            drawn.push(q.id);
        }
        return drawn.slice(0, TIERS[career.tier].quests);
    }

    /** The quests on the map this season: drawn, not tried yet. */
    function availableQuests(career) {
        return career.quests.drawn.filter((id) => !career.quests.attempted.includes(id)).map((id) => Quests.questById(id));
    }

    /** A quest was tried (once a season, half a day); when it succeeded it is gone for good. Null if it was not open. */
    function attemptQuest(career, id, success) {
        if (!career.quests.drawn.includes(id) || career.quests.attempted.includes(id)) return null;
        return {
            ...career,
            quests: { drawn: career.quests.drawn, attempted: [...career.quests.attempted, id] },
            questsDone: success ? [...career.questsDone, id] : career.questsDone,
            minutes: Math.min(MAX_MINUTES, career.minutes + MATCH_MINUTES),
        };
    }

    // ---------- Checks on a stored career ----------
    const isInt = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= min && v <= max;
    const uniqueIds = (list, valid) => Array.isArray(list) && list.every((id) => typeof id === 'string' && valid(id)) && new Set(list).size === list.length;

    /** A career read back from storage, checked and rebuilt; null when it cannot be trusted (an older version too). */
    function sanitizeCareer(data) {
        if (!data || typeof data !== 'object' || data.version !== VERSION) return null;
        if (!isInt(data.seed, 0, 0xffffffff) || !isInt(data.season, 1, 9999) || !TIER_IDS.includes(data.tier)) return null;
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
        if (!isInt(data.minutes, 0, MAX_MINUTES)) return null;
        const base = { version: VERSION, seed: data.seed, season: data.season, tier: data.tier, tickets: data.tickets.slice(), seasonsIn, minutes: data.minutes };
        // The tournament: each result must be a possible score of the player's match, in order
        const stored = data.tournament && data.tournament.results;
        if (!Array.isArray(stored) || stored.length > STAGES.length) return null;
        let replay = { ...base, tournament: { results: [] } };
        for (const r of stored) {
            if (!r || typeof r !== 'object') return null;
            const after = recordSeries(replay, { won: r.won, lost: r.lost });
            if (!after) return null;
            replay = after;
        }
        const valid = (id) => Quests.questById(id) !== null;
        if (!uniqueIds(data.questsDone, valid)) return null;
        const q = data.quests;
        if (!q || !uniqueIds(q.drawn, (id) => Quests.questById(id)?.tier === data.tier) || !uniqueIds(q.attempted, (id) => q.drawn.includes(id))) return null;
        if (!Array.isArray(data.titles) || !data.titles.every((t) => t && TIER_IDS.includes(t.tier) && isInt(t.season, 1, data.season))) return null;
        return {
            ...base, tournament: { results: stored.map((r) => ({ won: r.won, lost: r.lost })) },
            quests: { drawn: q.drawn.slice(), attempted: q.attempted.slice() },
            questsDone: data.questsDone.slice(),
            titles: data.titles.map((t) => ({ tier: t.tier, season: t.season })),
        };
    }

    return {
        VERSION, YOU, TIER_IDS, TIERS, FIELD, STAGES, MATCH_MINUTES, TRAVEL_MINUTES, PLAYABLE_GOALS,
        rivalsOf, coachOf, fieldOf, newCareer, bracket, nextMatch, recordSeries, seasonOver, knockedOut, placing, finishSeason,
        canTravel, travel, advance, walkMinutes, dateOf, tutorialStep, rivalOpponent, questOpponent, availableQuests, attemptQuest, sanitizeCareer,
    };
});
