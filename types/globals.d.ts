// Globals of the classic scripts shared by the browser and the server (UMD modules).
export {};

declare global {
    var ChessdownEngine: typeof import('../games/chessdown/engine.js');
    var ChesspellRules: typeof import('../games/chesspell/rules.js');
    var ChesspellGame: typeof import('../games/chesspell/game.js');
}
