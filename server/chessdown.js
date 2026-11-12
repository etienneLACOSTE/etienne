// @ts-check
const {
    generateRoomCode, makeRoomFor, roomOrigin, limitConnections, identifyPlayers, sweepIdleRooms, safeOn, getRoom, isSquare, playerOf,
    seatKeeper, drawOffers,
    MAX_IDLE_TURNS,
} = require('./socket-utils');
const engine = require('../games/chessdown/engine.js');
const { TurnClock, sanitizeTimer } = require('./turn-clock');
const { gameChat } = require('./chat');

const { ROWS, COLS, MAX_POINTS, PIECE_VALUES } = engine;
const JERSEY_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'white', 'black'];
// Deployment rows: player 1 drafts on the 3 bottom rows, player 2 on the 3 top rows.
const DRAFT_ROWS = { 1: [ROWS - 3, ROWS - 1], 2: [0, 2] };

// The server keeps the clock (server/turn-clock.js).
const COIN_FLIP_MS = 3_000; // Clients start the first turn after the coin flip animation

// -----------------------------------------------------
// CHESSDOWN SOCKET LOGIC (Namespace /chessdown)
// The server is the referee: it validates drafts, turns and moves with the
// shared rules engine and keeps the authoritative board.
// -----------------------------------------------------
const chessdownRooms = {};

function getChessdownPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
        draftPoints: room.draftPoints,
        kingsPlaced: room.kingsPlaced,
        playerColors: room.playerColors,
        board: room.board,
        timer: room.clock.settings,
        // Signed-in players' usernames (set by the server), null for a guest.
        names: { 1: room.accounts[1] ? room.accounts[1].username : null, 2: room.accounts[2] ? room.accounts[2].username : null },
    };
}

function newGameState() {
    return {
        gameState: 'drafting',
        currentPlayer: 1,
        draftPoints: { 1: MAX_POINTS, 2: MAX_POINTS },
        kingsPlaced: { 1: false, 2: false },
        board: engine.createBoard(),
        lastMove: null,
        drafted: { 1: false, 2: false },
        playAgain: { 1: false, 2: false },
        idleTurns: 0,
        positionHistory: {}, // Position key -> times seen, for the draw by repetition
        draw: null, // Draw offers (server/socket-utils.js drawOffers)
    };
}

/** A draft is legal if it has exactly one king, fits the budget and stays in the player's zone. */
function isValidDraft(pieces, player) {
    if (!Array.isArray(pieces) || pieces.length > 3 * COLS) return false;
    const [minRow, maxRow] = DRAFT_ROWS[player];
    const seen = new Set();
    let cost = 0;
    let kings = 0;
    for (const p of pieces) {
        if (!isSquare(p, ROWS, COLS) || p.r < minRow || p.r > maxRow) return false;
        if (typeof p.type !== 'string' || !Object.hasOwn(PIECE_VALUES, p.type)) return false;
        const key = `${p.r},${p.c}`;
        if (seen.has(key)) return false;
        seen.add(key);
        cost += PIECE_VALUES[p.type];
        if (p.type === 'k') kings++;
    }
    return kings === 1 && cost <= MAX_POINTS;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ sessions?: any, stats?: any, friends?: any }} [options] sessions: who is signed in
 *   (server/accounts/sessions.js); stats: where finished games are recorded (server/stats.js);
 *   friends: blocks between players, for the chat (server/friends.js)
 */
