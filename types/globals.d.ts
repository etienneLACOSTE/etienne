// Globals of the classic scripts shared by the browser and the server (UMD modules).
export {};

declare global {
    var ChessdownEngine: typeof import('../games/chessdown/engine.js');
    var ChessdownBot: typeof import('../games/chessdown/bot-search.js');
    var ChesspellRules: typeof import('../games/chesspell/rules.js');
    var ChesspellGame: typeof import('../games/chesspell/game.js');
    /** Socket.io client, loaded from /socket.io/socket.io.js when the server runs. */
    var io: ((namespace: string, options?: object) => any) | undefined;
}
