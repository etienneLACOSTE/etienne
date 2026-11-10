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

// Rooms are kept in memory: one waiting room per player, a cap per address and in total,
// so that one machine cannot take every room (or all the memory) for itself.
const MAX_ROOMS = 1000;
const MAX_ROOMS_PER_IP = 5;
const MAX_CONNECTIONS_PER_IP = 20;
// The end-to-end tests open many connections from one machine: they turn the per-address
// limits off. Never set in production.
const PER_IP_LIMITS = process.env.PER_IP_LIMITS !== 'off';

/**
 * The visitor's address. Behind a host's proxy, every connection comes from the proxy:
 * CLIENT_IP_HEADER names the header where the host writes the visitor's address, one
 * the visitor cannot set. On Render: cf-connecting-ip (written by Cloudflare). Never
 * X-Forwarded-For, whose entries can be written by the visitor.
 */
function addressFrom(headers, address) {
    const header = process.env.CLIENT_IP_HEADER;
    const value = header && headers && headers[header.toLowerCase()];
    if (typeof value === 'string' && value.trim()) return value.trim();
    return address || '';
}

/**
 * Who is playing: before a socket connects, read the site's session cookie (sent with
 * the handshake, same origin) and keep the signed-in user in socket.data.user (or null).
 * A database hiccup only makes the player a guest.
 * With `stats`, the user also carries their totals per game (shown to opponents).
 * @param {{ use: Function }} namespace
 * @param {{ userFor: (cookie: string, options?: { withAvatar?: boolean }) => Promise<any> } | null} sessions
 * @param {{ totals: (userId: number) => Promise<Record<string, { played: number, wins: number }>> } | null} [stats]
 */
function identifyPlayers(namespace, sessions, stats = null) {
    namespace.use(async (socket, next) => {
        socket.data.user = null;
        if (sessions) {
            try {
                const user = await sessions.userFor(socket.handshake.headers.cookie, { withAvatar: true });
                if (user && stats) user.stats = await stats.totals(user.id);
                socket.data.user = user;
            } catch { /* guest */ }
        }
        next();
    });
}

function clientIp(socket) {
    const handshake = socket.handshake || {};
    return addressFrom(handshake.headers, handshake.address);
}

/**
 * Call before creating a room for `socket`: closes the room it is still waiting in,
 * and says whether there is space for a new one (in total and for its address).
 */
function makeRoomFor(rooms, socket) {
    for (const [code, room] of Object.entries(rooms)) {
        if (room.players[1] === socket.id && room.players[2] === null) {
            socket.leave(code);
            delete rooms[code];
        }
    }
    const ip = clientIp(socket);
    const own = Object.values(rooms).filter((room) => room.hostIp === ip).length;
    return Object.keys(rooms).length < MAX_ROOMS && (!PER_IP_LIMITS || own < MAX_ROOMS_PER_IP);
}

/** The fields every new room starts with: who opened it, and when it was last used. */
function roomOrigin(socket) {
    return { hostIp: clientIp(socket), lastActivity: Date.now() };
}

/** Refuse more than MAX_CONNECTIONS_PER_IP open connections from one address (shared by both games). */
const connections = new Map();
function limitConnections(namespace) {
    namespace.use((socket, next) => {
        const ip = clientIp(socket);
        const open = connections.get(ip) || 0;
        if (PER_IP_LIMITS && open >= MAX_CONNECTIONS_PER_IP) return next(new Error('Too many connections.'));
        connections.set(ip, open + 1);
        let counted = true;
        const release = () => {
            if (!counted) return;
            counted = false;
            const left = (connections.get(ip) || 1) - 1;
            if (left > 0) connections.set(ip, left);
            else connections.delete(ip);
        };
        // 'disconnect' never fires for a socket whose link closes while later checks
        // (identifyPlayers) still wait on the database: the link's own close covers it.
        socket.on('disconnect', release);
        if (socket.conn) socket.conn.once('close', release);
        next();
    });
}

// Idle rooms are closed: a room that is not in the middle of a game (waiting for a
// second player, drafting, or finished) after 15 minutes without a message from its
// players, and a game after 6 turns in a row lost on time (nobody plays any more).
const IDLE_ROOM_MS = 15 * 60_000;
const MAX_IDLE_TURNS = 6;

/** Codes of the rooms to close at `now`. */
function idleRooms(rooms, now) {
    return Object.entries(rooms)
        .filter(([, room]) => room.gameState !== 'playing' && now - room.lastActivity > IDLE_ROOM_MS)
        .map(([code]) => code);
}

/** Check every minute for idle rooms; `close(code)` closes one. */
function sweepIdleRooms(rooms, close) {
    setInterval(() => idleRooms(rooms, Date.now()).forEach(close), 60_000).unref();
}

// A handler that throws would stop the whole server, so every handler is guarded,
// and messages over the rate limit are ignored.
function safeOn(socket, event, handler) {
    socket.on(event, (...args) => {
        if (event !== 'disconnect' && !allowMessage(socket)) return;
        const ignored = (err) => console.error(`Ignored malformed "${event}" message: ${err.message}`);
        try {
            const result = handler(...args);
            if (result && typeof result.catch === 'function') result.catch(ignored); // Async handlers
        } catch (err) {
            ignored(err);
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

/**
 * Player number (1 or 2) of this socket in the room, or null for outsiders.
 * A message from a player counts as activity in the room (see idleRooms).
 */
function playerOf(room, socket) {
    const player = room.players[1] === socket.id ? 1 : room.players[2] === socket.id ? 2 : null;
    if (player !== null) room.lastActivity = Date.now();
    return player;
}

module.exports = {
    generateRoomCode, safeOn, getRoom, isSquare, playerOf, makeRoomFor, roomOrigin, clientIp, addressFrom, identifyPlayers,
    limitConnections, idleRooms, sweepIdleRooms,
    MAX_ROOMS, MAX_ROOMS_PER_IP, MAX_CONNECTIONS_PER_IP, IDLE_ROOM_MS, MAX_IDLE_TURNS, RATE_PER_SECOND, BURST,
};
