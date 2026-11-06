const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve the portfolio hub
app.use(express.static(path.join(__dirname, 'public')));

// Serve the games statically
app.use('/chesspell', express.static(path.join(__dirname, "ches'spell")));
app.use('/chessdown', express.static(path.join(__dirname, 'chessdown')));

// Helper
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// A handler that throws would stop the whole server, so every handler is guarded.
function safeOn(socket, event, handler) {
    socket.on(event, (...args) => {
        try {
            handler(...args);
        } catch (err) {
            console.error(`Ignored malformed "${event}" message: ${err.message}`);
        }
    });
}

// Own keys only: a code like "__proto__" must not resolve to Object.prototype.
function getRoom(rooms, code) {
    return typeof code === 'string' && Object.hasOwn(rooms, code) ? rooms[code] : null;
}

function isSquare(pos, rows, cols) {
    return typeof pos === 'object' && pos !== null
        && Number.isInteger(pos.r) && Number.isInteger(pos.c)
        && pos.r >= 0 && pos.r < rows && pos.c >= 0 && pos.c < cols;
}

const CHESSDOWN_ROWS = 12;
const CHESSDOWN_COLS = 8;

// -----------------------------------------------------
// CHES'SPELL SOCKET LOGIC (Namespace /chesspell)
// -----------------------------------------------------
const chesspellRooms = {};

function getChesspellPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
        decks: room.decks,
        profiles: room.profiles
    };
}

const ioChesspell = io.of('/chesspell');
ioChesspell.on('connection', (socket) => {
    console.log('Chesspell User connected:', socket.id);

    safeOn(socket, 'createRoom', (data) => {
        let roomCode = generateRoomCode();
        while (chesspellRooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        chesspellRooms[roomCode] = {
            id: roomCode,
            players: { 1: socket.id, 2: null }, // P1 creates the room
            gameState: 'waiting', 
            currentPlayer: 'white', // white plays first
            decks: { 1: data.deck || [], 2: [] },
            profiles: { 1: data.profile || null, 2: null }
        };

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
    });

    safeOn(socket, 'joinRoom', (data) => {
        const roomCode = data.roomCode;
        const room = getRoom(chesspellRooms, roomCode);
        if (room) {
            if (room.players[2] === null) {
                room.players[2] = socket.id;
                room.decks[2] = data.deck || [];
                room.profiles[2] = data.profile || null;
                
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });
                
                room.gameState = 'playing';
                ioChesspell.to(roomCode).emit('gameStarted', {
                    roomState: getChesspellPublicRoomState(room)
                });
            } else {
                socket.emit('errorMsg', 'Room is already full.');
            }
        } else {
            socket.emit('errorMsg', 'Room not found.');
        }
    });

    safeOn(socket, 'makeMove', (data) => {
        const room = getRoom(chesspellRooms, data.roomCode);
        if (!room) return;

        // Switch turn
        room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
        
        ioChesspell.to(data.roomCode).emit('moveMade', {
            from: data.from,
            to: data.to,
            nextPlayer: room.currentPlayer
        });
    });

    safeOn(socket, 'spellActivated', (data) => {
        const room = getRoom(chesspellRooms, data.roomCode);
        if (!room) return;
        
        ioChesspell.to(data.roomCode).emit('spellActivated', data);
    });

    safeOn(socket, 'spellSquareClicked', (data) => {
        const room = getRoom(chesspellRooms, data.roomCode);
        if (!room) return;
        
        ioChesspell.to(data.roomCode).emit('spellSquareClicked', data);
    });

    safeOn(socket, 'leaveRoom', (data) => {
        const room = getRoom(chesspellRooms, data.roomCode);
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete chesspellRooms[data.roomCode];
        }
    });

    safeOn(socket, 'disconnect', () => {
        for (const [code, room] of Object.entries(chesspellRooms)) {
            if (room.players[1] === socket.id || room.players[2] === socket.id) {
                ioChesspell.to(code).emit('opponentLeft');
                delete chesspellRooms[code];
            }
        }
    });
});

// -----------------------------------------------------
// CHESSDOWN SOCKET LOGIC (Namespace /chessdown)
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
        timeLeft: room.timeLeft
    };
}

