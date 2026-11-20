// @ts-check
// Helpers shared by the game socket handlers.

const crypto = require('crypto');
const net = require('net');
const { sessionKey } = require('./accounts/sessions');

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
/** Online games are for players with an account (guests have the campaign). */
const SIGN_IN_TO_PLAY = 'Sign in to play online.';
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
 * Used as the key of the per-address limits, so one visitor gets one key: see limitKey.
 */
function addressFrom(headers, address) {
    const header = process.env.CLIENT_IP_HEADER;
    const value = header && headers && headers[header.toLowerCase()];
    if (typeof value === 'string' && value.trim()) return limitKey(value.trim());
    return limitKey(address || '');
}

/**
 * One key per visitor: an IPv4 address as is (also when written as IPv6, ::ffff:1.2.3.4);
 * an IPv6 address by its first 64 bits, since one home or phone gets a whole /64 and
 * could otherwise change address at each attempt.
 */
function limitKey(address) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return mapped[1];
    if (!net.isIPv6(address)) return address;
    const [head, tail = ''] = address.split('%')[0].split('::');
    const left = head ? head.split(':') : [];
    const right = address.includes('::') && tail ? tail.split(':') : [];
    const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
    return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
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
        socket.data.session = null;
        if (sessions) {
            try {
                const user = await sessions.userFor(socket.handshake.headers.cookie, { withAvatar: true });
                if (user && stats) user.stats = await stats.totals(user.id);
                socket.data.user = user;
                if (user) socket.data.session = sessionKey(socket.handshake.headers.cookie);
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

// A connection comes back with what it missed only if the last message it got is still
// kept by Socket.io (2 minutes, server/index.js). A player who thinks for long (overall
// timer) may get nothing for longer: every minute, each game in progress gets a small
// 'roomPulse' message, kept like the others, so the page always has a recent one.
// ROOM_PULSE_MS is shorter for the end-to-end tests only.
const PULSE_MS = Number(process.env.ROOM_PULSE_MS) || 60_000;

/**
 * Send 'roomPulse' to every room with two players. Returns the function that sends it
 * once (called every PULSE_MS).
 * @param {{ to: (room: string) => { emit: Function } }} nsp the game's namespace
 * @param {Record<string, any>} rooms the game's open rooms
 */
function pulseRooms(nsp, rooms) {
    const pulse = () => {
        for (const room of Object.values(rooms)) {
            if (room.players[1] && room.players[2]) nsp.to(room.id).emit('roomPulse');
        }
    };
    setInterval(pulse, PULSE_MS).unref();
    return pulse;
}

// A player whose connection drops keeps their seat for a while: Socket.io's connection
// state recovery (server/index.js) brings the same socket back (same id, same rooms) with
// the messages it missed. The clock goes on meanwhile. SEAT_HOLD_MS is shorter for the
// end-to-end tests only.
const SEAT_HOLD_MS = Number(process.env.SEAT_HOLD_MS) || 30_000;
// Disconnect reasons after which Socket.io keeps the session for a comeback; the others
// mean the page closed its connection on purpose.
const RECOVERABLE_REASONS = new Set([
    'transport error', 'transport close', 'forced close', 'ping timeout', 'server shutting down', 'forced server close',
]);

/** A seat token: 128 random bits, URL-safe. */
const newSeatToken = () => crypto.randomBytes(16).toString('base64url');
const SEAT_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** Compare two seat tokens in constant time. */
function sameToken(a, b) {
    return typeof a === 'string' && typeof b === 'string' && a.length === b.length
        && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Seats of one game kept through a dropped connection. Each player is told by their own
 * socket id, so a player who comes back only gets the messages meant for them:
 * - the opponent: 'opponentDisconnected' { seconds }, then 'opponentReconnected' or 'opponentLeft';
 * - the player who did not come back in time: 'seatLost' (replayed if they come back later).
 * A page that reloads gets a new connection, not the old one: it takes its seat back with
 * the seat token it was given ('seatToken' { roomCode, token }, kept by the page for this
 * tab only) while the seat is held (resume).
 * @param {{ to: (room: string) => { emit: Function }, in?: (room: string) => { socketsLeave: (room: string) => void } }} nsp
 *   the game's namespace
 * @param {Record<string, any>} rooms the game's open rooms
 * @param {(room: any, player: 1 | 2) => void} gone the player is gone for good: count the
 *   game as lost (if it was in progress) and close the room
 * @param {{ holdMs?: number }} [options]
 */
function seatKeeper(nsp, rooms, gone, { holdMs = SEAT_HOLD_MS } = {}) {
    const tell = (room, player, event, data) => {
        if (room.players[player]) nsp.to(room.players[player]).emit(event, data);
    };
    /** Give the player of a seat the token of their seat (a new one each time: an old one stops working). */
    const issue = (room, player) => {
        room.seatTokens = room.seatTokens || {};
        room.seatTokens[player] = newSeatToken();
        tell(room, player, 'seatToken', { roomCode: room.id, token: room.seatTokens[player] });
    };
    const leave = (room, player) => {
        const other = player === 1 ? 2 : 1;
        tell(room, player, 'seatLost');
        tell(room, other, 'opponentLeft');
        gone(room, player);
    };
    return {
        /** On 'disconnect': hold the seats of this socket, or give them up at once. */
        dropped(socket, reason) {
            for (const room of Object.values(rooms)) {
                const player = playerOf(room, socket);
                if (!player) continue;
                if (!RECOVERABLE_REASONS.has(reason)) {
                    leave(room, player);
                    continue;
                }
                room.seatHolds = room.seatHolds || {};
                clearTimeout(room.seatHolds[player]);
                room.seatHolds[player] = setTimeout(() => {
                    delete room.seatHolds[player];
                    if (rooms[room.id] === room) leave(room, player);
                }, holdMs);
                room.seatHolds[player].unref?.();
                tell(room, player === 1 ? 2 : 1, 'opponentDisconnected', { seconds: Math.ceil(holdMs / 1000) });
            }
        },
        /** On 'connection' of a recovered socket: give its seats back. */
        returned(socket) {
            if (!socket.recovered) return;
            for (const room of Object.values(rooms)) {
                const player = playerOf(room, socket);
                const hold = player && room.seatHolds && room.seatHolds[player];
                if (!hold) continue;
                clearTimeout(hold);
                delete room.seatHolds[player];
                // Signed out meanwhile (server/sign-out.js only reaches open connections).
                if (room.accounts && !socket.data.user) room.accounts[player] = null;
                tell(room, player === 1 ? 2 : 1, 'opponentReconnected');
            }
        },
        issue,
        /**
         * A new connection (a reloaded page) takes its seat back with its token, while the
         * seat is held. Returns the room and seat, or why not:
         * - 'gone': no such seat (wrong token, room closed, seat already lost);
         * - 'busy': the seat's connection is still open (another tab, or the server has
         *   not seen the old page close yet: the page tries again);
         * - 'over': the game has ended meanwhile; the seat is given up;
         * - 'elsewhere': this connection already has a seat in another room (the page moved
         *   on before the answer came).
         * The connection that held the seat before is told 'seatLost' and taken out of the
         * room: Socket.io's recovery could otherwise bring it back into the room's messages.
         * @returns {{ room: any, player: 1 | 2 } | { error: 'gone' | 'busy' | 'over' | 'elsewhere' }}
         */
        resume(socket, data) {
            const room = getRoom(rooms, data && data.roomCode);
            const token = data && data.token;
            if (!room || typeof token !== 'string' || !SEAT_TOKEN.test(token)) return { error: 'gone' };
            const tokens = room.seatTokens || {};
            const player = /** @type {(1 | 2)[]} */ ([1, 2]).find((p) => sameToken(tokens[p], token));
            if (!player) return { error: 'gone' };
            if (room.players[player] === socket.id) return room.gameState === 'over' ? { error: 'over' } : { room, player };
            const seatedElsewhere = Object.values(rooms).some((r) => r !== room && (r.players[1] === socket.id || r.players[2] === socket.id));
            if (seatedElsewhere) return { error: 'elsewhere' };
            if (!room.seatHolds || !room.seatHolds[player]) return { error: 'busy' };
            if (room.gameState === 'over') {
                leave(room, player);
                return { error: 'over' };
            }
            clearTimeout(room.seatHolds[player]);
            delete room.seatHolds[player];
            // Only the same account keeps counting for the game.
            const account = room.accounts && room.accounts[player];
            if (account && (!socket.data.user || Number(socket.data.user.id) !== Number(account.id))) room.accounts[player] = null;
            const previous = room.players[player];
            if (previous) {
                nsp.to(previous).emit('seatLost');
                if (nsp.in) nsp.in(previous).socketsLeave(room.id);
            }
            room.players[player] = socket.id;
            room.lastActivity = Date.now();
            socket.join(room.id);
            issue(room, player);
            tell(room, player === 1 ? 2 : 1, 'opponentReconnected');
            return { room, player };
        },
        /** The room closes: no seat to keep any more. */
        release(room) {
            for (const hold of Object.values(room.seatHolds || {})) clearTimeout(hold);
            room.seatHolds = {};
        },
    };
}

/**
 * Draw offers of one game: a player offers a draw, the other accepts or declines. Rules:
 * - only while the game is in progress, one offer at a time;
 * - a player offers at most once per turn played (no flood of offers);
 * - the offer ends when the other player plays a turn (playing is declining), or when a
 *   connection drops.
 * Both players are told, each by their own socket id: 'drawOffered' { by }, then
 * 'drawOfferEnded' { reason: 'declined' | 'played' | 'dropped' }, or the game's own end.
 * State kept in room.draw.
 * @param {{ to: (room: string) => { emit: Function } }} nsp the game's namespace
 * @param {Record<string, any>} rooms the game's open rooms
 * @param {(room: any) => void} agreed both players agree: end the game as a draw
 */
function drawOffers(nsp, rooms, agreed) {
    const draw = (room) => room.draw || (room.draw = { offeredBy: null, turns: 0, lastOffer: { 1: -1, 2: -1 } });
    const tellBoth = (room, event, data) => {
        for (const player of [1, 2]) if (room.players[player]) nsp.to(room.players[player]).emit(event, data);
    };
    const end = (room, reason) => {
        const d = draw(room);
        if (!d.offeredBy) return;
        d.offeredBy = null;
        tellBoth(room, 'drawOfferEnded', { reason });
    };
    return {
        /** @param {1 | 2} player */
        offer(room, player) {
            const d = draw(room);
            if (room.gameState !== 'playing' || d.offeredBy || d.lastOffer[player] === d.turns) return;
            d.offeredBy = player;
            d.lastOffer[player] = d.turns;
            tellBoth(room, 'drawOffered', { by: player });
        },
        /** @param {1 | 2} player @param {unknown} accept */
        answer(room, player, accept) {
            const d = draw(room);
            if (room.gameState !== 'playing' || !d.offeredBy || d.offeredBy === player) return;
            if (accept !== true) return end(room, 'declined');
            d.offeredBy = null;
            agreed(room);
        },
        /** `player` has played a turn (a move, or a turn lost on time). */
        turnPlayed(room, player) {
            const d = draw(room);
            d.turns++;
            if (d.offeredBy && d.offeredBy !== player) end(room, 'played');
        },
        /** A connection dropped: its offers, made or received, end. */
        dropped(socket) {
            for (const room of Object.values(rooms)) {
                if (playerOf(room, socket)) end(room, 'dropped');
            }
        },
    };
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
    generateRoomCode, safeOn, getRoom, isSquare, playerOf, makeRoomFor, roomOrigin, clientIp, addressFrom, limitKey, identifyPlayers,
    limitConnections, idleRooms, sweepIdleRooms, seatKeeper, drawOffers, pulseRooms,
    SIGN_IN_TO_PLAY, MAX_ROOMS, MAX_ROOMS_PER_IP, MAX_CONNECTIONS_PER_IP, IDLE_ROOM_MS, MAX_IDLE_TURNS, RATE_PER_SECOND, BURST, SEAT_HOLD_MS, PULSE_MS,
};
