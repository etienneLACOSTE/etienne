// @ts-check
// Chessdown series rules (docs/games/chessdown.md): a match is a best of 3 (first to 2
// won games) or a single free game. Pure functions on a `series` object, shared by the
// page (local and bot matches) and the server (online matches, the referee).
// Loaded by the browser (as `window.ChessdownSeries`) and by Node (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownSeries = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    const WINS_NEEDED = 2;
    const MAX_GAMES = 5; // Drawn games count for nobody: after 5 games, the series ends
    const SERIES_TURN_SECONDS = 30; // A best of 3 is played with 30 s turns
    const FORMATS = ['bo3', 'single'];

    /**
     * @typedef {{ format: 'bo3' | 'single', wins: { 1: number, 2: number }, games: number,
     *   lastLoser: 0 | 1 | 2, over: boolean, winner: 0 | 1 | 2 }} Series
     */

    /** @returns {Series} a new series ('single': one free game) */
    function newSeries(format) {
        return {
            format: format === 'single' ? 'single' : 'bo3',
            wins: { 1: 0, 2: 0 },
            games: 0,
            lastLoser: 0, // Who lost the last game (0: nobody yet, or a draw)
            over: false,
            winner: 0, // Once over: 1 or 2, or 0 for a drawn series
        };
    }

    /**
     * A game of the series ended. `winner`: 1 or 2, or 0 for a draw.
     * @param {Series} series @param {number} winner
     * @returns {Series} the series after it
     */
    function recordGame(series, winner) {
        if (series.over) return series;
        const wins = { ...series.wins };
        if (winner === 1 || winner === 2) wins[winner]++;
        const games = series.games + 1;
        const next = {
            ...series,
            wins,
            games,
            lastLoser: /** @type {0 | 1 | 2} */ (winner === 1 ? 2 : winner === 2 ? 1 : 0),
        };
        if (series.format === 'single') {
            return { ...next, over: true, winner: /** @type {0 | 1 | 2} */ (winner === 1 || winner === 2 ? winner : 0) };
        }
        if (wins[1] >= WINS_NEEDED || wins[2] >= WINS_NEEDED) {
            return { ...next, over: true, winner: wins[1] > wins[2] ? 1 : 2 };
        }
        if (games >= MAX_GAMES) {
            return { ...next, over: true, winner: wins[1] > wins[2] ? 1 : wins[2] > wins[1] ? 2 : 0 };
        }
        return next;
    }

    /**
     * Who starts the next game: the loser of the last one; 0 when it is up to the coin
     * (first game, or after a drawn game).
     * @param {Series} series
     */
    function starter(series) {
        return series.format === 'bo3' ? series.lastLoser : 0;
    }

    /**
     * The timer of a game of this series: 30 s turns for a best of 3, the one chosen
     * otherwise. @param {Series} series @param {{ mode: string, seconds: number }} chosen
     */
    function timerFor(series, chosen) {
        return series.format === 'bo3' ? { mode: 'turn', seconds: SERIES_TURN_SECONDS } : chosen;
    }

    return { WINS_NEEDED, MAX_GAMES, SERIES_TURN_SECONDS, FORMATS, newSeries, recordGame, starter, timerFor };
});
