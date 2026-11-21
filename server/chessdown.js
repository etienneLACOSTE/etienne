// @ts-check
const {
    generateRoomCode, makeRoomFor, roomOrigin, limitConnections, identifyPlayers, sweepIdleRooms, safeOn, getRoom, isSquare, playerOf,
    seatKeeper, drawOffers, pulseRooms,
    MAX_IDLE_TURNS, SIGN_IN_TO_PLAY,
} = require('./socket-utils');
const engine = require('../games/chessdown/engine.js');
const Series = require('../games/chessdown/series.js');
const { TurnClock, sanitizeTimer } = require('./turn-clock');
const { gameChat } = require('./chat');
const { plausibleClub } = require('./chessdown-clubs');

const { ROWS, COLS, MAX_POINTS, PIECE_VALUES } = engine;
const JERSEY_COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'white', 'black'];
// Deployment rows: player 1 drafts on the 3 bottom rows, player 2 on the 3 top rows.
const DRAFT_ROWS = { 1: [ROWS - 3, ROWS - 1], 2: [0, 2] };

const NO_CLUB = 'Create your All Star club first.';
const IN_A_GAME = 'Finish your game first.';
const LADDER_MODES = ['classic', 'allstar'];
// Ranked queue: two players are paired when their ratings are close enough; the gap
// allowed grows the longer they wait.
const QUEUE_TICK_MS = 2_000;
const QUEUE_GAP = 100; // At first
const QUEUE_GAP_STEP = 50; // More every QUEUE_STEP_MS of waiting
const QUEUE_STEP_MS = 10_000;
const QUEUE_GAP_MAX = 800;
const BAD_CLUB = 'Your club cannot play online: its levels do not match its experience.';

// The server keeps the clock (server/turn-clock.js).
const COIN_FLIP_MS = 3_000; // Clients start the first turn after the coin flip animation

// -----------------------------------------------------
// CHESSDOWN SOCKET LOGIC (Namespace /chessdown)
// The server is the referee: it validates drafts, turns and moves with the
// shared rules engine and keeps the authoritative board.
// -----------------------------------------------------
const chessdownRooms = {};

function getChessdownPublicRoomState(room) {
    return {
        id: room.id,
        gameState: room.gameState,
        currentPlayer: room.currentPlayer,
        draftPoints: room.draftPoints,
        kingsPlaced: room.kingsPlaced,
        playerColors: room.playerColors,
        board: room.board,
        timer: room.clock.settings,
        // The match: a best of 3 or a single game (games/chessdown/series.js), the last
        // game's result between two games, and whether a coin chose who starts.
        series: room.series,
        lastGame: room.lastGame || null,
        coinFlip: room.coinFlip !== false,
        // 'classic', or 'allstar': each side drafts its club (levels), held by the server.
        mode: room.mode,
        ranked: Boolean(room.ranked),
        clubNames: room.mode === 'allstar' ? { 1: room.clubs[1] ? room.clubs[1].name : null, 2: room.clubs[2] ? room.clubs[2].name : null } : null,
        // Signed-in players' usernames (set by the server), null for a guest.
        names: { 1: room.accounts[1] ? room.accounts[1].username : null, 2: room.accounts[2] ? room.accounts[2].username : null },
    };
}

/**
 * Everything a page that comes back needs to show the game again. During the draft, only
 * the player's own pieces: the opponent's army stays hidden until both have drafted.
 */
function resumeState(room, player) {
    const board = room.gameState === 'drafting'
        ? room.board.map((row) => row.map((piece) => (piece && piece.player === player ? piece : null)))
        : room.board;
    return {
        ...getChessdownPublicRoomState(room),
        roomCode: room.id,
        board,
        playerNumber: player,
        drafted: Boolean(room.drafted[player]),
        lastMove: room.lastMove,
        positionHistory: room.positionHistory,
        timeLeft: room.clock.left([1, 2]),
        club: room.mode === 'allstar' ? room.clubs[player] : null, // Only the player's own
    };
}

