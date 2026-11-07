const { generateRoomCode, makeRoomFor, safeOn, getRoom, isSquare, playerOf } = require('./socket-utils');
const engine = require('../games/chessdown/engine.js');

const { ROWS, COLS, MAX_POINTS, PIECE_VALUES } = engine;
const JERSEY_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'white', 'black'];
// Deployment rows: player 1 drafts on the 3 bottom rows, player 2 on the 3 top rows.
const DRAFT_ROWS = { 1: [ROWS - 3, ROWS - 1], 2: [0, 2] };

// The server keeps the clock: a player cannot keep the turn by never giving it up.
// Clients show the countdown and give up the turn themselves; the server only steps in
// once the time is over plus a grace period (network delay, move animation).
const DEFAULT_TIMER = { mode: 'turn', ms: 10_000 };
const MAX_TIMER_MS = 99 * 60_000;
const COIN_FLIP_MS = 3_000; // Clients start the first turn after the coin flip animation
const GRACE_MS = 1_500;

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
        timer: { mode: room.timer.mode, seconds: room.timer.ms / 1000 },
    };
}

/** Timer settings chosen by the room creator: "turn" or "overall", 1 s to 99 min. */
function sanitizeTimer(data) {
    const seconds = data && Number(data.timerSeconds);
    const mode = data && data.timerMode;
    if (!['turn', 'overall'].includes(mode) || !Number.isInteger(seconds) || seconds < 1 || seconds * 1000 > MAX_TIMER_MS) {
        return { ...DEFAULT_TIMER };
    }
    return { mode, ms: seconds * 1000 };
}

function stopClock(room) {
    clearTimeout(room.clock);
    room.clock = null;
    // Overall mode: the time spent on this turn comes off the player's total.
    if (room.turnStartedAt && room.timer.mode === 'overall') {
        room.remaining[room.currentPlayer] -= Math.max(0, Date.now() - room.turnStartedAt);
    }
    room.turnStartedAt = null;
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

function registerChessdown(io) {
    const ioChessdown = io.of('/chessdown');

    /** Start the clock of the player to move; `delay` covers what clients show first. */
    function startClock(room, delay = 0) {
        stopClock(room);
        const budget = room.timer.mode === 'turn' ? room.timer.ms : room.remaining[room.currentPlayer];
        room.turnStartedAt = Date.now() + delay;
        room.clock = setTimeout(() => timeUp(room), delay + Math.max(0, budget) + GRACE_MS);
    }

    function timeUp(room) {
        if (chessdownRooms[room.id] !== room || room.gameState !== 'playing') return;
        room.clock = null;
        room.turnStartedAt = null;
        if (room.timer.mode === 'overall') {
            room.gameState = 'over';
            ioChessdown.to(room.id).emit('timeOut', { loser: room.currentPlayer });
            return;
        }
        room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        ioChessdown.to(room.id).emit('turnSkipped', { nextPlayer: room.currentPlayer });
        startClock(room);
    }

    function closeRoom(code) {
        stopClock(chessdownRooms[code]);
        delete chessdownRooms[code];
    }

    ioChessdown.on('connection', (socket) => {
        console.log('Chessdown User connected:', socket.id);

        safeOn(socket, 'createRoom', (data) => {
            if (!makeRoomFor(chessdownRooms, socket)) return socket.emit('errorMsg', 'Too many games in progress. Try again later.');
            let roomCode = generateRoomCode();
            while (chessdownRooms[roomCode]) {
                roomCode = generateRoomCode();
            }

            chessdownRooms[roomCode] = {
                id: roomCode,
                players: { 1: socket.id, 2: null },
                playerColors: { 1: 'blue', 2: 'red' },
                timer: sanitizeTimer(data),
                ...newGameState(),
                gameState: 'waiting',
            };

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
                room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
                room.remaining = { 1: room.timer.ms, 2: room.timer.ms };
                startClock(room, COIN_FLIP_MS);

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
            stopClock(room);
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            // King captured, or a piece survived a turn in the endzone: game over.
            if ((targetPiece && targetPiece.type === 'k') || engine.hasPieceInEndzone(room.board, room.currentPlayer)) {
                room.gameState = 'over';
            } else {
                startClock(room);
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

            stopClock(room);
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            ioChessdown.to(data.roomCode).emit('turnSkipped', { nextPlayer: room.currentPlayer });
            startClock(room);
        });

        safeOn(socket, 'playAgainRequest', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room) return;
            const player = playerOf(room, socket);
            if (player === null) return;

            room.playAgain[player] = true;
            const count = Number(room.playAgain[1]) + Number(room.playAgain[2]);

            if (count === 2) {
                stopClock(room);
                Object.assign(room, newGameState());
                ioChessdown.to(data.roomCode).emit('gameRestarted');
            } else {
                ioChessdown.to(data.roomCode).emit('playAgainStatus', { count });
            }
        });

        safeOn(socket, 'leaveRoom', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (room && playerOf(room, socket) !== null) {
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

        safeOn(socket, 'disconnect', () => {
            for (const [code, room] of Object.entries(chessdownRooms)) {
                if (playerOf(room, socket) !== null) {
                    ioChessdown.to(code).emit('opponentLeft');
                    closeRoom(code);
                }
            }
        });
    });
}

module.exports = { registerChessdown };
