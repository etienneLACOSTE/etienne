// @ts-check
// Chat between the two players of an online game. Rules:
// - only when both players are signed in (accounts), and neither has blocked the other;
// - each player can turn the chat off: they get nothing, and the opponent cannot write;
// - short text messages, relayed as text, limited in rate;
// - nothing is kept: no storage, no log of what is written.
// Events: the page sends 'chatJoin' { roomCode, muted } when an online game starts,
// 'chatMuted' { roomCode, muted } and 'chatMessage' { roomCode, text }. Each player gets
// 'chatState' { available, reason, opponentMuted }, 'chatMessage' { from, name, text } and
// 'chatNotice' { reason }.
const { safeOn, getRoom, playerOf } = require('./socket-utils');

const MAX_LENGTH = 200;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5; // Messages per window and per connection

// Control characters, and the ones that reverse the direction of the text around them.
const UNSAFE = /[\p{Cc}‪-‮⁦-⁩]/gu;

/** The message as relayed, or null when it is not a valid message. */
function cleanMessage(text) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
    const length = [...clean].length;
    return length >= 1 && length <= MAX_LENGTH ? clean : null;
}

/**
 * @param {{ to: (room: string) => { emit: Function } }} nsp the game's namespace
 * @param {Record<string, any>} rooms the game's open rooms
 * @param {{ blocked: (blocker: number, blocked: number) => Promise<boolean> } | null} friends
 *   blocks between players (server/friends.js); null: no chat at all
 * @returns {{ connect: (socket: any) => void }}
 */
function gameChat(nsp, rooms, friends) {
    /** room.chat: who turned it off; whether the two accounts block each other (asked once). */
    const chatOf = (room) => room.chat || (room.chat = { muted: { 1: false, 2: false }, blockedFor: '', blocked: null });

    /** True when either player blocked the other (asked once per pair of accounts). */
    function blockedPair(room) {
        const chat = chatOf(room);
        const [a, b] = [room.accounts[1], room.accounts[2]];
        const pair = `${a.id}:${b.id}`;
        if (chat.blockedFor !== pair || !chat.blocked) {
            chat.blockedFor = pair;
            chat.blocked = Promise.all([friends.blocked(a.id, b.id), friends.blocked(b.id, a.id)])
                .then(([x, y]) => x || y)
                .catch(() => true); // Unknown: no chat
        }
        return chat.blocked;
    }

    /** Whether `player` can chat in `room`, and why not. */
    async function stateFor(room, player) {
        const other = player === 1 ? 2 : 1;
        const accounts = room.accounts || {};
        if (!friends || !room.players[other]) return { available: false, reason: 'unavailable', opponentMuted: false };
        if (!accounts[player]) return { available: false, reason: 'you-guest', opponentMuted: false };
        if (!accounts[other]) return { available: false, reason: 'opponent-guest', opponentMuted: false };
        if (await blockedPair(room)) return { available: false, reason: 'unavailable', opponentMuted: false };
        return { available: true, reason: null, opponentMuted: chatOf(room).muted[other] };
    }

    async function tellState(room) {
        for (const player of /** @type {const} */ ([1, 2])) {
            if (!room.players[player]) continue;
            const state = await stateFor(room, player);
            if (room.players[player]) nsp.to(room.players[player]).emit('chatState', state);
        }
    }

    /** Too many messages from this connection in the last RATE_WINDOW_MS. */
    function tooFast(socket) {
        const now = Date.now();
        const recent = (socket.data.chatTimes || []).filter((t) => now - t < RATE_WINDOW_MS);
        socket.data.chatTimes = recent;
        if (recent.length >= RATE_MAX) return true;
        recent.push(now);
        return false;
    }

    /** The room and seat of a member, or null. */
    function seat(socket, data) {
        const room = getRoom(rooms, data && data.roomCode);
        const player = room && playerOf(room, socket);
        return player ? { room, player } : null;
    }

    return {
        connect(socket) {
            safeOn(socket, 'chatJoin', async (data) => {
                const s = seat(socket, data);
                if (!s) return;
                chatOf(s.room).muted[s.player] = data.muted === true;
                await tellState(s.room);
            });

            safeOn(socket, 'chatMuted', async (data) => {
                const s = seat(socket, data);
                if (!s) return;
                chatOf(s.room).muted[s.player] = data.muted === true;
                await tellState(s.room);
            });

            safeOn(socket, 'chatMessage', async (data) => {
                const s = seat(socket, data);
                if (!s) return;
                const { room, player } = s;
                const other = player === 1 ? 2 : 1;
                const text = cleanMessage(data.text);
                if (!text) return;
                const state = await stateFor(room, player);
                // The sender's connection must still be a signed-in one (not signed out since).
                if (!state.available || !socket.data.user || chatOf(room).muted[player]) return;
                if (state.opponentMuted) return socket.emit('chatNotice', { reason: 'muted' });
                if (tooFast(socket)) return socket.emit('chatNotice', { reason: 'rate' });
                const message = { from: player, name: room.accounts[player].username, text };
                for (const p of [player, other]) {
                    if (room.players[p]) nsp.to(room.players[p]).emit('chatMessage', message);
                }
            });
        },
    };
}

module.exports = { gameChat, cleanMessage, MAX_LENGTH, RATE_MAX };
