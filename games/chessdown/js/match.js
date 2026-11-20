// @ts-check
// The match being played: a best of 3 (first to 2 won games, 30 s turns) or a single free
// game, with the timer chosen in Settings. Rules in ../series.js (shared with the server);
// this module keeps the page's copy and shows the score. Online, the server keeps the
// series and the page only shows what it sends (network.js).
import { Series, state } from './state.js';
import { choose } from '../../../assets/js/dialog.js';
import { t } from '../../../assets/js/i18n.js';

const scoreBox = /** @type {HTMLElement | null} */ (document.getElementById('series-score'));

/** Ask which match to play: a best of 3 or a single free game ('' when closed with Escape). */
export async function askFormat() {
    return choose(t('format.question'), [
        { label: t('format.bo3'), value: 'bo3' },
        { label: t('format.single'), value: 'single' },
    ]);
}

/** A new match on this page (local or against the bot): its series and its timer. */
export function startSeries(format) {
    useSeries(Series.newSeries(format));
}

/** The series this page plays now (also the one an online server sends). */
export function useSeries(series) {
    state.series = series;
    const timer = Series.timerFor(series, state.chosenTimer);
    if (!state.currentRoomCode) {
        state.timerMode = timer.mode;
        state.timerBaseSeconds = timer.seconds;
    }
    showScore();
}

/** A game of a local or bot match ended (winner 1 or 2, or 0 for a draw). */
export function recordLocalGame(winner) {
    state.series = Series.recordGame(state.series, winner);
    showScore();
}

/** Who starts the next game: the loser of the last one; 0 when it is up to the coin. */
export function nextStarter() {
    return Series.starter(state.series);
}

/** "Me" and "the other side" for the score: online our seat, otherwise player 1. */
function sides() {
    const me = state.currentRoomCode ? state.myPlayerNumber : 1;
    return { me, other: me === 1 ? 2 : 1 };
}

/** The score of a best of 3 in the header ("Series 1–0"), hidden for a single game. */
export function showScore() {
    if (!scoreBox) return;
    const s = state.series;
    scoreBox.hidden = s.format !== 'bo3' || state.gameState === 'mainMenu';
    if (scoreBox.hidden) return;
    const { me, other } = sides();
    scoreBox.textContent = t('series.score', { a: s.wins[me], b: s.wins[other] });
}

/** Hide the score (back at the menu). */
export function hideScore() {
    if (scoreBox) scoreBox.hidden = true;
}

/** What screen readers hear when a game of a best of 3 starts ('' for a single game). */
export function seriesIntro() {
    const s = state.series;
    if (s.format !== 'bo3') return '';
    const { me, other } = sides();
    return t('series.gameStarts', { n: s.games + 1, a: s.wins[me], b: s.wins[other] });
}

/**
 * The end screen's line about the match, and the button's text:
 * "Series 1–0. Next game" during a best of 3, the series result once it is over.
 */
export function seriesEnd() {
    const s = state.series;
    if (s.format !== 'bo3') return { line: '', button: t('end.playAgain') };
    const { me, other } = sides();
    const score = { a: s.wins[me], b: s.wins[other] };
    if (!s.over) return { line: t('series.after', { n: s.games, ...score }), button: t('series.nextGame') };
    let line;
    if (!s.winner) line = t('series.drawn', score);
    else if (state.currentRoomCode || state.isBotMatch) line = t(s.winner === me ? 'series.won' : 'series.lost', score);
    else line = t('series.playerWon', { n: s.winner, ...score });
    return { line, button: t('series.newSeries') };
}
