// @ts-check
// When a player signs out (one session) or is signed out everywhere (all sessions of an
// account, or the account deleted), the connections their pages still hold open stop
// acting for the account at once, instead of until the page closes:
// - a game connection plays on as a guest: the game goes on, but is no longer counted
//   for the account;
// - a presence connection (accounts only) is closed: friends no longer see them online.

const GAMES = ['chesspell', 'chessdown'];

/**
 * @param {import('socket.io').Server} io
 * @param {Record<string, Record<string, any>>} rooms each game's open rooms
 * @param {{ session?: string, userId?: number }} who session: one session (its key, from
 *   sessionKey); userId: every session of this account
 */
function forgetSignedOut(io, rooms, who) {
    const signedOut = (socket) => {
        const user = socket.data.user;
        if (!user) return false;
        return who.session ? socket.data.session === who.session : Number(user.id) === Number(who.userId);
    };
    for (const game of GAMES) {
        for (const socket of io.of(`/${game}`).sockets.values()) {
            if (!signedOut(socket)) continue;
            socket.data.user = null;
            socket.data.session = null;
            for (const room of Object.values(rooms[game] || {})) {
                for (const player of [1, 2]) {
                    if (room.players && room.players[player] === socket.id && room.accounts) room.accounts[player] = null;
                }
            }
        }
    }
    for (const socket of io.of('/presence').sockets.values()) {
        if (signedOut(socket)) socket.disconnect();
    }
}

module.exports = { forgetSignedOut };
