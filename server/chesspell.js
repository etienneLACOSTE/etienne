// @ts-check
const {
    generateRoomCode, makeRoomFor, roomOrigin, limitConnections, identifyPlayers, sweepIdleRooms, safeOn, getRoom, isSquare, playerOf,
    MAX_IDLE_TURNS,
} = require('./socket-utils');
const { TurnClock, sanitizeTimer } = require('./turn-clock');
const Game = require('../games/chesspell/game.js');

// -----------------------------------------------------
// CHES'SPELL SOCKET LOGIC (Namespace /chesspell)
// The server is the referee: it keeps the game state with the shared game logic
// (games/chesspell/game.js), accepts only the player to move, legal moves, cards
// from their deck not played yet and valid spell targets, draws Tornado's random
// shuffle, keeps the clock, and sends each player the resulting state.
// -----------------------------------------------------
const chesspellRooms = {};

const CARD_COUNT = 20;
const DECK_SIZE = 3;
const NAME_MAX = 15;
const AVATAR_MAX = 40_000; // The page makes 150 px JPEG avatars, about 20 KB as a data URL
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function getChesspellPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        decks: room.decks,
        profiles: room.profiles,
        timer: room.clock.settings,
    };
}

const COLORS = { 1: 'white', 2: 'black' };

/** A deck is exactly 3 distinct card ids between 1 and 20, or null. */
function sanitizeDeck(deck) {
    if (!Array.isArray(deck) || deck.length !== DECK_SIZE) return null;
    if (!deck.every(id => Number.isInteger(id) && id >= 1 && id <= CARD_COUNT)) return null;
    return new Set(deck).size === DECK_SIZE ? [...deck] : null;
}

const count = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);

/**
 * The profile shown to the opponent. A signed-in player's name and picture are their
 * account's, set here: online, nobody can take another player's name.
 */
function playerProfile(socket, profile, deck) {
    const safe = sanitizeProfile(profile, deck);
    const user = socket.data.user;
    return user ? { ...safe, id: `u${user.id}`, name: user.username, avatar: user.avatar || '' } : safe;
}

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

/**
 * @param {import('socket.io').Server} io
 * @param {{ sessions?: any }} [options] sessions: who is signed in (server/accounts/sessions.js)
 */
