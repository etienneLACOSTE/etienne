const { generateRoomCode, safeOn, getRoom } = require('./socket-utils');

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

function registerChesspell(io) {
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
}

module.exports = { registerChesspell };
