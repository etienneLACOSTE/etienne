// @ts-check
// All Star in the campaign: the player's club plays (named players with levels), the bot
// fields an army of the same worth at the squad's level, and every game of the best of 3
// brings experience (docs/games/chessdown-levels.md). Only campaign games count.
// The page's pieces carry `clubId` (which player of the club it is) and `level`.
import { state } from './state.js';
import { saveClub } from './club-store.js';

const Club = globalThis.ChessdownClub;
const Engine = globalThis.ChessdownEngine;
const MAX_RECRUITS = 5;

/** The club plays this match (campaign, best of 3). */
export function beginAllStar(club) {
    state.allStar = { club, lineupIds: [], tally: {} };
}

/** Back to classic play. */
export function endAllStar() {
    state.allStar = null;
}

export const isAllStar = () => Boolean(state.allStar);

/** A player of the club, by id. */
export function clubPlayer(id) {
    return state.allStar ? state.allStar.club.players.find((p) => p.id === id) || null : null;
}

/** The club's players not on the board yet (the bench of the draft). */
export function benchPlayers() {
    if (!state.allStar) return [];
    const placed = new Set(clubIdsOnBoard());
    return state.allStar.club.players.filter((p) => !placed.has(p.id));
}

function clubIdsOnBoard() {
    const ids = [];
    for (const row of state.board) for (const piece of row) if (piece && piece.clubId) ids.push(piece.clubId);
    return ids;
}

/** A club player as a piece on the board (player 1). */
export const pieceFor = (p) => ({ type: p.type, player: 1, hasMoved: false, level: p.level, clubId: p.id });

/** What the bot's army may cost: what the squad is worth in classic points (at most the full budget). */
export function squadBudget() {
    if (!state.allStar) return Engine.MAX_POINTS;
    const worth = state.allStar.club.players.reduce((sum, p) => sum + Engine.PIECE_VALUES[p.type], 0);
    return Math.min(Engine.MAX_POINTS, Math.max(4, worth));
}

/** The bot plays at the squad's average level (kings left out). */
export function botLevel() {
    if (!state.allStar) return 3;
    const levels = state.allStar.club.players.filter((p) => p.type !== 'k').map((p) => p.level);
    if (!levels.length) return 1;
    return Math.min(5, Math.max(1, Math.round(levels.reduce((a, b) => a + b, 0) / levels.length)));
}

/** A game starts: who of the club is on the board, and a fresh tally. */
export function noteGameStart() {
    if (!state.allStar) return;
    state.allStar.lineupIds = clubIdsOnBoard();
    state.allStar.tally = {};
}

const tallyOf = (id) => {
    const all = state.allStar.tally;
    if (!all[id]) all[id] = { moves: 0, captures: 0, touchdowns: 0, captured: false, survivedWin: false };
    return all[id];
};

/** Before a move: what is on the board (to see afterwards who was taken). */
export function beforeMove() {
    if (!state.allStar) return null;
    let enemies = 0;
    for (const row of state.board) for (const piece of row) if (piece && piece.player === 2) enemies++;
    return { ids: clubIdsOnBoard(), enemies };
}

/** After a move by `mover` (the piece object): its move, its capture, the club players taken. */
export function afterMove(mover, before) {
    if (!state.allStar || !before) return;
    let enemies = 0;
    for (const row of state.board) for (const piece of row) if (piece && piece.player === 2) enemies++;
    if (mover && mover.clubId) {
        const tally = tallyOf(mover.clubId);
        tally.moves++;
        if (enemies < before.enemies) tally.captures++;
    }
    const now = new Set(clubIdsOnBoard());
    for (const id of before.ids) if (!now.has(id)) tallyOf(id).captured = true;
}

/** A touchdown by player 1: the club players in the end zone scored it. */
export function noteTouchdown(player) {
    if (!state.allStar || player !== 1) return;
    for (const piece of state.board[Engine.endzoneRow(1)]) if (piece && piece.clubId) tallyOf(piece.clubId).touchdowns++;
}

/**
 * The game is over (winner 1, 2, or 0 for a draw): experience for every club player who
 * played, a recruit when the series is won. Kept in the browser.
 * @returns {{ levelUps: { name: string, level: number }[], recruit: boolean } | null}
 */
export function settleGame(winner) {
    if (!state.allStar) return null;
    const onBoard = new Set(clubIdsOnBoard());
    const played = new Set(state.allStar.lineupIds);
    const levelUps = [];
    let club = state.allStar.club;
    const players = club.players.map((p) => {
        if (!played.has(p.id)) return p;
        const tally = { ...tallyOf(p.id), survivedWin: winner === 1 && onBoard.has(p.id) };
        const after = Club.applyGame(p, tally);
        if (after.level > p.level) levelUps.push({ name: after.name, level: after.level });
        return after;
    });
    // A friendly series won brings a recruit; in the career, recruits come from the quests.
    const recruit = !state.career && state.series.over && state.series.winner === 1 && club.recruits < MAX_RECRUITS;
    club = { ...club, players, recruits: club.recruits + (recruit ? 1 : 0) };
    state.allStar.club = club;
    saveClub(club);
    return { levelUps, recruit };
}

/** Line-ups kept with the club: 3 slots, each the squares of the players placed. */
export const LINEUP_SLOTS = [1, 2, 3];

export function lineup(slot) {
    if (!state.allStar) return null;
    return state.allStar.club.lineups.find((l) => l.name === `slot${slot}`) || null;
}

/** Keep the players placed now in `slot`. */
export function saveLineup(slot) {
    if (!state.allStar) return;
    const pieces = [];
    state.board.forEach((row, r) => row.forEach((piece, c) => { if (piece && piece.clubId) pieces.push({ id: piece.clubId, r, c }); }));
    const club = state.allStar.club;
    const lineups = [...club.lineups.filter((l) => l.name !== `slot${slot}`), { name: `slot${slot}`, pieces }];
    state.allStar.club = { ...club, lineups };
    saveClub(state.allStar.club);
}
