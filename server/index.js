// @ts-check
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { registerChesspell } = require('./chesspell');
const { registerChessdown } = require('./chessdown');
const { securityHeaders, sameOriginHandshake } = require('./security');
const { openDb } = require('./db');
const { authRouter } = require('./accounts/routes');
const { accountRouter } = require('./accounts/account-routes');
const { oauthRouter, deleteExpiredPending } = require('./accounts/oauth');
const { sessionStore } = require('./accounts/sessions');
const { statsStore } = require('./stats');
const { friendsRouter, friendStore } = require('./friends');
const { registerPresence } = require('./presence');
const { forgetSignedOut } = require('./sign-out');

const ROOT = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
const server = http.createServer(app);
// Largest legitimate message: a Ches'spell profile with its avatar (40 KB at most).
// Only this site's pages may open a game or presence connection.
const io = new Server(server, { maxHttpBufferSize: 64_000, allowRequest: sameOriginHandshake });

// Serve the portfolio hub
app.use(express.static(path.join(ROOT, 'hub')));

// Shared assets (self-hosted fonts)
app.use('/assets', express.static(path.join(ROOT, 'assets')));

// Serve the games statically
app.use('/chesspell', express.static(path.join(ROOT, 'games', 'chesspell')));
app.use('/chessdown', express.static(path.join(ROOT, 'games', 'chessdown')));


const PORT = Number(process.env.PORT) || 3000;

/** A catch handler that logs the error, with what was being done. */
const logError = (doing) => (err) => console.error(`${doing}: ${err.message}`);

// Last safety net: a promise error that nothing caught is logged, instead of stopping
// the server and every game in progress. Each one is a bug to fix.
process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise error:', err instanceof Error ? err.stack : err);
});
const HOUR = 60 * 60 * 1000;

async function start() {
    const db = await openDb(); // Tables are brought up to date first
    const sessions = sessionStore(db);
    const stats = statsStore(db);
    const chesspell = registerChesspell(io, { sessions, stats });
    const chessdown = registerChessdown(io, { sessions, stats });
    const rooms = { chesspell: chesspell.rooms, chessdown: chessdown.rooms };
    const presence = registerPresence(io, { sessions, friends: friendStore(db), rooms });
    const onSignOut = (who) => forgetSignedOut(io, rooms, who);
    app.use('/api/auth', oauthRouter(db));
    app.use('/api/auth', authRouter(db, { onSignOut }));
    app.use('/api/account', accountRouter(db, { onSignOut }));
    app.use('/api/friends', friendsRouter(db, {
        onChange: (ids) => presence.friendsChanged(ids).catch(logError('Presence: friends update failed')),
    }));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
    const cleanUp = () => {
        sessions.deleteExpired().catch(logError('Cleanup: expired sessions'));
        deleteExpiredPending(db).catch(logError('Cleanup: expired Google sign-ins'));
    };
    cleanUp(); // At start too: a server that restarts often would otherwise never clean up
    setInterval(cleanUp, HOUR).unref();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT} (0.0.0.0)`);
    });
}

start().catch((err) => {
    console.error(`Server could not start: ${err.message}`);
    process.exit(1);
});
