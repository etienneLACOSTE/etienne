// Thin wrappers that run the shared rules engine (engine.js) on the global state.

function serializeBoard() {
    return ChessdownEngine.serializeBoard(board, currentPlayer);
}

function checkTouchdownWin() {
    return ChessdownEngine.hasPieceInEndzone(board, currentPlayer);
}

function getValidMoves(r, c) {
    return ChessdownEngine.getValidMoves({ board, lastMove }, r, c);
}

function checkTouchdownForPlayer(player) {
    return ChessdownEngine.hasPieceInEndzone(board, player);
}

// Plays a move on the global board and keeps `lastMove` in sync.
function makeVirtualMove(move) {
    const state = { board, lastMove };
    const undoData = ChessdownEngine.applyMove(state, move);
    lastMove = state.lastMove;
    return undoData;
}

function undoVirtualMove(move, undoData) {
    const state = { board, lastMove };
    ChessdownEngine.undoMove(state, move, undoData);
    lastMove = state.lastMove;
}

function generateAllMoves(player) {
    return ChessdownEngine.generateAllMoves({ board, lastMove }, player);
}
