// @ts-check
// Mapping between board squares (r, c) and the squares on screen (viewR, viewC).
import { COLS, ROWS, state } from './state.js';

// During draft, players see a 6x8 board. Rows 0-5.
// P1 draft rows 0-5 map to board rows 6-11.
// P2 draft rows 0-5 map to board rows 5-0 (inverted).
export function getBoardCoords(viewR, viewC) {
    if (state.gameState === 'gameplay') {
        if (state.currentRoomCode && state.myPlayerNumber === 2) {
            return { r: (ROWS - 1) - viewR, c: (COLS - 1) - viewC };
        } else {
            return { r: viewR, c: viewC };
        }
    } else {
        const activePlayer = state.currentRoomCode ? state.myPlayerNumber : state.currentPlayer;
        if (activePlayer === 1) {
            return { r: viewR + 6, c: viewC };
        } else {
            return { r: 5 - viewR, c: 7 - viewC };
        }
    }
}

export function getViewCoords(r, c) {
    if (state.gameState === 'gameplay') {
        if (state.currentRoomCode && state.myPlayerNumber === 2) {
            return { viewR: (ROWS - 1) - r, viewC: (COLS - 1) - c };
        } else {
            return { viewR: r, viewC: c };
        }
    } else {
        const activePlayer = state.currentRoomCode ? state.myPlayerNumber : state.currentPlayer;
        if (activePlayer === 1) {
            return { viewR: r - 6, viewC: c };
        } else {
            return { viewR: 5 - r, viewC: 7 - c };
        }
    }
}

// Returns the drafting zone on the VIEW (6x8)
export function getDraftZoneView() {
    return { min: 3, max: 5 }; // Bottom 3 rows of the 6x8 view
}
