const { generateRoomCode, safeOn, getRoom, isSquare, playerOf } = require('./socket-utils');

// -----------------------------------------------------
// CHES'SPELL SOCKET LOGIC (Namespace /chesspell)
// Spells are resolved in the browsers, so the server cannot check move legality
// or turn order (spells such as Double Trouble change it). It relays only
// well-formed messages from room members, each playing their own deck, and
// sanitizes the profiles shown to the opponent.
// -----------------------------------------------------
const chesspellRooms = {};

const CARD_COUNT = 20;
const DECK_SIZE = 3;
const NAME_MAX = 15;
const AVATAR_MAX = 200_000; // ~150 KB image as a data URL
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function getChesspellPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
        decks: room.decks,
        profiles: room.profiles
    };
}

/** A deck is exactly 3 distinct card ids between 1 and 20, or null. */
function sanitizeDeck(deck) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return null;
    if (!deck.every(id => Number.isInteger(id) && id >= 1 && id <= CARD_COUNT)) return null;
    return new Set(deck).size === DECK_SIZE ? [...deck] : null;
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/** Keep only the profile fields the opponent needs, with safe values. */
function sanitizeProfile(profile, deck) {
    const p = profile && typeof profile === 'object' ? profile : {};
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, NAME_MAX) : '';
    const avatar = typeof p.avatar === 'string' && p.avatar.length <= AVATAR_MAX && AVATAR_RE.test(p.avatar) ? p.avatar : '';
    const stats = p.stats && typeof p.stats === 'object' ? p.stats : {};
    return {
        id: typeof p.id === 'string' ? p.id.slice(0, 40) : '',
        name: name || 'Player',
        avatar,
        stats: { played: count(stats.played), wins: count(stats.wins) },
        deck,
    };
}

function registerChesspell(io) {
    const ioChesspell = io.of('/chesspell');
    ioChesspell.on('connection', (socket) => {
        console.log('Chesspell User connected:', socket.id);

        safeOn(socket, 'createRoom', (data) => {
            const deck = sanitizeDeck(data.deck);
            if (!deck) return socket.emit('errorMsg', 'Invalid deck.');

            let roomCode = generateRoomCode();
            while (chesspellRooms[roomCode]) {
                roomCode = generateRoomCode();
            }

            chesspellRooms[roomCode] = {
                id: roomCode,
                players: { 1: socket.id, 2: null }, // P1 creates the room
                gameState: 'waiting',
                currentPlayer: 'white', // white plays first
                decks: { 1: deck, 2: [] },
                profiles: { 1: sanitizeProfile(data.profile, deck), 2: null }
            };

            socket.join(roomCode);
            socket.emit('roomCreated', roomCode);
        });

        safeOn(socket, 'joinRoom', (data) => {
            const roomCode = data.roomCode;
            const room = getRoom(chesspellRooms, roomCode);
            const deck = sanitizeDeck(data.deck);
            if (!room) {
                socket.emit('errorMsg', 'Room not found.');
            } else if (room.players[2] !== null || room.players[1] === socket.id) {
                socket.emit('errorMsg', 'Room is already full.');
            } else if (!deck) {
                socket.emit('errorMsg', 'Invalid deck.');
            } else {
                room.players[2] = socket.id;
                room.decks[2] = deck;
                room.profiles[2] = sanitizeProfile(data.profile, deck);

                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });

                room.gameState = 'playing';
                ioChesspell.to(roomCode).emit('gameStarted', {
                    roomState: getChesspellPublicRoomState(room)
                });
            }
        });

        safeOn(socket, 'makeMove', (data) => {
            const room = getRoom(chesspellRooms, data.roomCode);
            if (!room || room.gameState !== 'playing' || playerOf(room, socket) === null) return;
            if (!isSquare(data.from, 8, 8) || !isSquare(data.to, 8, 8)) return;

            // Switch turn
            room.currentPlayer = room.currentPlayer === 'white' ? 'black' : 'white';

            ioChesspell.to(data.roomCode).emit('moveMade', {
                from: { r: data.from.r, c: data.from.c },
                to: { r: data.to.r, c: data.to.c },
                nextPlayer: room.currentPlayer
            });
        });

        safeOn(socket, 'spellActivated', (data) => {
            const room = getRoom(chesspellRooms, data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            const player = playerOf(room, socket);
            // A player can only cast cards from their own deck.
            if (player === null || !room.decks[player].includes(data.cardId)) return;

            ioChesspell.to(data.roomCode).emit('spellActivated', { roomCode: data.roomCode, cardId: data.cardId });
        });

        safeOn(socket, 'spellSquareClicked', (data) => {
            const room = getRoom(chesspellRooms, data.roomCode);
            if (!room || room.gameState !== 'playing' || playerOf(room, socket) === null) return;
            if (!isSquare(data, 8, 8)) return;

            ioChesspell.to(data.roomCode).emit('spellSquareClicked', { roomCode: data.roomCode, r: data.r, c: data.c });
        });

        safeOn(socket, 'leaveRoom', (data) => {
            const room = getRoom(chesspellRooms, data.roomCode);
            if (room && playerOf(room, socket) !== null) {
                socket.leave(data.roomCode);
                socket.to(data.roomCode).emit('opponentLeft');
                delete chesspellRooms[data.roomCode];
            }
        });

        safeOn(socket, 'disconnect', () => {
            for (const [code, room] of Object.entries(chesspellRooms)) {
                if (playerOf(room, socket) !== null) {
                    ioChesspell.to(code).emit('opponentLeft');
                    delete chesspellRooms[code];
                }
            }
        });
    });
}

module.exports = { registerChesspell, sanitizeProfile, sanitizeDeck };