function registerChessdown(io, { sessions = null, stats = null, friends = null } = {}) {
    const ioChessdown = io.of('/chessdown');
    limitConnections(ioChessdown);
    identifyPlayers(ioChessdown, sessions, stats);

    /** A finished game counts for each signed-in player. winner: 1 or 2, or 0 for a draw. */
    function recordResult(room, winner, reason) {
        if (!stats) return;
        const name = (p) => (room.accounts[p] ? room.accounts[p].username : `Player ${p}`);
        stats.recordOnline({
            game: 'chessdown', accounts: room.accounts, names: { 1: name(1), 2: name(2) },
            winner, reason, startedAt: room.startedAt,
        }).catch((err) => console.error(`Chessdown result not recorded: ${err.message}`));
    }

    /** Counts the position after a move; true on its third time (a draw, as on the pages). */
    function seenThreeTimes(room) {
        const key = engine.serializeBoard(room.board, room.currentPlayer);
        room.positionHistory[key] = (room.positionHistory[key] || 0) + 1;
        return room.positionHistory[key] >= 3;
    }

    /** A player leaves a game in progress: it counts as a win for the other one. */
    function forfeit(room, leaver) {
        if (room.gameState !== 'playing') return;
        room.gameState = 'over';
        recordResult(room, leaver === 1 ? 2 : 1, 'forfeit');
    }

    /** The player to move ran out of time. */
    function timeUp(room) {
        if (chessdownRooms[room.id] !== room || room.gameState !== 'playing') return;
        if (room.clock.timer.mode === 'overall') {
            room.gameState = 'over';
            recordResult(room, room.currentPlayer === 1 ? 2 : 1, 'time');
            ioChessdown.to(room.id).emit('timeOut', { loser: room.currentPlayer });
            return;
        }
        skipTurn(room);
    }

    /** The turn is lost on time; after MAX_IDLE_TURNS in a row, nobody plays: the room closes. */
    function skipTurn(room) {
        room.clock.stop();
        draws.turnPlayed(room, room.currentPlayer);
        room.idleTurns = (room.idleTurns || 0) + 1;
        if (room.idleTurns >= MAX_IDLE_TURNS) {
            return closeIdleRoom(room.id, `Game closed: nobody played for ${MAX_IDLE_TURNS} turns.`);
        }
        room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        ioChessdown.to(room.id).emit('turnSkipped', { nextPlayer: room.currentPlayer });
        room.clock.start(room.currentPlayer);
    }

    function closeRoom(code) {
        chessdownRooms[code].clock.stop();
        seats.release(chessdownRooms[code]);
        delete chessdownRooms[code];
    }

    // A dropped connection keeps its seat a while (server/socket-utils.js).
    const seats = seatKeeper(ioChessdown, chessdownRooms, (room, player) => {
        forfeit(room, player);
        closeRoom(room.id);
    });

    // Both players agree on a draw: the game ends, the clock stops.
    const draws = drawOffers(ioChessdown, chessdownRooms, (room) => {
        room.gameState = 'over';
        room.clock.stop();
        recordResult(room, 0, 'agreement');
        ioChessdown.to(room.id).emit('drawAgreed');
    });

    // Chat between the two players (server/chat.js).
    const chat = gameChat(ioChessdown, chessdownRooms, friends);

    /** Close a room nobody uses any more, and tell its players why. */
    function closeIdleRoom(code, reason = 'Game closed after 15 minutes without activity.') {
        ioChessdown.to(code).emit('roomClosed', reason);
        ioChessdown.in(code).socketsLeave(code);
        closeRoom(code);
    }
    sweepIdleRooms(chessdownRooms, (code) => closeIdleRoom(code));

    ioChessdown.on('connection', (socket) => {
        console.log('Chessdown User connected:', socket.id);
        seats.returned(socket);
        chat.connect(socket);

        safeOn(socket, 'createRoom', (data) => {
            if (!makeRoomFor(chessdownRooms, socket)) return socket.emit('errorMsg', 'Too many games in progress. Try again later.');
            let roomCode = generateRoomCode();
            while (chessdownRooms[roomCode]) {
                roomCode = generateRoomCode();
            }

            const room = chessdownRooms[roomCode] = {
                id: roomCode,
                players: { 1: socket.id, 2: null },
                playerColors: { 1: 'blue', 2: 'red' },
                ...newGameState(),
                gameState: 'waiting',
                accounts: { 1: socket.data.user, 2: null }, // Signed-in players, for their stats
                startedAt: 0,
                clock: /** @type {TurnClock} */ (null),
                ...roomOrigin(socket),
            };
            room.clock = new TurnClock(sanitizeTimer(data), () => timeUp(room));

            socket.join(roomCode);
            socket.emit('roomCreated', roomCode);
        });

        safeOn(socket, 'joinRoom', (roomCode) => {
            const room = getRoom(chessdownRooms, roomCode);
            if (!room) {
                socket.emit('errorMsg', 'Room not found.');
            } else if (room.players[2] !== null || room.players[1] === socket.id) {
                socket.emit('errorMsg', 'Room is already full.');
            } else {
                room.players[2] = socket.id;
                room.accounts[2] = socket.data.user;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });

                room.gameState = 'drafting';
                ioChessdown.to(roomCode).emit('gameStarted', {
                    roomState: getChessdownPublicRoomState(room)
                });
            }
        });

        safeOn(socket, 'draftComplete', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'drafting') return;
            const player = playerOf(room, socket);
            // A player only submits their own draft, once, and it must be legal.
            if (player === null || data.player !== player || room.drafted[player]) return;
            if (!JERSEY_COLORS.includes(data.color) || !isValidDraft(data.pieces, player)) return;

            room.playerColors[player] = data.color;
            data.pieces.forEach(p => {
                room.board[p.r][p.c] = { type: p.type, player, hasMoved: false };
            });
            room.drafted[player] = true;

            if (room.drafted[1] && room.drafted[2]) {
                room.gameState = 'playing';
                room.startedAt = Date.now();
                room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
                room.clock.reset();
                room.clock.start(room.currentPlayer, COIN_FLIP_MS);

                ioChessdown.to(data.roomCode).emit('draftPhaseEnded', {
                    roomState: getChessdownPublicRoomState(room)
                });
            }
        });

        safeOn(socket, 'makeMove', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            if (playerOf(room, socket) !== room.currentPlayer) return;
            if (!isSquare(data.from, ROWS, COLS) || !isSquare(data.to, ROWS, COLS)) return;

            const piece = room.board[data.from.r][data.from.c];
            if (!piece || piece.player !== room.currentPlayer) return;
            const legal = engine.getValidMoves(room, data.from.r, data.from.c)
                .some(m => m.r === data.to.r && m.c === data.to.c);
            if (!legal) return;

            const { targetPiece } = engine.applyMove(room, {
                fromR: data.from.r, fromC: data.from.c, toR: data.to.r, toC: data.to.c,
            });
            room.clock.stop();
            room.idleTurns = 0;
            const mover = room.currentPlayer;
            draws.turnPlayed(room, mover);
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            // King captured, or a piece survived a turn in the endzone: game over.
            if (targetPiece && targetPiece.type === 'k') {
                room.gameState = 'over';
                recordResult(room, mover, 'king');
            } else if (engine.hasPieceInEndzone(room.board, room.currentPlayer)) {
                room.gameState = 'over';
                recordResult(room, room.currentPlayer, 'touchdown');
            } else if (seenThreeTimes(room)) {
                room.gameState = 'over'; // The pages see it too and show the draw
                recordResult(room, 0, 'repetition');
            } else {
                room.clock.start(room.currentPlayer);
            }

            ioChessdown.to(data.roomCode).emit('moveMade', {
                from: data.from,
                to: data.to,
                nextPlayer: room.currentPlayer
            });
        });

        // Turn timer ran out: only the player whose turn it is may give it up.
        safeOn(socket, 'skipTurn', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            if (playerOf(room, socket) !== room.currentPlayer) return;

            skipTurn(room);
        });

        safeOn(socket, 'offerDraw', (data) => {
            const room = getRoom(chessdownRooms, data && data.roomCode);
            const player = room && playerOf(room, socket);
            if (player) draws.offer(room, player);
        });

        safeOn(socket, 'answerDraw', (data) => {
            const room = getRoom(chessdownRooms, data && data.roomCode);
            const player = room && playerOf(room, socket);
            if (player) draws.answer(room, player, data.accept);
        });

        safeOn(socket, 'playAgainRequest', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room) return;
            const player = playerOf(room, socket);
            if (player === null) return;

            room.playAgain[player] = true;
            const count = Number(room.playAgain[1]) + Number(room.playAgain[2]);

            if (count === 2) {
                room.clock.reset();
                Object.assign(room, newGameState());
                ioChessdown.to(data.roomCode).emit('gameRestarted');
            } else {
                ioChessdown.to(data.roomCode).emit('playAgainStatus', { count });
            }
        });

        safeOn(socket, 'leaveRoom', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            const player = room && playerOf(room, socket);
            if (room && player) {
                forfeit(room, player);
                socket.leave(data.roomCode);
                socket.to(data.roomCode).emit('opponentLeft');
                closeRoom(data.roomCode);
            }
        });

        safeOn(socket, 'colorSelected', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'drafting') return;
            const player = playerOf(room, socket);
            if (player === null || data.player !== player || !JERSEY_COLORS.includes(data.color)) return;

            room.playerColors[player] = data.color;
            socket.to(data.roomCode).emit('opponentColorChanged', data.color);
        });

        safeOn(socket, 'disconnect', (reason) => {
            draws.dropped(socket);
            seats.dropped(socket, reason);
        });
    });

    return { rooms: chessdownRooms }; // For invitations (server/presence.js)
}

module.exports = { registerChessdown };
