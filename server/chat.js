// @ts-check
// Chat between the two players of an online game. Rules:
// - only when both players are signed in (accounts), and neither has blocked the other;
// - each player can turn the chat off: they get nothing, and the opponent cannot write;
// - short text messages, relayed as text, limited in rate;
// - nothing is stored, except a message its reader reports: the last messages of a game
//   stay in the server's memory while it lasts, so that the reported one is copied from
//   there (never from what the reporting page says), into chat_reports (server/reports.js);
// - a player can block their opponent from the game: no more chat, and the block works as
//   on the account page (server/friends.js).
// Events: the page sends 'chatJoin' { roomCode, muted } when an online game starts,
// 'chatMuted' { roomCode, muted }, 'chatMessage' { roomCode, text },
// 'chatReport' { roomCode, messageId } and 'chatBlock' { roomCode }. Each player gets
// 'chatState' { available, reason, opponentMuted }, 'chatMessage' { id, from, name, text }
// and 'chatNotice' { reason, messageId? } (reason 'report-expired': the message is too old to
// be reported, only the last RECENT are kept).
const { safeOn, getRoom, playerOf } = require('./socket-utils');

const MAX_LENGTH = 200;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 5; // Messages per window and per connection
const RECENT = 30; // Messages of a game kept in memory, the ones that can be reported
const MAX_REPORTS = 5; // Reports per player and per game

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
 * @param {{ blocked: (blocker: number, blocked: number) => Promise<boolean>, block?: (me: number, other: number) => Promise<void> } | null} friends
 *   blocks between players (server/friends.js); null: no chat at all
 * @param {{ game?: string, reports?: { save: (r: any) => Promise<void> } | null, onBlock?: (ids: number[]) => void }} [options]
 *   game: its name, for the reports; reports: where reported messages go (server/reports.js),
 *   null: no reports; onBlock: a player blocked another from a game (friends lists change)
 * @returns {{ connect: (socket: any) => void }}
 */
function gameChat(nsp, rooms, friends, { game = '', reports = null, onBlock = () => {} } = {}) {
    /**
     * room.chat: who turned it off; who blocks whom between the two accounts (asked once);
     * the last messages, and the ones each player reported.
     */
    const chatOf = (room) => room.chat || (room.chat = {
        muted: { 1: false, 2: false }, blockedFor: '', blocked: null,
        recent: [], nextId: 1, reported: { 1: new Set(), 2: new Set() },
    });

    /**
     * Who blocks whom: { 1: player 1 blocked player 2, 2: the other way }, or null when it
     * cannot be known (no chat then). Asked once per pair of accounts.
     * @returns {Promise<{ 1: boolean, 2: boolean } | null>}
     */
    function blockedPair(room) {
        const chat = chatOf(room);
        const [a, b] = [room.accounts[1], room.accounts[2]];
        const pair = `${a.id}:${b.id}`;
        if (chat.blockedFor !== pair || !chat.blocked) {
            chat.blockedFor = pair;
            chat.blocked = Promise.all([friends.blocked(a.id, b.id), friends.blocked(b.id, a.id)])
                .then(([x, y]) => ({ 1: x, 2: y }))
                .catch(() => null);
        }
        return chat.blocked;
    }

    /** Whether `player` can chat in `room`, and why not. A blocked player is never told so. */
    async function stateFor(room, player) {
        const other = player === 1 ? 2 : 1;
        const accounts = room.accounts || {};
        if (!friends || !room.players[other]) return { available: false, reason: 'unavailable', opponentMuted: false };
        if (!accounts[player]) return { available: false, reason: 'you-guest', opponentMuted: false };
        if (!accounts[other]) return { available: false, reason: 'opponent-guest', opponentMuted: false };
        const blocks = await blockedPair(room);
        if (!blocks || blocks[1] || blocks[2]) {
            return { available: false, reason: blocks && blocks[player] ? 'you-blocked' : 'unavailable', opponentMuted: false };
        }
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
                const chat = chatOf(room);
                const message = { id: chat.nextId++, from: player, name: room.accounts[player].username, text };
                chat.recent.push({ ...message, userId: room.accounts[player].id });
                if (chat.recent.length > RECENT) chat.recent.shift();
                for (const p of [player, other]) {
                    if (room.players[p]) nsp.to(room.players[p]).emit('chatMessage', message);
                }
            });

            // A message of the opponent's, reported: copied from the server's memory.
            safeOn(socket, 'chatReport', async (data) => {
                const s = seat(socket, data);
                if (!s || !reports) return;
                const { room, player } = s;
                const me = room.accounts && room.accounts[player];
                if (!me || !socket.data.user) return;
                const chat = chatOf(room);
                const message = chat.recent.find((m) => m.id === data.messageId && m.from !== player);
                const reported = chat.reported[player];
                if (!message) {
                    // Sent in this game but no longer in memory: the page is told, so its button does not hang.
                    const id = data.messageId;
                    const oldest = chat.recent.length ? chat.recent[0].id : chat.nextId;
                    if (Number.isInteger(id) && id >= 1 && id < oldest) socket.emit('chatNotice', { reason: 'report-expired', messageId: id });
                    return;
                }
                if (reported.has(message.id)) return;
                if (reported.size >= MAX_REPORTS) return socket.emit('chatNotice', { reason: 'report-limit', messageId: message.id });
                reported.add(message.id);
                try {
                    await reports.save({ reporterId: me.id, reportedId: message.userId, reportedName: message.name, game, message: message.text });
                    socket.emit('chatNotice', { reason: 'reported', messageId: message.id });
                } catch (err) {
                    reported.delete(message.id);
                    console.error(`Chat report not saved: ${err.message}`);
                    socket.emit('chatNotice', { reason: 'report-failed', messageId: message.id });
                }
            });

            // Block the opponent from the game: as on the account page, for good.
            safeOn(socket, 'chatBlock', async (data) => {
                const s = seat(socket, data);
                if (!s || !friends || !friends.block) return;
                const { room, player } = s;
                const me = room.accounts && room.accounts[player];
                const them = room.accounts && room.accounts[player === 1 ? 2 : 1];
                if (!me || !them || !socket.data.user) return;
                try {
                    await friends.block(me.id, them.id);
                } catch (err) {
                    console.error(`Block from a game not saved: ${err.message}`);
                    return socket.emit('chatNotice', { reason: 'block-failed' });
                }
                chatOf(room).blocked = null; // Asked again
                socket.emit('chatNotice', { reason: 'blocked' });
                onBlock([me.id, them.id]);
                await tellState(room);
            });
        },
    };
}

module.exports = { gameChat, cleanMessage, MAX_LENGTH, RATE_MAX, RECENT, MAX_REPORTS };