const ioChessdown = io.of('/chessdown');
ioChessdown.on('connection', (socket) => {
    console.log('Chessdown User connected:', socket.id);

    safeOn(socket, 'createRoom', () => {
        let roomCode = generateRoomCode();
        while (chessdownRooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        chessdownRooms[roomCode] = {
            id: roomCode,
            players: { 1: socket.id, 2: null }, 
            gameState: 'waiting', 
            currentPlayer: 1,
            draftPoints: { 1: 39, 2: 39 },
            kingsPlaced: { 1: false, 2: false },
            playerColors: { 1: 'blue', 2: 'red' },
            board: Array(12).fill(null).map(() => Array(8).fill(null)),
            timeLeft: 10000,
            timerInterval: null
        };

        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
    });

    safeOn(socket, 'joinRoom', (roomCode) => {
        const room = getRoom(chessdownRooms, roomCode);
        if (room) {
            if (room.players[2] === null) {
                room.players[2] = socket.id;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });
                
                room.gameState = 'drafting';
                ioChessdown.to(roomCode).emit('gameStarted', {
                    roomState: getChessdownPublicRoomState(room)
                });
            } else {
                socket.emit('errorMsg', 'Room is already full.');
            }
        } else {
            socket.emit('errorMsg', 'Room not found.');
        }
    });

    safeOn(socket, 'draftComplete', (data) => {
        const room = getRoom(chessdownRooms, data.roomCode);
        if (!room) return;
        // Validate everything first so a bad payload never half-updates the board.
        if (data.player !== 1 && data.player !== 2) return;
        if (!Array.isArray(data.pieces)
            || !data.pieces.every(p => isSquare(p, CHESSDOWN_ROWS, CHESSDOWN_COLS) && typeof p.type === 'string')) return;

        room.playerColors[data.player] = data.color;
        
        data.pieces.forEach(p => {
            room.board[p.r][p.c] = { type: p.type, player: data.player, hasMoved: false };
        });

        room.draftReady = (room.draftReady || 0) + 1;

        if (room.draftReady === 2) {
            room.gameState = 'coinflip';
            room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
            
            ioChessdown.to(data.roomCode).emit('draftPhaseEnded', {
                roomState: getChessdownPublicRoomState(room)
            });
        }
    });

    safeOn(socket, 'makeMove', (data) => {
        const room = getRoom(chessdownRooms, data.roomCode);
        if (!room) return;
        if (!isSquare(data.from, CHESSDOWN_ROWS, CHESSDOWN_COLS)
            || !isSquare(data.to, CHESSDOWN_ROWS, CHESSDOWN_COLS)) return;

        const piece = room.board[data.from.r][data.from.c];
        room.board[data.to.r][data.to.c] = piece;
        room.board[data.from.r][data.from.c] = null;
        if (piece) piece.hasMoved = true;
        
        room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        
        ioChessdown.to(data.roomCode).emit('moveMade', {
            from: data.from,
            to: data.to,
            nextPlayer: room.currentPlayer
        });
    });

    safeOn(socket, 'playAgainRequest', (data) => {
        const room = getRoom(chessdownRooms, data.roomCode);
        if (!room) return;
        
        room.playAgainReady = (room.playAgainReady || 0) + 1;
        
        if (room.playAgainReady === 2) {
            room.gameState = 'drafting';
            room.draftReady = 0;
            room.playAgainReady = 0;
            room.board = Array(12).fill(null).map(() => Array(8).fill(null));
            room.draftPoints = { 1: 39, 2: 39 };
            room.kingsPlaced = { 1: false, 2: false };
            
            ioChessdown.to(data.roomCode).emit('gameRestarted');
        } else {
            ioChessdown.to(data.roomCode).emit('playAgainStatus', { count: room.playAgainReady });
        }
    });

    safeOn(socket, 'leaveRoom', (data) => {
        const room = getRoom(chessdownRooms, data.roomCode);
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete chessdownRooms[data.roomCode];
        }
    });

    safeOn(socket, 'colorSelected', (data) => {
        const room = getRoom(chessdownRooms, data.roomCode);
        if (room) {
            room.playerColors[data.player] = data.color;
            socket.to(data.roomCode).emit('opponentColorChanged', data.color);
        }
    });

    safeOn(socket, 'disconnect', () => {
        for (const [code, room] of Object.entries(chessdownRooms)) {
            if (room.players[1] === socket.id || room.players[2] === socket.id) {
                ioChessdown.to(code).emit('opponentLeft');
                delete chessdownRooms[code];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (0.0.0.0)`);
});
