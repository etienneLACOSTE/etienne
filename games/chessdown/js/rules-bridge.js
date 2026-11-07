// @ts-check
// Thin wrappers that run the shared rules engine (engine.js) on the game state.
// The engine reads state.board and keeps state.lastMove up to date.
import { Engine, state } from './state.js';

export function serializeBoard() {
    return Engine.serializeBoard(state.board, state.currentPlayer);
}

export function checkTouchdownWin() {
    return Engine.hasPieceInEndzone(state.board, state.currentPlayer);
}

export function getValidMoves(r, c) {
    return Engine.getValidMoves(state, r, c);
}

export function checkTouchdownForPlayer(player) {
    return Engine.hasPieceInEndzone(state.board, player);
}

/** Plays a move on the board and keeps `lastMove` in sync. */
export function makeVirtualMove(move) {
    return Engine.applyMove(state, move);
}

export function undoVirtualMove(move, undoData) {
    Engine.undoMove(state, move, undoData);
}

export function generateAllMoves(player) {
    return Engine.generateAllMoves(state, player);
}
