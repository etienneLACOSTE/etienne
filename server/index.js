const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { registerChesspell } = require('./chesspell');
const { registerChessdown } = require('./chessdown');
const { securityHeaders } = require('./security');

const ROOT = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
const server = http.createServer(app);
// Largest legitimate message: a Ches'spell profile with a ~200 KB avatar.
const io = new Server(server, { maxHttpBufferSize: 300_000 });

// Serve the portfolio hub
app.use(express.static(path.join(ROOT, 'hub')));

// Shared assets (self-hosted fonts)
app.use('/assets', express.static(path.join(ROOT, 'assets')));

// Serve the games statically
app.use('/chesspell', express.static(path.join(ROOT, 'games', 'chesspell')));
app.use('/chessdown', express.static(path.join(ROOT, 'games', 'chessdown')));

registerChesspell(io);
registerChessdown(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (0.0.0.0)`);
});
