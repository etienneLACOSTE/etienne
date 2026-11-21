// @ts-check
// Chessdown clubs (All Star mode, docs/games/chessdown-levels.md and docs/games/chessdown.md):
// the squad of named players, their experience and levels, recruits, and the checks a
// stored club must pass. Pure functions, shared by the page and (later) the server.
// Loaded by the browser (as `window.ChessdownClub`) and by Node (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownClub = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    /** Experience needed for levels 1 to 5. */
    const XP_THRESHOLDS = [0, 20, 60, 200, 500];
    /** What a game brings a player (docs/games/chessdown-levels.md). */
    const XP = { move: 1, capture: 5, touchdown: 10, survivedWin: 3, captured: -3 };
    /** A new club: its king and six rookies at level 1. */
    const STARTING_SQUAD = ['k', 'r', 'n', 'b', 'p', 'p', 'p'];
    /** What a recruit can be (never a second king). */
    const RECRUIT_TYPES = ['p', 'n', 'b', 'r', 'q'];
    const MAX_SQUAD = 24; // The 3 drafting rows hold 24 squares
    const NAME_MIN = 2;
    const NAME_MAX = 24;
    const PATTERNS = ['plain', 'stripes', 'pinstripes', 'halves', 'quarters', 'hoops', 'sash', 'chevron', 'sleeves'];
    const SHAPES = ['shield', 'round', 'diamond', 'badge'];
    /** What a club may unlock in the career (a quest's cosmetic reward). */
    const COSMETICS = ['jersey-heritage'];
    const EMBLEMS = [
        'n', 'r', 'b', 'q', 'k',
        'wolf', 'lion', 'eagle', 'bull', 'bear', 'fox',
        'planet', 'moon', 'sun', 'star', 'bolt', 'comet',
        'mountain', 'wave', 'pine', 'volcano', 'tower', 'crown',
    ];
    /** First names for rookies, the same in every language; the coach renames them at will. */
    const ROOKIE_NAMES = ['Alex', 'Lina', 'Hugo', 'Noah', 'Mila', 'Sam', 'Nina', 'Léo', 'Zoé', 'Tom', 'Inès', 'Malik',
        'Chloé', 'Yanis', 'Emma', 'Lucas', 'Jade', 'Enzo', 'Sara', 'Adam', 'Lou', 'Nils', 'Rosa', 'Iris'];

    /** A name as typed: trimmed, spaces squeezed; null when too short, too long or not text. */
    function cleanName(value) {
        if (typeof value !== 'string') return null;
        const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
        return name.length >= NAME_MIN && name.length <= NAME_MAX ? name : null;
    }

    const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

    /** The level a total of experience gives (1 to 5). */
    function levelForXp(xp) {
        let level = 1;
        XP_THRESHOLDS.forEach((needed, i) => { if (xp >= needed) level = i + 1; });
        return level;
    }

    /** Experience still needed for the next level, or null at level 5. */
    function xpToNext(player) {
        return player.level >= 5 ? null : XP_THRESHOLDS[player.level] - player.xp;
    }

    /**
     * A game's tally for one player: { moves, captures, touchdowns, captured: bool,
     * survivedWin: bool }. Returns the player after it: experience (never below 0), level
     * (never lower than before), and the stats of the register. The king gains none.
     */
    function applyGame(player, tally) {
        const gained = tally.moves * XP.move + tally.captures * XP.capture + tally.touchdowns * XP.touchdown
            + (tally.survivedWin ? XP.survivedWin : 0) + (tally.captured ? XP.captured : 0);
        const stats = {
            games: player.stats.games + 1,
            moves: player.stats.moves + tally.moves,
            captures: player.stats.captures + tally.captures,
            captured: player.stats.captured + (tally.captured ? 1 : 0),
            touchdowns: player.stats.touchdowns + tally.touchdowns,
        };
        if (player.type === 'k') return { ...player, stats };
        const xp = Math.max(0, player.xp + gained);
        return { ...player, xp, level: Math.max(player.level, levelForXp(xp)), stats };
    }

    /** A bonus of experience (a career quest's reward): the level never goes down; the king gains none. */
    function gainXp(player, amount) {
        if (player.type === 'k' || !Number.isInteger(amount) || amount <= 0) return player;
        const xp = player.xp + amount;
        return { ...player, xp, level: Math.max(player.level, levelForXp(xp)) };
    }

    const newStats = () => ({ games: 0, moves: 0, captures: 0, captured: 0, touchdowns: 0 });

    /** A new player of `type`, level 1 (the king: level 5). */
    function newPlayer(id, type, name) {
        return { id, type, name, level: type === 'k' ? 5 : 1, xp: 0, stats: newStats() };
    }

    /**
     * A new club. `identity`: { coach, name, primary, secondary, pattern, shape, emblem }.
     * The king is named after the coach's choice later; rookies get first names.
     */
    function newClub(identity, kingName) {
        const players = STARTING_SQUAD.map((type, i) => newPlayer(i + 1, type, type === 'k' ? kingName : ROOKIE_NAMES[i - 1]));
        return { version: 1, ...identity, season: 1, tier: 'school', players, recruits: 0, nextId: players.length + 1, lineups: [] };
    }

    /**
     * One more player for the squad (a recruit), or the club unchanged when it is full or the
     * type is not allowed. A recruit won by a series uses one of the club's pending recruits;
     * a career quest's (`fromQuest`) arrives directly, at its `level`, with that level's experience.
     * @param {any} club @param {string} type @param {string} name
     * @param {{ level?: number, fromQuest?: boolean }} [options]
     */
    function recruit(club, type, name, { level = 1, fromQuest = false } = {}) {
        if (!RECRUIT_TYPES.includes(type) || club.players.length >= MAX_SQUAD) return club;
        const lv = Math.min(5, Math.max(1, Math.floor(level)));
        const player = { ...newPlayer(club.nextId, type, cleanName(name) || ROOKIE_NAMES[club.nextId % ROOKIE_NAMES.length]), level: lv, xp: XP_THRESHOLDS[lv - 1] };
        const recruits = fromQuest ? club.recruits : Math.max(0, club.recruits - 1);
        return { ...club, players: [...club.players, player], nextId: club.nextId + 1, recruits };
    }

    /**
     * A club read back from storage, checked field by field; null when it cannot be used.
     * Anything out of range is refused rather than repaired: the page then offers to start again.
     */
    function sanitizeClub(data) {
        if (!data || typeof data !== 'object' || data.version !== 1) return null;
        const coach = cleanName(data.coach);
        const name = cleanName(data.name);
        if (!coach || !name || !isColor(data.primary) || !isColor(data.secondary)) return null;
        if (!PATTERNS.includes(data.pattern) || !SHAPES.includes(data.shape) || !EMBLEMS.includes(data.emblem)) return null;
        if (!Array.isArray(data.players) || data.players.length < 1 || data.players.length > MAX_SQUAD) return null;
        const ids = new Set();
        const players = [];
        for (const p of data.players) {
            if (!p || !Number.isInteger(p.id) || ids.has(p.id) || !['k', ...RECRUIT_TYPES].includes(p.type)) return null;
            const playerName = cleanName(p.name);
            const xp = Number.isInteger(p.xp) && p.xp >= 0 ? p.xp : null;
            const level = p.type === 'k' ? 5 : (Number.isInteger(p.level) && p.level >= 1 && p.level <= 5 ? p.level : null);
            if (!playerName || xp === null || level === null) return null;
            const s = p.stats || {};
            const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
            ids.add(p.id);
            players.push({ id: p.id, type: p.type, name: playerName, level, xp,
                stats: { games: count(s.games), moves: count(s.moves), captures: count(s.captures), captured: count(s.captured), touchdowns: count(s.touchdowns) } });
        }
        if (players.filter((p) => p.type === 'k').length !== 1) return null;
        const nextId = Math.max(...players.map((p) => p.id)) + 1;
        const cosmetics = Array.isArray(data.cosmetics) ? [...new Set(data.cosmetics.filter((c) => COSMETICS.includes(c)))] : [];
        const lineups = Array.isArray(data.lineups) ? data.lineups.filter((l) => l && cleanName(l.name) && Array.isArray(l.pieces)).slice(0, 10) : [];
        return {
            version: 1, coach, name, primary: data.primary.toLowerCase(), secondary: data.secondary.toLowerCase(),
            pattern: data.pattern, shape: data.shape, emblem: data.emblem,
            season: Number.isInteger(data.season) && data.season > 0 ? data.season : 1,
            tier: typeof data.tier === 'string' ? data.tier : 'school',
            players, recruits: Number.isInteger(data.recruits) && data.recruits >= 0 ? Math.min(data.recruits, 5) : 0,
            nextId, lineups,
            ...(cosmetics.length ? { cosmetics } : {}),
            // The jersey worn: an unlocked one (the career's "Heritage"); the club's own otherwise
            ...(cosmetics.includes(data.wear) ? { wear: data.wear } : {}),
        };
    }

    /** The club's initials ("namecode") shown on its crest: up to 3 letters. */
    function initials(name) {
        const words = String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 || /^\p{Lu}/u.test(w));
        return (words.slice(0, 3).map((w) => w[0]).join('') || 'FC').toUpperCase();
    }

    return {
        XP_THRESHOLDS, XP, STARTING_SQUAD, RECRUIT_TYPES, MAX_SQUAD, NAME_MIN, NAME_MAX, PATTERNS, SHAPES, EMBLEMS, ROOKIE_NAMES, COSMETICS,
        cleanName, levelForXp, xpToNext, applyGame, gainXp, newPlayer, newClub, recruit, sanitizeClub, initials,
    };
});
