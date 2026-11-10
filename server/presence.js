// @ts-check
// Presence and invitations (Socket.io namespace /presence). Every page of a signed-in
// player connects here, saying where it is ('site', 'chesspell' or 'chessdown').
// - Friends see each other online, and in which game.
// - From an online room they have just created, a player invites a friend who is online;
//   the friend gets the invitation on whatever page they are, and joins with one click.
// Guests are not connected: presence is for accounts only.

const { limitConnections, identifyPlayers, safeOn, getRoom } = require('./socket-utils');

const PAGES = ['site', 'chesspell', 'chessdown'];
const GAMES = ['chesspell', 'chessdown'];
/** Invitations one player may send per minute (each one rings a friend). */
const INVITES_PER_MINUTE = 10;

/**
 * @param {import('socket.io').Server} io
 * @param {{ sessions: any, friends: ReturnType<typeof import('./friends').friendStore>,
 *   rooms: Record<string, Record<string, any>> }} deps rooms: each game's open rooms
 */
function registerPresence(io, { sessions, friends, rooms }) {
    const ns = io.of('/presence');
    limitConnections(ns);
    identifyPlayers(ns, sessions);

    /** userId -> (socketId -> page) */
    const online = new Map();
    const userRoom = (id) => `u${id}`;

    /** Where a player is: in a game if any of their pages is one, else on the site, else null. */
    function whereIs(userId) {
        const pages = online.get(userId);
        if (!pages || !pages.size) return null;
        const list = [...pages.values()];
        return list.find((p) => p !== 'site') || 'site';
    }

    /** Tell a player's online friends where they are now (null: gone). */
    async function announce(user) {
        const ids = await friends.friendIds(user.id);
        const where = whereIs(user.id); // After the wait: the player may have left meanwhile
        for (const id of ids) {
            if (online.has(id)) ns.to(userRoom(id)).emit('friendPresence', { username: user.username, where });
        }
    }

    /** The online friends of a player, with where they are. */
    async function onlineFriends(userId) {
        const ids = (await friends.friendIds(userId)).filter((id) => online.has(id));
        if (!ids.length) return [];
        const list = await Promise.all(ids.map(async (id) => {
            const user = await friends.userById(id);
            return user && { username: user.username, where: whereIs(id) };
        }));
        return list.filter(Boolean);
    }

    /** A friendship changed (server/friends.js): both players get fresh lists. */
    async function friendsChanged(userIds) {
        for (const id of userIds.map(Number)) {
            if (online.has(id)) ns.to(userRoom(id)).emit('friendsOnline', await onlineFriends(id));
        }
    }

    ns.on('connection', (socket) => {
        const user = socket.data.user;
        // Presence is for signed-in players only. Not disconnect(true): that would also
        // close the page's game connection, which shares the same underlying link.
        if (!user) return socket.disconnect();
        const id = Number(user.id);
        const asked = socket.handshake.auth && socket.handshake.auth.page;
        const page = typeof asked === 'string' && PAGES.includes(asked) ? asked : 'site';

        // Listeners first, before any wait on the database: a page that closes during the
        // first query must still be removed from the players online.
        socket.on('disconnect', () => {
            const pages = online.get(id);
            if (!pages) return;
            const was = whereIs(id);
            pages.delete(socket.id);
            if (!pages.size) online.delete(id);
            if (whereIs(id) !== was) {
                announce({ id, username: user.username }).catch((err) => console.error(`Presence: announce failed: ${err.message}`));
            }
        });

        const sent = [];
        safeOn(socket, 'invite', async (data) => {
            const now = Date.now();
            while (sent.length && now - sent[0] > 60_000) sent.shift();
            if (sent.length >= INVITES_PER_MINUTE) return socket.emit('inviteResult', { ok: false, error: 'Too many invitations: wait a minute.' });
            const game = data && data.game;
            const room = GAMES.includes(game) ? getRoom(rooms[game], data.roomCode) : null;
            // Only from a room this player created and that still waits for an opponent.
            if (!room || room.gameState !== 'waiting' || !room.accounts[1] || Number(room.accounts[1].id) !== id) {
                return socket.emit('inviteResult', { ok: false, error: 'Create an online room first.' });
            }
            const friend = await friends.findUser(data.username);
            const friendId = friend && Number(friend.id);
            if (!friend || !(await friends.areFriends(id, friendId)) || await friends.blocked(friendId, id)) {
                return socket.emit('inviteResult', { ok: false, error: 'You can only invite your friends.' });
            }
            if (!online.has(friendId)) return socket.emit('inviteResult', { ok: false, error: `${friend.username} is not online.` });
            sent.push(now);
            ns.to(userRoom(friendId)).emit('invited', { from: user.username, game, roomCode: room.id });
            socket.emit('inviteResult', { ok: true, username: friend.username });
        });

        socket.join(userRoom(id));
        const before = whereIs(id);
        if (!online.has(id)) online.set(id, new Map());
        online.get(id).set(socket.id, page);
        const changed = whereIs(id) !== before;

        // The database may fail (a Neon outage): log it, never let it stop the server.
        (async () => {
            if (changed) await announce({ id, username: user.username });
            if (socket.connected) socket.emit('friendsOnline', await onlineFriends(id));
        })().catch((err) => console.error(`Presence: connection setup failed: ${err.message}`));
    });

    return { friendsChanged, isOnline: (id) => online.has(Number(id)) };
}

module.exports = { registerPresence };
