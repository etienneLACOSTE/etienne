// @ts-check
// Helpers shared by the game socket handlers.

const crypto = require('crypto');

const ROOM_CODE_LENGTH = 6; // 26^6 ≈ 309 million codes: not practical to guess

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(crypto.randomInt(chars.length));
    }
    return code;
}

// Message rate per connection (token bucket shared by all events of a socket).
// Real clients send a few messages per second; a flood is dropped, then cut off.
const RATE_PER_SECOND = 20;
const BURST = 40;
const DROPS_BEFORE_DISCONNECT = 200;

function allowMessage(socket) {
    const now = Date.now();
    const bucket = socket.data.rate || (socket.data.rate = { tokens: BURST, last: now, dropped: 0 });
    bucket.tokens = Math.min(BURST, bucket.tokens + ((now - bucket.last) / 1000) * RATE_PER_SECOND);
    bucket.last = now;
    if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
    }
    if (++bucket.dropped >= DROPS_BEFORE_DISCONNECT) socket.disconnect(true);
    return false;
}

// Rooms are kept in memory: one waiting room per player, and a cap on the total.
const MAX_ROOMS = 1000;

/**
 * Call before creating a room for `socket`: closes the room it is still waiting in,
 * and says whether there is space for a new one.
 */
function makeRoomFor(rooms, socket) {
    for (const [code, room] of Object.entries(rooms)) {
        if (room.players[1] === socket.id && room.players[2] === null) {
            socket.leave(code);
            delete rooms[code];
        }
    }
    return Object.keys(rooms).length < MAX_ROOMS;
}

// A handler that throws would stop the whole server, so every handler is guarded,
// and messages over the rate limit are ignored.
function safeOn(socket, event, handler) {
    socket.on(event, (...args) => {
        if (event !== 'disconnect' && !allowMessage(socket)) return;
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

/** Player number (1 or 2) of this socket in the room, or null for outsiders. */
function playerOf(room, socket) {
    if (room.players[1] === socket.id) return 1;
    if (room.players[2] === socket.id) return 2;
    return null;
}

module.exports = { generateRoomCode, safeOn, getRoom, isSquare, playerOf, makeRoomFor, MAX_ROOMS, RATE_PER_SECOND, BURST };
