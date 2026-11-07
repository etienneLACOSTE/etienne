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

/** Player number (1 or 2) of this socket in the room, or null for outsiders. */
function playerOf(room, socket) {
    if (room.players[1] === socket.id) return 1;
    if (room.players[2] === socket.id) return 2;
    return null;
}

module.exports = { generateRoomCode, safeOn, getRoom, isSquare, playerOf };