function newGameState() {
    return {
        gameState: 'drafting',
        currentPlayer: 1,
        draftPoints: { 1: MAX_POINTS, 2: MAX_POINTS },
        kingsPlaced: { 1: false, 2: false },
        board: engine.createBoard(),
        lastMove: null,
        drafted: { 1: false, 2: false },
        playAgain: { 1: false, 2: false },
        idleTurns: 0,
        positionHistory: {}, // Position key -> times seen, for the draw by repetition
        draw: null, // Draw offers (server/socket-utils.js drawOffers)
    };
}

/**
 * An All Star draft (docs/games/chessdown-ladders.md): each piece is a player of the club
 * the server holds for this seat, at its level, once; one king, the full budget (levels'
 * costs), the player's zone. Returns the pieces to put on the board, or null.
 * @param {any} pieces what the page sent: squares and the club player on each
 * @param {number} player @param {any} club
 */
function allStarArmy(pieces, player, club) {
    if (!Array.isArray(pieces) || pieces.length > 3 * COLS || !club) return null;
    const used = new Set();
    const army = [];
    for (const p of pieces) {
        if (!p || !isSquare(p, ROWS, COLS) || !Number.isInteger(p.clubId) || used.has(p.clubId)) return null;
        const member = club.players.find((m) => m.id === p.clubId);
        if (!member) return null;
        used.add(p.clubId);
        army.push({ r: p.r, c: p.c, type: member.type, ...(member.type === 'k' ? {} : { level: member.level }), clubId: member.id });
    }
    return engine.checkArmy(army, player).length ? null : army;
}

/** A draft is legal if it has exactly one king, fits the budget and stays in the player's zone. */
function isValidDraft(pieces, player) {
    if (!Array.isArray(pieces) || pieces.length > 3 * COLS) return false;
    const [minRow, maxRow] = DRAFT_ROWS[player];
    const seen = new Set();
    let cost = 0;
    let kings = 0;
    for (const p of pieces) {
        if (!isSquare(p, ROWS, COLS) || p.r < minRow || p.r > maxRow) return false;
        if (typeof p.type !== 'string' || !Object.hasOwn(PIECE_VALUES, p.type)) return false;
        const key = `${p.r},${p.c}`;
        if (seen.has(key)) return false;
        seen.add(key);
        cost += PIECE_VALUES[p.type];
        if (p.type === 'k') kings++;
    }
    return kings === 1 && cost <= MAX_POINTS;
}

/**
 * @param {import('socket.io').Server} io
 * @param {{ sessions?: any, stats?: any, friends?: any, reports?: any, clubs?: any, ladders?: any, onBlock?: (ids: number[]) => void }} [options]
 *   sessions: who is signed in (server/accounts/sessions.js); stats: where finished games are
 *   recorded (server/stats.js); friends: blocks between players, for the chat
 *   (server/friends.js); reports: reported chat messages (server/reports.js); clubs: the
 *   accounts' All Star clubs (server/chessdown-clubs.js); ladders: ranked ratings
 *   (server/ladders.js); onBlock: a player blocked another from the chat
 */
