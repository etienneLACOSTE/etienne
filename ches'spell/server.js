const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const rooms = {};

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

    socket.on('createRoom', (data) => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) {
            roomCode = generateRoomCode();
        }

        rooms[roomCode] = {
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
        const room = rooms[roomCode];
        if (room) {
            if (room.players[2] === null) {
                room.players[2] = socket.id;
                room.decks[2] = data.deck || [];
                room.profiles[2] = data.profile || null;
                
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });
                
                room.gameState = 'playing';
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

    socket.on('makeMove', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;

        // Switch turn
        room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';
        
        io.to(data.roomCode).emit('moveMade', {
            from: data.from,
            to: data.to,
            nextPlayer: room.currentPlayer
        });
    });

    socket.on('spellActivated', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        
        // Broadcast the spell activation to the room (both players will process the effect locally)
        io.to(data.roomCode).emit('spellActivated', data);
    });

    socket.on('spellSquareClicked', (data) => {
        const room = rooms[data.roomCode];
        if (!room) return;
        
        io.to(data.roomCode).emit('spellSquareClicked', data);
    });

    socket.on('leaveRoom', (data) => {
        const room = rooms[data.roomCode];
        if (room) {
            socket.leave(data.roomCode);
            socket.to(data.roomCode).emit('opponentLeft');
            delete rooms[data.roomCode];
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

function getPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
        decks: room.decks,
        profiles: room.profiles
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
