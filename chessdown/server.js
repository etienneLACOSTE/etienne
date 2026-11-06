const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

// Game State Management
const rooms = {};

// Helper to generate a 4-letter room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // CREATE ROOM
    socket.on('createRoom', () => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        rooms[roomCode] = {
            id: roomCode,
            players: { 1: socket.id, 2: null }, // P1 creates the room
            gameState: 'waiting', // waiting, draft1, draft2, gameplay, over
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

    // JOIN ROOM
    socket.on('joinRoom', (roomCode) => {
        const room = rooms[roomCode];
        if (room) {
            if (room.players[2] === null) {
                room.players[2] = socket.id;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });
                
                // Notify P1 that P2 joined, transition to draft phase
                room.gameState = 'drafting';
                io.to(roomCode).emit('gameStarted', {
                    roomState: getPublicRoomState(room)
                });
            } else {
                socket.emit('errorMsg', 'Room is already full.');
            }
        } else {
            socket.emit('errorMsg', 'Room not found.');
        }
    });

    socket.on('draftComplete', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        room.playerColors[data.player] = data.color;
        
        data.pieces.forEach(p => {
            room.board[p.r][p.c] = { type: p.type, player: data.player, hasMoved: false };
        });

        room.draftReady = (room.draftReady || 0) + 1;

        if (room.draftReady === 2) {
            room.gameState = 'coinflip';
            room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
            
            io.to(data.roomCode).emit('draftPhaseEnded', {
                roomState: getPublicRoomState(room)
            });
        }
    });

    socket.on('makeMove', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        // Apply move
        const piece = room.board[data.from.r][data.from.c];
        room.board[data.to.r][data.to.c] = piece;
        room.board[data.from.r][data.from.c] = null;
        if (piece) piece.hasMoved = true;
        
        // Switch turn
        room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        
        io.to(data.roomCode).emit('moveMade', {
            from: data.from,
            to: data.to,
            nextPlayer: room.currentPlayer
        });
    });

    socket.on('playAgainRequest', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        
        room.playAgainReady = (room.playAgainReady || 0) + 1;
        
        if (room.playAgainReady === 2) {
            // Reset room state
            room.gameState = 'drafting';
            room.draftReady = 0;
            room.playAgainReady = 0;
            room.board = Array(12).fill(null).map(() => Array(8).fill(null));
            room.draftPoints = { 1: 39, 2: 39 };
            room.kingsPlaced = { 1: false, 2: false };
            
            io.to(data.roomCode).emit('gameRestarted');
        } else {
            io.to(data.roomCode).emit('playAgainStatus', { count: room.playAgainReady });
        }
    });

    socket.on('leaveRoom', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete rooms[data.roomCode];
        }
    });

    socket.on('colorSelected', (data) => {
        console.log(`[DEBUG] Player ${data.player} selected color ${data.color} in room ${data.roomCode}`);
        const room = rooms[data.roomCode];
        if (room) {
            room.playerColors[data.player] = data.color;
            socket.to(data.roomCode).emit('opponentColorChanged', data.color);
            console.log(`[DEBUG] Broadcasted opponentColorChanged(${data.color}) to room ${data.roomCode}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [code, room] of Object.entries(rooms)) {
            if (room.players[1] === socket.id || room.players[2] === socket.id) {
                io.to(code).emit('opponentLeft');
                delete rooms[code];
            }
        }
    });
});

// Helper to strip sensitive info before sending to clients
function getPublicRoomState(room) {
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