function registerChessdown(io, { sessions = null, stats = null, friends = null, reports = null, clubs = null, ladders = null, onBlock = () => {} } = {}) {
    const ioChessdown = io.of('/chessdown');
    limitConnections(ioChessdown);
    identifyPlayers(ioChessdown, sessions, stats);

    /** A finished game counts for each signed-in player. winner: 1 or 2, or 0 for a draw. */
    function recordResult(room, winner, reason) {
        if (!stats) return;
        const name = (p) => (room.accounts[p] ? room.accounts[p].username : `Player ${p}`);
        stats.recordOnline({
            game: 'chessdown', accounts: room.accounts, names: { 1: name(1), 2: name(2) },
            winner, reason, startedAt: room.startedAt,
        }).catch((err) => console.error(`Chessdown result not recorded: ${err.message}`));
    }

    /** Counts the position after a move; true on its third time (a draw, as on the pages). */
    function seenThreeTimes(room) {
        const key = engine.serializeBoard(room.board, room.currentPlayer);
        room.positionHistory[key] = (room.positionHistory[key] || 0) + 1;
        return room.positionHistory[key] >= 3;
    }

    /**
     * A game ends (winner 1 or 2, or 0 for a draw): it counts in the stats and in the
     * series, and the pages are told the series first ('seriesUpdate'), then how the game
     * ended. Between two games of a series the room waits for both players ('between').
     */
    function gameOver(room, winner, reason) {
        room.clock.stop();
        recordResult(room, winner, reason);
        room.series = Series.recordGame(room.series, winner);
        room.lastGame = { winner, reason };
        room.gameState = room.series.over ? 'over' : 'between';
        ioChessdown.to(room.id).emit('seriesUpdate', { series: room.series });
        if (room.series.over) settleRanked(room, room.series.winner);
    }

    /**
     * A ranked series is over (winner 1, 2, or 0 drawn): the ladder counts it (server/ladders.js),
     * and each page is told its rating before and after.
     */
    function settleRanked(room, winner) {
        if (!room.ranked || room.ranked.settled) return;
        room.ranked.settled = true;
        if (!ladders || !room.accounts[1] || !room.accounts[2]) return;
        const { mode } = room.ranked;
        ladders.recordSeries({ mode, players: { 1: room.accounts[1].id, 2: room.accounts[2].id }, winner })
            .then((result) => {
                if (!result) return;
                for (const player of [1, 2]) {
                    const socketId = room.players[player];
                    if (socketId) ioChessdown.to(socketId).emit('ladderResult', { mode, counted: result.counted, ...result[player] });
                }
            })
            .catch((err) => console.error(`Ladder result not recorded: ${err.message}`));
    }

    /** A player leaves a game in progress: it counts as a win for the other one (and the series). */
    function forfeit(room, leaver) {
        // A ranked series left before its end, even between two games: lost.
        if (room.ranked && !room.series.over) settleRanked(room, leaver === 1 ? 2 : 1);
        if (room.gameState !== 'playing') return;
        room.gameState = 'over';
        room.clock.stop();
        recordResult(room, leaver === 1 ? 2 : 1, 'forfeit');
    }

    /** The player to move ran out of time. */
    function timeUp(room) {
        if (chessdownRooms[room.id] !== room || room.gameState !== 'playing') return;
        if (room.clock.timer.mode === 'overall') {
            gameOver(room, room.currentPlayer === 1 ? 2 : 1, 'time');
            ioChessdown.to(room.id).emit('timeOut', { loser: room.currentPlayer });
            return;
        }
        skipTurn(room);
    }

    /** The turn is lost on time; after MAX_IDLE_TURNS in a row, nobody plays: the room closes. */
    function skipTurn(room) {
        room.clock.stop();
        draws.turnPlayed(room, room.currentPlayer);
        room.idleTurns = (room.idleTurns || 0) + 1;
        if (room.idleTurns >= MAX_IDLE_TURNS) {
            return closeIdleRoom(room.id, `Game closed: nobody played for ${MAX_IDLE_TURNS} turns.`);
        }
        room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        ioChessdown.to(room.id).emit('turnSkipped', { nextPlayer: room.currentPlayer });
        room.clock.start(room.currentPlayer);
    }

    function closeRoom(code) {
        chessdownRooms[code].clock.stop();
        seats.release(chessdownRooms[code]);
        delete chessdownRooms[code];
    }

    // A dropped connection keeps its seat a while (server/socket-utils.js).
    const seats = seatKeeper(ioChessdown, chessdownRooms, (room, player) => {
        forfeit(room, player);
        closeRoom(room.id);
    });

    // Both players agree on a draw: the game ends, the clock stops.
    const draws = drawOffers(ioChessdown, chessdownRooms, (room) => {
        gameOver(room, 0, 'agreement');
        ioChessdown.to(room.id).emit('drawAgreed');
    });

    // Chat between the two players (server/chat.js).
    const chat = gameChat(ioChessdown, chessdownRooms, friends, { game: 'chessdown', reports, onBlock });

    /** Close a room nobody uses any more, and tell its players why. */
    function closeIdleRoom(code, reason = 'Game closed after 15 minutes without activity.') {
        ioChessdown.to(code).emit('roomClosed', reason);
        ioChessdown.in(code).socketsLeave(code);
        closeRoom(code);
    }
    sweepIdleRooms(chessdownRooms, (code) => closeIdleRoom(code));
    pulseRooms(ioChessdown, chessdownRooms); // Keeps a comeback possible after a long silence

    /**
     * The All Star club of a signed-in socket, from the account; an error message instead
     * when it has none, or one that may not play online.
     * @returns {Promise<{ club: any } | { error: string }>}
     */
    async function clubFor(socket) {
        const kept = clubs ? await clubs.get(socket.data.user.id) : { club: null };
        if (!kept.club) return { error: NO_CLUB };
        if (!plausibleClub(kept.club)) return { error: BAD_CLUB };
        return { club: kept.club };
    }

    /** Both seats are taken: the draft starts; in All Star, each page gets its own club. */
    function startDraft(room) {
        room.gameState = 'drafting';
        ioChessdown.to(room.id).emit('gameStarted', { roomState: getChessdownPublicRoomState(room) });
        if (room.mode === 'allstar') {
            for (const player of [1, 2]) ioChessdown.to(room.players[player]).emit('allStarClub', { club: room.clubs[player] });
        }
    }

    // --- Ranked queue (docs/games/chessdown-ladders.md) ---
    /** @type {Record<string, { socket: any, userId: number, rating: number, since: number, club: any, avoid: Set<number> }[]>} */
    const queues = { classic: [], allstar: [] };

    const leaveQueue = (socket) => {
        for (const mode of LADDER_MODES) queues[mode] = queues[mode].filter((e) => e.socket.id !== socket.id);
    };
    const gapOf = (entry, now) => Math.min(QUEUE_GAP_MAX, QUEUE_GAP + QUEUE_GAP_STEP * Math.floor((now - entry.since) / QUEUE_STEP_MS));
    const inGame = (socket) => Object.values(chessdownRooms).some((r) => (r.players[1] === socket.id && r.players[2] !== null) || r.players[2] === socket.id);

    /** Two players of the queue meet in a new room: a best of 3 that counts for the ladder. */
    function startRanked(mode, a, b) {
        let roomCode = generateRoomCode();
        while (chessdownRooms[roomCode]) roomCode = generateRoomCode();
        const room = chessdownRooms[roomCode] = {
            id: roomCode,
            players: { 1: a.socket.id, 2: b.socket.id },
            playerColors: { 1: 'blue', 2: 'red' },
            ...newGameState(),
            accounts: { 1: a.socket.data.user, 2: b.socket.data.user },
            mode,
            clubs: { 1: a.club, 2: b.club },
            ranked: { mode, settled: false },
            startedAt: 0,
            clock: /** @type {TurnClock} */ (null),
            series: Series.newSeries('bo3'),
            ...roomOrigin(a.socket),
        };
        room.clock = new TurnClock({ mode: 'turn', ms: Series.SERIES_TURN_SECONDS * 1000 }, () => timeUp(room));
        for (const [player, entry, other] of [[1, a, b], [2, b, a]]) {
            entry.socket.join(roomCode);
            entry.socket.emit('rankedMatch', { roomCode, playerNumber: player, mode, rating: entry.rating, opponent: { username: other.socket.data.user.username, rating: other.rating } });
            seats.issue(room, player);
        }
        startDraft(room);
    }

    /** Pair the players waiting the longest with the closest rating within both their gaps. */
    function matchQueues() {
        const now = Date.now();
        for (const mode of LADDER_MODES) {
            const queue = queues[mode];
            for (let i = 0; i < queue.length; i++) {
                const a = queue[i];
                let best = -1;
                for (let j = i + 1; j < queue.length; j++) {
                    const b = queue[j];
                    const gap = Math.abs(a.rating - b.rating);
                    if (Number(a.userId) === Number(b.userId) || gap > Math.min(gapOf(a, now), gapOf(b, now))) continue;
                    if (a.avoid.has(Number(b.userId)) || b.avoid.has(Number(a.userId))) continue; // A block, either way
                    if (best === -1 || gap < Math.abs(a.rating - queue[best].rating)) best = j;
                }
                if (best === -1) continue;
                const b = queue[best];
                queues[mode] = queue.filter((e) => e !== a && e !== b);
                startRanked(mode, a, b);
                return matchQueues(); // The queue changed: look again
            }
        }
    }
    setInterval(matchQueues, QUEUE_TICK_MS).unref();

    ioChessdown.on('connection', (socket) => {
        console.log('Chessdown User connected:', socket.id);
        seats.returned(socket);
        chat.connect(socket);

        // A ranked best of 3: the player waits in the queue of a ladder until paired.
        safeOn(socket, 'joinQueue', async (data) => {
            if (!socket.data.user) return socket.emit('errorMsg', SIGN_IN_TO_PLAY);
            const mode = data && data.mode;
            if (!LADDER_MODES.includes(mode) || !ladders) return;
            if (inGame(socket)) return socket.emit('errorMsg', IN_A_GAME);
            let club = null;
            if (mode === 'allstar') {
                const found = await clubFor(socket);
                if ('error' in found) return socket.emit('errorMsg', found.error);
                club = found.club;
            }
            const rating = await ladders.ratingOf(socket.data.user.id, mode);
            const avoid = new Set(friends ? await friends.blockedEither(socket.data.user.id) : []);
            if (!socket.connected || inGame(socket)) return;
            leaveQueue(socket);
            makeRoomFor(chessdownRooms, socket); // A room it was waiting in closes
            queues[mode].push({ socket, userId: socket.data.user.id, rating, since: Date.now(), club, avoid });
            socket.emit('queueJoined', { mode, rating });
            matchQueues();
        });

        safeOn(socket, 'leaveQueue', () => {
            leaveQueue(socket);
            socket.emit('queueLeft');
        });

        safeOn(socket, 'createRoom', async (data) => {
            if (!socket.data.user) return socket.emit('errorMsg', SIGN_IN_TO_PLAY);
            leaveQueue(socket); // A private room instead of the ranked queue
            const allStar = Boolean(data && data.mode === 'allstar');
            let club = null;
            if (allStar) {
                const found = await clubFor(socket);
                if ('error' in found) return socket.emit('errorMsg', found.error);
                club = found.club;
            }
            if (!socket.connected) return;
            if (!makeRoomFor(chessdownRooms, socket)) return socket.emit('errorMsg', 'Too many games in progress. Try again later.');
            let roomCode = generateRoomCode();
            while (chessdownRooms[roomCode]) {
                roomCode = generateRoomCode();
            }

            const room = chessdownRooms[roomCode] = {
                id: roomCode,
                players: { 1: socket.id, 2: null },
                playerColors: { 1: 'blue', 2: 'red' },
                ...newGameState(),
                gameState: 'waiting',
                accounts: { 1: socket.data.user, 2: null }, // Signed-in players, for their stats
                mode: allStar ? 'allstar' : 'classic',
                clubs: { 1: club, 2: null },
                ranked: null,
                startedAt: 0,
                clock: /** @type {TurnClock} */ (null),
                // A best of 3 (30 s turns) when asked (the page always says), else one free game.
                series: Series.newSeries(data && data.format === 'bo3' ? 'bo3' : 'single'),
                ...roomOrigin(socket),
            };
            const timer = room.series.format === 'bo3'
                ? { mode: 'turn', ms: Series.SERIES_TURN_SECONDS * 1000 }
                : sanitizeTimer(data);
            room.clock = new TurnClock(timer, () => timeUp(room));

            socket.join(roomCode);
            socket.emit('roomCreated', roomCode);
            seats.issue(room, 1);
        });

        safeOn(socket, 'joinRoom', async (roomCode) => {
            leaveQueue(socket);
            let room = getRoom(chessdownRooms, roomCode);
            let club = null;
            if (socket.data.user && room && room.mode === 'allstar' && room.players[2] === null) {
                const found = await clubFor(socket);
                if ('error' in found) return socket.emit('errorMsg', found.error);
                club = found.club;
                room = getRoom(chessdownRooms, roomCode); // Still there after the wait?
            }
            if (!socket.data.user) {
                socket.emit('errorMsg', SIGN_IN_TO_PLAY);
            } else if (!room) {
                socket.emit('errorMsg', 'Room not found.');
            } else if (room.players[2] !== null || room.players[1] === socket.id) {
                socket.emit('errorMsg', 'Room is already full.');
            } else {
                room.players[2] = socket.id;
                room.accounts[2] = socket.data.user;
                room.clubs[2] = club;
                socket.join(roomCode);
                socket.emit('roomJoined', { roomCode, playerNumber: 2 });
                seats.issue(room, 2);
                startDraft(room);
            }
        });

        // A reloaded page takes its seat back (server/socket-utils.js) and gets the game.
        safeOn(socket, 'resumeSeat', (data) => {
            const back = seats.resume(socket, data);
            if ('error' in back) return socket.emit('resumeFailed', { reason: back.error });
            socket.emit('seatResumed', resumeState(back.room, back.player));
        });

        safeOn(socket, 'draftComplete', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'drafting') return;
            const player = playerOf(room, socket);
            // A player only submits their own draft, once, and it must be legal.
            if (player === null || data.player !== player || room.drafted[player]) return;
            if (!JERSEY_COLORS.includes(data.color)) return;
            const army = room.mode === 'allstar'
                ? allStarArmy(data.pieces, player, room.clubs[player])
                : (isValidDraft(data.pieces, player) ? data.pieces.map((p) => ({ r: p.r, c: p.c, type: p.type })) : null);
            if (!army) return socket.emit('draftRefused', { reason: 'army' });

            room.playerColors[player] = data.color;
            for (const p of army) {
                const { r, c, ...piece } = p;
                room.board[r][c] = { ...piece, player, hasMoved: false };
            }
            room.drafted[player] = true;

            if (room.drafted[1] && room.drafted[2]) {
                // Two clubs may pick the same jersey: the second seat takes another one.
                if (room.playerColors[1] === room.playerColors[2]) {
                    room.playerColors[2] = JERSEY_COLORS.find((c) => c !== room.playerColors[1]) || 'red';
                }
                room.gameState = 'playing';
                room.startedAt = Date.now();
                // In a series, the loser of the last game starts; otherwise the coin decides.
                const starter = Series.starter(room.series);
                room.coinFlip = !starter;
                room.currentPlayer = starter || (Math.random() < 0.5 ? 1 : 2);
                room.clock.reset();
                room.clock.start(room.currentPlayer, COIN_FLIP_MS);

                ioChessdown.to(data.roomCode).emit('draftPhaseEnded', {
                    roomState: getChessdownPublicRoomState(room)
                });
            }
        });

        safeOn(socket, 'makeMove', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            if (playerOf(room, socket) !== room.currentPlayer) return;
            if (!isSquare(data.from, ROWS, COLS) || !isSquare(data.to, ROWS, COLS)) return;

            const piece = room.board[data.from.r][data.from.c];
            if (!piece || piece.player !== room.currentPlayer) return;
            const legal = engine.getValidMoves(room, data.from.r, data.from.c)
                .some(m => m.r === data.to.r && m.c === data.to.c);
            if (!legal) return;

            const { targetPiece } = engine.applyMove(room, {
                fromR: data.from.r, fromC: data.from.c, toR: data.to.r, toC: data.to.c,
            });
            room.clock.stop();
            room.idleTurns = 0;
            const mover = room.currentPlayer;
            draws.turnPlayed(room, mover);
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            // King captured, or a piece survived a turn in the endzone: game over.
            if (targetPiece && targetPiece.type === 'k') {
                gameOver(room, mover, 'king');
            } else if (engine.hasPieceInEndzone(room.board, room.currentPlayer)) {
                gameOver(room, room.currentPlayer, 'touchdown');
            } else if (seenThreeTimes(room)) {
                gameOver(room, 0, 'repetition'); // The pages see it too and show the draw
            } else {
                room.clock.start(room.currentPlayer);
            }

            ioChessdown.to(data.roomCode).emit('moveMade', {
                from: data.from,
                to: data.to,
                nextPlayer: room.currentPlayer
            });
        });

        // Turn timer ran out: only the player whose turn it is may give it up.
        safeOn(socket, 'skipTurn', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            if (playerOf(room, socket) !== room.currentPlayer) return;

            skipTurn(room);
        });

        // A player resigns the game being played: it goes to the other side (and the series).
        safeOn(socket, 'resignGame', (data) => {
            const room = getRoom(chessdownRooms, data && data.roomCode);
            if (!room || room.gameState !== 'playing') return;
            const player = playerOf(room, socket);
            if (player === null) return;
            draws.turnPlayed(room, player);
            gameOver(room, player === 1 ? 2 : 1, 'resign');
            ioChessdown.to(room.id).emit('gameResigned', { loser: player });
        });

        safeOn(socket, 'offerDraw', (data) => {
            const room = getRoom(chessdownRooms, data && data.roomCode);
            const player = room && playerOf(room, socket);
            if (player) draws.offer(room, player);
        });

        safeOn(socket, 'answerDraw', (data) => {
            const room = getRoom(chessdownRooms, data && data.roomCode);
            const player = room && playerOf(room, socket);
            if (player) draws.answer(room, player, data.accept);
        });

        safeOn(socket, 'playAgainRequest', (data) => {
            // The next game of the series, or a new series once it is over: both must ask.
            const room = getRoom(chessdownRooms, data && data.roomCode);
            if (!room || (room.gameState !== 'between' && room.gameState !== 'over')) return;
            if (room.ranked && room.series.over) return; // Another ranked series goes through the queue
            const player = playerOf(room, socket);
            if (player === null) return;

            room.playAgain[player] = true;
            const count = Number(room.playAgain[1]) + Number(room.playAgain[2]);

            if (count === 2) {
                room.clock.reset();
                if (room.series.over) room.series = Series.newSeries(room.series.format);
                room.lastGame = null;
                Object.assign(room, newGameState());
                ioChessdown.to(data.roomCode).emit('gameRestarted', { series: room.series });
                // The pages forgot their seats when the game ended: new ones for the rematch.
                seats.issue(room, 1);
                seats.issue(room, 2);
            } else {
                ioChessdown.to(data.roomCode).emit('playAgainStatus', { count });
            }
        });

        safeOn(socket, 'leaveRoom', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            const player = room && playerOf(room, socket);
            if (room && player) {
                forfeit(room, player);
                socket.leave(data.roomCode);
                socket.to(data.roomCode).emit('opponentLeft');
                closeRoom(data.roomCode);
            }
        });

        safeOn(socket, 'colorSelected', (data) => {
            const room = getRoom(chessdownRooms, data.roomCode);
            if (!room || room.gameState !== 'drafting') return;
            const player = playerOf(room, socket);
            if (player === null || data.player !== player || !JERSEY_COLORS.includes(data.color)) return;

            room.playerColors[player] = data.color;
            socket.to(data.roomCode).emit('opponentColorChanged', data.color);
        });

        safeOn(socket, 'disconnect', (reason) => {
            leaveQueue(socket);
            draws.dropped(socket);
            seats.dropped(socket, reason);
        });
    });

    return { rooms: chessdownRooms, queues }; // Rooms: for invitations (server/presence.js)
}

module.exports = { registerChessdown };
