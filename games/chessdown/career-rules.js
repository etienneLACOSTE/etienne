// @ts-check
// Chessdown career (docs/games/chessdown-career.md): tiers, tournaments, tickets, side quests
// and the calendar. Pure functions on a plain career object (kept in the browser and with a
// signed-in player's account, checked by sanitizeCareer every time it is read). Everything
// random is drawn from the career's seed, so the same career always gives the same clubs,
// brackets, results and quests.
//   - Five tiers, from the town (school) to the world (international). A tier is played in
//     seasons; each season is a knockout tournament of 32 clubs: one defeat and a club is out.
//   - Winning the tournament earns the ticket to the next tier (bus, RER, TGV, plane); one
//     travels between two seasons only.
//   - The opponents grow stronger round after round: small armies of level 1 and 2 pieces in
//     the first round in town, bigger ones with a few level 3 pieces at the end.
//   - Each season draws a few side quests from the tier's catalogue; each may be tried once
//     that season, and a quest that is done is gone for good.
//   - A calendar (decorative for now): a season starts on 1 September; moving on the map,
//     playing a match and travelling to another tier take time.
//   - The club's news (the journal): the latest events, dated by the calendar (a season
//     started, a match played, the other matches' surprises, a quest won or lost, a recruit,
//     a player going up a level, the tournament's champion, a run of wins, a club going up a
//     tier, the club arriving in a new one).
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

    // 1: leagues and cups; 2: double elimination (both 2026-11-21). A version 2 career is
    // carried over: its matches up to the first defeat (the same first rounds).
    const VERSION = 3;
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
    const NEWS_MAX = 40; // The journal keeps the latest news only
    /** A surprise: the winner was this much weaker than the club it knocked out (coach strengths, 0 to 1). */
    const UPSET_GAP = 0.2;
    const UPSETS_PER_ROUND = 2;
    /** A run of wins (tournament matches and quests) is news at 3, 5, 10, then every 5. */
    const streakNews = (n) => n === 3 || (n >= 5 && n % 5 === 0);

    /**
     * The rounds of the tournament: 16 matches, then 8, the quarter-finals, the semi-finals and
     * the final. The first rounds are one game; the semi-finals and the final, best of 3.
     */
    const STAGES = [
        { id: 'R1', matches: 16, bo3: false },
        { id: 'R2', matches: 8, bo3: false },
        { id: 'QF', matches: 4, bo3: false },
        { id: 'SF', matches: 2, bo3: true },
        { id: 'F', matches: 1, bo3: true },
    ];
    /** How far into the tournament a round is, 0 (the first) to 1 (the final): the opponents' strength. */
    const DEPTH = { R1: 0, R2: 0.25, QF: 0.5, SF: 0.75, F: 1 };
    /** A club knocked out in a round finishes in this place (the best one of its group of places). */
    const PLACE_IF_OUT = { R1: 17, R2: 9, QF: 5, SF: 3, F: 2 };

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
            tournament: { results: [] }, quests: { drawn: [], attempted: [] }, questsDone: [], titles: [], minutes: 0, news: [], streak: 0,
        };
        return startSeason(career, 'school');
    }

    /** The next season, in `tier`: a new tournament, new side quests, the calendar on 1 September. */
    function startSeason(career, tier) {
        const seasonsIn = { ...career.seasonsIn, [tier]: (career.seasonsIn[tier] || 0) + 1 };
        const next = { ...career, tier, season: career.season + 1, seasonsIn, tournament: { results: [] }, minutes: 0 };
        return addNews({ ...next, quests: { drawn: drawQuests(next), attempted: [] } }, { kind: 'season', tier });
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
     * The whole bracket as far as it can be played: every round's matches with their scores,
     * the player's from `tournament.results` (in order), the others simulated. It stops at the
     * player's next match (not played yet); once the player is out, the rest is played without them.
     * @returns {{ stages: { id: string, bo3: boolean, matches: { a: string, b: string, wa: number, wb: number }[] }[],
     *   next: { stage: string, opponent: string, bo3: boolean, played: number } | null, used: number,
     *   losses: number, champion: string | null, place: number | null }}
     */
    function bracket(career) {
        const results = career.tournament.results;
        const stages = [];
        let clubs = fieldOf(career);
        let used = 0;
        let losses = 0;
        let place = null;
        for (const stage of STAGES) {
            const matches = [];
            let pending = null;
            for (let i = 0; i < clubs.length; i += 2) {
                const a = clubs[i], b = clubs[i + 1];
                let wa, wb;
                if (a === YOU || b === YOU) {
                    if (used >= results.length) {
                        pending = { stage: stage.id, opponent: a === YOU ? b : a, bo3: stage.bo3, played: used };
                        continue;
                    }
                    const r = results[used++];
                    [wa, wb] = a === YOU ? [r.won, r.lost] : [r.lost, r.won];
                    if (r.won <= r.lost) { losses++; place = PLACE_IF_OUT[stage.id]; }
                } else {
                    [wa, wb] = simulate(rng(hash(career.seed, 'match', career.season, career.tier, stage.id, a, b)), career, a, b, stage.bo3);
                }
                matches.push({ a, b, wa, wb });
            }
            stages.push({ id: stage.id, bo3: stage.bo3, matches });
            if (pending) return { stages, next: pending, used, losses, champion: null, place };
            clubs = matches.map((m) => (m.wa > m.wb ? m.a : m.b));
        }
        const champion = clubs[0];
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
        let after = { ...career, tournament: { results: [...career.tournament.results, { won, lost }] }, minutes: career.minutes + MATCH_MINUTES };
        after = addNews(after, { kind: 'match', stage: match.stage, opp: match.opponent, won, lost });
        after = countResult(after, won > lost);
        const b = bracket(after);
        // The round's surprises (the other matches, played at the same time)
        const round = b.stages.find((st) => st.id === match.stage);
        const strength = (id) => coachOf(career, id).strength;
        const gap = (u) => strength(u.l) - strength(u.w);
        const upsets = (round ? round.matches : [])
            .filter((m) => m.a !== YOU && m.b !== YOU)
            .map((m) => (m.wa > m.wb ? { w: m.a, l: m.b } : { w: m.b, l: m.a }))
            .filter((u) => gap(u) >= UPSET_GAP)
            .sort((x, y) => gap(y) - gap(x))
            .slice(0, UPSETS_PER_ROUND);
        for (const u of upsets) after = addNews(after, { kind: 'upset', stage: match.stage, w: u.w, l: u.l });
        // The tournament is over (the club out, the rest played without it): its champion
        if (!b.next) {
            after = addNews(after, { kind: 'champion', tier: career.tier, club: b.champion });
            // The champion goes up a tier (the club: when it gets a new ticket)
            const up = TIER_IDS[TIER_IDS.indexOf(career.tier) + 1];
            if (up && (b.champion !== YOU || !career.tickets.includes(up))) after = addNews(after, { kind: 'promoted', tier: up, club: b.champion });
        }
        return after;
    }

    /** The season is over: the player is out of the tournament, or it is finished. */
    function seasonOver(career) {
        return nextMatch(career) === null;
    }

    /** The season is over without the title: knocked out (the final lost too). */
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
        return addNews({ ...next, minutes: career.minutes + TRAVEL_MINUTES }, { kind: 'arrived', tier });
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
     * one a place (a place shows one quest); the tier's boss always, until it is beaten.
     */
    function drawQuests(career) {
        const seasons = career.seasonsIn[career.tier] || 1;
        const pool = Quests.QUESTS.filter((q) => q.tier === career.tier && q.minSeason <= seasons && !career.questsDone.includes(q.id)
            && PLAYABLE_GOALS.includes(q.goal.type));
        const places = new Set();
        const drawn = [];
        // The tier's boss first: on the map every season until it is beaten
        const order = shuffle(pool, rng(hash(career.seed, 'quests', career.season, career.tier)));
        for (const q of [...order.filter((x) => x.kind === 'boss'), ...order.filter((x) => x.kind !== 'boss')]) {
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
        return countResult(addNews({
            ...career,
            quests: { drawn: career.quests.drawn, attempted: [...career.quests.attempted, id] },
            questsDone: success ? [...career.questsDone, id] : career.questsDone,
            minutes: Math.min(MAX_MINUTES, career.minutes + MATCH_MINUTES),
        }, { kind: 'quest', id, ok: Boolean(success) }), Boolean(success));
    }

    /** A match or a quest won adds to the club's run of wins (news at 3, 5, 10…); one lost ends it. */
    function countResult(career, won) {
        const streak = won ? (career.streak || 0) + 1 : 0;
        const after = { ...career, streak };
        return won && streakNews(streak) ? addNews(after, { kind: 'streak', n: streak }) : after;
    }

    // ---------- The club's news ----------
    /**
     * One more piece of news, dated now (the season and its minutes); the oldest go past NEWS_MAX.
     * Kinds: season {tier}; match {stage, opp, won, lost}; upset {stage, w, l}; champion {tier,
     * club}; promoted {tier, club}; arrived {tier}; streak {n}; quest {id, ok}; recruit and level
     * {name, type, level} (a player of the club).
     */
    function addNews(career, entry) {
        const news = [...(career.news || []), { season: career.season, at: career.minutes, ...entry }];
        return { ...career, news: news.slice(-NEWS_MAX) };
    }

    const PLAYER_TYPES = ['k', 'q', 'r', 'b', 'n', 'p'];
    const NAME_MAX = 24; // A player's name (club-rules.js)
    /** A piece of news read back from storage, rebuilt; null when it cannot be (it is then left out). */
    function cleanNews(n, career) {
        if (!n || typeof n !== 'object' || !isInt(n.season, 1, career.season) || !isInt(n.at, 0, MAX_MINUTES)) return null;
        const head = { season: n.season, at: n.at, kind: n.kind };
        const club = (id) => typeof id === 'string' && coachOf(career, id) !== null;
        const stage = (id) => STAGES.some((st) => st.id === id);
        switch (n.kind) {
            case 'season': case 'arrived': return TIER_IDS.includes(n.tier) ? { ...head, tier: n.tier } : null;
            case 'streak': return isInt(n.n, 3, 99999) ? { ...head, n: n.n } : null;
            case 'promoted': return TIER_IDS.includes(n.tier) && (n.club === YOU || club(n.club)) ? { ...head, tier: n.tier, club: n.club } : null;
            case 'match': return stage(n.stage) && club(n.opp) && isInt(n.won, 0, MAX_GAMES) && isInt(n.lost, 0, MAX_GAMES)
                ? { ...head, stage: n.stage, opp: n.opp, won: n.won, lost: n.lost } : null;
            case 'upset': return stage(n.stage) && club(n.w) && club(n.l) ? { ...head, stage: n.stage, w: n.w, l: n.l } : null;
            case 'champion': return TIER_IDS.includes(n.tier) && (n.club === YOU || club(n.club)) ? { ...head, tier: n.tier, club: n.club } : null;
            case 'quest': return Quests.questById(n.id) && typeof n.ok === 'boolean' ? { ...head, id: n.id, ok: n.ok } : null;
            case 'recruit': case 'level': {
                const name = typeof n.name === 'string' ? n.name.replace(/[\u0000-\u001f\u007f]/g, '').trim() : '';
                return name && name.length <= NAME_MAX && PLAYER_TYPES.includes(n.type) && isInt(n.level, 1, 5)
                    ? { ...head, name, type: n.type, level: n.level } : null;
            }
            default: return null;
        }
    }

    // ---------- Checks on a stored career ----------
    const isInt = (v, min, max = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= min && v <= max;
    const uniqueIds = (list, valid) => Array.isArray(list) && list.every((id) => typeof id === 'string' && valid(id)) && new Set(list).size === list.length;

    /** A career read back from storage, checked and rebuilt; null when it cannot be trusted (an older version too). */
    function sanitizeCareer(data) {
        if (data && data.version === 2 && data.tournament && Array.isArray(data.tournament.results)) {
            // Double elimination (version 2): the matches up to the first defeat are this tournament's
            const kept = [];
            for (const r of data.tournament.results) { if (kept.length >= STAGES.length) break; kept.push(r); if (r && r.won <= r.lost) break; }
            data = { ...data, version: VERSION, tournament: { results: kept } };
        }
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
            // The news (older careers have none yet); one that cannot be read is left out
            streak: isInt(data.streak, 0, 99999) ? data.streak : 0,
            news: Array.isArray(data.news) ? data.news.slice(-NEWS_MAX).map((n) => cleanNews(n, base)).filter(Boolean) : [],
        };
    }

    return {
        VERSION, YOU, TIER_IDS, TIERS, FIELD, STAGES, MATCH_MINUTES, TRAVEL_MINUTES, PLAYABLE_GOALS,
        rivalsOf, coachOf, fieldOf, newCareer, bracket, nextMatch, recordSeries, seasonOver, knockedOut, placing, finishSeason,
        canTravel, travel, advance, walkMinutes, dateOf, addNews, NEWS_MAX, tutorialStep, rivalOpponent, questOpponent, availableQuests, attemptQuest, sanitizeCareer,
    };
});
