// @ts-check
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { registerChesspell } = require('./chesspell');
const { registerChessdown } = require('./chessdown');
const { securityHeaders } = require('./security');
const { openDb } = require('./db');
const { authRouter } = require('./accounts/routes');
const { accountRouter } = require('./accounts/account-routes');
const { oauthRouter, deleteExpiredPending } = require('./accounts/oauth');
const { sessionStore } = require('./accounts/sessions');
const { statsStore } = require('./stats');
const { friendsRouter } = require('./friends');

const ROOT = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
const server = http.createServer(app);
// Largest legitimate message: a Ches'spell profile with its avatar (40 KB at most).
const io = new Server(server, { maxHttpBufferSize: 64_000 });

// Serve the portfolio hub
app.use(express.static(path.join(ROOT, 'hub')));

// Shared assets (self-hosted fonts)
app.use('/assets', express.static(path.join(ROOT, 'assets')));

// Serve the games statically
app.use('/chesspell', express.static(path.join(ROOT, 'games', 'chesspell')));
app.use('/chessdown', express.static(path.join(ROOT, 'games', 'chessdown')));


const PORT = Number(process.env.PORT) || 3000;
const HOUR = 60 * 60 * 1000;

async function start() {
    const db = await openDb(); // Tables are brought up to date first
    const sessions = sessionStore(db);
    const stats = statsStore(db);
    registerChesspell(io, { sessions, stats });
    registerChessdown(io, { sessions, stats });
    app.use('/api/auth', oauthRouter(db));
    app.use('/api/auth', authRouter(db));
    app.use('/api/account', accountRouter(db));
    app.use('/api/friends', friendsRouter(db));
    app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
    setInterval(() => {
        sessions.deleteExpired().catch(() => {});
        deleteExpiredPending(db).catch(() => {});
    }, HOUR).unref();
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server listening on port ${PORT} (0.0.0.0)`);
    });
}

start().catch((err) => {
    console.error(`Server could not start: ${err.message}`);
    process.exit(1);
});
