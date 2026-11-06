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

    socket.on('createRoom', (data) => {
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

    socket.on('joinRoom', (data) => {
        const roomCode = data.roomCode;
        const room = chesspellRooms[roomCode];
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

    socket.on('makeMove', (data) => {
        const room = chesspellRooms[data.roomCode];
        if (!room) return;

        // Switch turn
        room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
        
        ioChesspell.to(data.roomCode).emit('moveMade', {
            from: data.from,
            to: data.to,
            nextPlayer: room.currentPlayer
        });
    });

    socket.on('spellActivated', (data) => {
        const room = chesspellRooms[data.roomCode];
        if (!room) return;
        
        ioChesspell.to(data.roomCode).emit('spellActivated', data);
    });

    socket.on('spellSquareClicked', (data) => {
        const room = chesspellRooms[data.roomCode];
        if (!room) return;
        
        ioChesspell.to(data.roomCode).emit('spellSquareClicked', data);
    });

    socket.on('leaveRoom', (data) => {
        const room = chesspellRooms[data.roomCode];
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete chesspellRooms[data.roomCode];
        }
    });

    socket.on('disconnect', () => {
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

    socket.on('createRoom', () => {
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

    socket.on('joinRoom', (roomCode) => {
        const room = chessdownRooms[roomCode];
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

    socket.on('draftComplete', (data) => {
        const room = chessdownRooms[data.roomCode];
        if (!room) return;

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

    socket.on('makeMove', (data) => {
        const room = chessdownRooms[data.roomCode];
        if (!room) return;

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

    socket.on('playAgainRequest', (data) => {
        const room = chessdownRooms[data.roomCode];
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

    socket.on('leaveRoom', (data) => {
        const room = chessdownRooms[data.roomCode];
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete chessdownRooms[data.roomCode];
        }
    });

    socket.on('colorSelected', (data) => {
        const room = chessdownRooms[data.roomCode];
        if (room) {
            room.playerColors[data.player] = data.color;
            socket.to(data.roomCode).emit('opponentColorChanged', data.color);
        }
    });

    socket.on('disconnect', () => {
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