function registerChesspell(io, { sessions = null } = {}) {
    const ioChesspell = io.of('/chesspell');
    limitConnections(ioChesspell);
    identifyPlayers(ioChesspell, sessions);

    /** Each player gets the new state and what just happened. */
    function sendState(room, action) {
        const game = room.game;
        if (game.winner) {
            room.gameState = 'over';
            room.clock.stop();
        } else if (action.turnEnded) {
            room.clock.start(game.turn);
        }
        if (action.type !== 'timeout') room.idleTurns = 0;
        for (const player of [1, 2]) {
            ioChesspell.to(room.players[player]).emit('gameState', { state: Game.snapshot(game), action });
        }
    }

    /** The player to move ran out of time: turn skipped, or game lost (overall timer). */
    function timeUp(room) {
        if (chesspellRooms[room.id] !== room || room.gameState !== 'playing') return;
        const loser = room.game.turn;
        if (room.clock.timer.mode === 'overall') {
            room.game.winner = loser === 'white' ? 'Black' : 'White';
            sendState(room, { type: 'timeout', by: loser, turnEnded: false });
            return;
        }
        room.idleTurns = (room.idleTurns || 0) + 1;
        if (room.idleTurns >= MAX_IDLE_TURNS) {
            return closeIdleRoom(room.id, `Game closed: nobody played for ${MAX_IDLE_TURNS} turns.`);
        }
        Game.cancelSpell(room.game);
        room.game.targetingState = null;
        Game.endTurn(room.game);
        sendState(room, { type: 'timeout', by: loser, turnEnded: true });
    }

    function closeRoom(code) {
        chesspellRooms[code].clock.stop();
        delete chesspellRooms[code];
    }

    /** Close a room nobody uses any more, and tell its players why. */
    function closeIdleRoom(code, reason = 'Game closed after 15 minutes without activity.') {
        ioChesspell.to(code).emit('roomClosed', reason);
        ioChesspell.in(code).socketsLeave(code);
        closeRoom(code);
    }
    sweepIdleRooms(chesspellRooms, (code) => closeIdleRoom(code));

    ioChesspell.on('connection', (socket) => {
        console.log('Chesspell User connected:', socket.id);

        safeOn(socket, 'createRoom', (data) => {
            const deck = sanitizeDeck(data.deck);
            if (!deck) return socket.emit('errorMsg', 'Invalid deck.');
            if (!makeRoomFor(chesspellRooms, socket)) return socket.emit('errorMsg', 'Too many games in progress. Try again later.');

            let roomCode = generateRoomCode();
            while (chesspellRooms[roomCode]) {
                roomCode = generateRoomCode();
            }

            const room = chesspellRooms[roomCode] = {
                id: roomCode,
                players: { 1: socket.id, 2: null }, // P1 creates the room and plays white
                gameState: 'waiting',
                decks: { 1: deck, 2: [] },
                profiles: { 1: playerProfile(socket, data.profile, deck), 2: null },
                game: null,
                clock: /** @type {TurnClock} */ (null),
                idleTurns: 0,
                ...roomOrigin(socket),
            };
            room.clock = new TurnClock(sanitizeTimer(data), () => timeUp(room));

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
                room.profiles[2] = playerProfile(socket, data.profile, deck);

                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });

                room.gameState = 'playing';
                room.game = Game.newGame();
                ioChesspell.to(roomCode).emit('gameStarted', {
                    roomState: getChesspellPublicRoomState(room)
                });
                room.clock.start('white');
            }
        });

        /** The room and color of a member whose turn it is, or null. */
        function playerToMove(data) {
            const room = getRoom(chesspellRooms, data && data.roomCode);
            if (!room || room.gameState !== 'playing') return null;
            const player = playerOf(room, socket);
            if (player === null || room.game.turn !== COLORS[player] || room.game.winner) return null;
            return { room, color: COLORS[player] };
        }

        safeOn(socket, 'makeMove', (data) => {
            const turn = playerToMove(data);
            if (!turn || !isSquare(data.from, 8, 8) || !isSquare(data.to, 8, 8)) return;
            const { room, color } = turn;
            const { from, to } = data;
            if (!Game.isLegalMove(room.game, from.r, from.c, to.r, to.c)) return;

            const result = Game.move(room.game, from.r, from.c, to.r, to.c);
            if (result === 'endTurn') Game.endTurn(room.game);
            sendState(room, { type: 'move', by: color, from, to, turnEnded: result === 'endTurn' });
        });

        safeOn(socket, 'spellActivated', (data) => {
            const turn = playerToMove(data);
            if (!turn) return;
            const { room, color } = turn;
            const player = color === 'white' ? 1 : 2;
            // Only a card from the player's own deck, once, and not in the middle of another spell.
            if (room.game.targetingState || !room.decks[player].includes(data.cardId)
                || room.game.usedCards[color].includes(data.cardId)) return;

            const result = Game.activateSpell(room.game, data.cardId);
            sendState(room, { type: 'spell', by: color, cardId: data.cardId, status: result.status, message: result.message || null });
        });

        safeOn(socket, 'spellSquareClicked', (data) => {
            const turn = playerToMove(data);
            if (!turn || !isSquare(data, 8, 8) || !turn.room.game.targetingState) return;
            const { room, color } = turn;

            // Tornado's shuffle is drawn here, so both players see the same board.
            const result = Game.clickSquare(room.game, data.r, data.c, Math.random);
            if (result.status === 'invalid') return socket.emit('errorMsg', result.message);
            if (result.status === 'ignored') return;
            if (result.status === 'done') {
                if (result.endTurn) Game.endTurn(room.game);
                Game.completeSpell(room.game);
            }
            sendState(room, { type: 'target', by: color, turnEnded: result.status === 'done' && result.endTurn });
        });

        safeOn(socket, 'leaveRoom', (data) => {
            const room = getRoom(chesspellRooms, data.roomCode);
            if (room && playerOf(room, socket) !== null) {
                socket.leave(data.roomCode);
                socket.to(data.roomCode).emit('opponentLeft');
                closeRoom(data.roomCode);
            }
        });

        safeOn(socket, 'disconnect', () => {
            for (const [code, room] of Object.entries(chesspellRooms)) {
                if (playerOf(room, socket) !== null) {
                    ioChesspell.to(code).emit('opponentLeft');
                    closeRoom(code);
                }
            }
        });
    });
}

module.exports = { registerChesspell, sanitizeProfile, sanitizeDeck };
