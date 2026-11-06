const { generateRoomCode, safeOn, getRoom, isSquare } = require('./socket-utils');

const CHESSDOWN_ROWS = 12;
const CHESSDOWN_COLS = 8;

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

function registerChessdown(io) {
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
}

module.exports = { registerChessdown };
