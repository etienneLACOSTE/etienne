// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// The server is the referee: it only accepts messages from room members, in turn,
// and (for Chessdown) only legal drafts and moves. Each scenario runs real
// socket.io clients inside a page, so no extra dependency is needed.

test.describe('Server authority', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/'); // Loads /socket.io/socket.io.js
    // Shared helpers available to every page.evaluate below.
    await page.evaluate(() => {
      window.T = {
        connect: (ns) => new Promise((resolve) => {
          const s = io(ns, { forceNew: true });
          s.on('connect', () => resolve(s));
        }),
        once: (s, event, ms = 800) => new Promise((resolve) => {
          const t = setTimeout(() => resolve(undefined), ms);
          s.once(event, (data) => { clearTimeout(t); resolve(data === undefined ? true : data); });
        }),
        // Two Chessdown players in a drafted room: P1 king (11,4) + rook (9,3); P2 king (0,3).
        async chessdownRoom(timer) {
          const p1 = await T.connect('/chessdown');
          const p2 = await T.connect('/chessdown');
          const code = await new Promise((r) => { p1.once('roomCreated', r); p1.emit('createRoom', timer); });
          const started = T.once(p2, 'gameStarted');
          p2.emit('joinRoom', code);
          const joined = await started;
          const ended = T.once(p1, 'draftPhaseEnded', 2000);
          p1.emit('draftComplete', { roomCode: code, player: 1, color: 'blue', pieces: [{ r: 11, c: 4, type: 'k' }, { r: 9, c: 3, type: 'r' }] });
          p2.emit('draftComplete', { roomCode: code, player: 2, color: 'red', pieces: [{ r: 0, c: 3, type: 'k' }] });
          const state = (await ended).roomState;
          const sockets = { 1: p1, 2: p2 };
          return { code, p1, p2, starter: state.currentPlayer, mover: sockets[state.currentPlayer], waiter: sockets[3 - state.currentPlayer], state, joined };
        },
        // A Ches'spell game: white (creator) has Wall, Trap, Tornado; black has Cannibalism, Freeze, Sacrifice.
        async chesspellRoom(timer = {}) {
          const white = await T.connect('/chesspell');
          const black = await T.connect('/chesspell');
          const profile = { id: 'a', name: 'A', avatar: '', stats: { played: 0, wins: 0 } };
          const code = await new Promise((r) => { white.once('roomCreated', r); white.emit('createRoom', { deck: [8, 16, 10], profile, ...timer }); });
          const started = T.once(white, 'gameStarted');
          black.emit('joinRoom', { roomCode: code, deck: [1, 15, 14], profile: { ...profile, id: 'b', name: 'B' } });
          await started;
          const g = { code, white, black };
          // Send a message and wait until both players got the resulting state.
          g.act = async (socket, event, data) => {
            const states = Promise.all([T.once(white, 'gameState', 2000), T.once(black, 'gameState', 2000)]);
            socket.emit(event, { roomCode: code, ...data });
            return states;
          };
          return g;
        },
        // A legal first move for whoever starts.
        firstMove(starter) {
          return starter === 1 ? { from: { r: 9, c: 3 }, to: { r: 8, c: 3 } } : { from: { r: 0, c: 3 }, to: { r: 1, c: 3 } };
        },
      };
    });
  });

  test('chessdown: the draft board reaches both players', async ({ page }) => {
    const board = await page.evaluate(async () => (await T.chessdownRoom()).state.board);
    expect(board[11][4]).toMatchObject({ type: 'k', player: 1 });
    expect(board[9][3]).toMatchObject({ type: 'r', player: 1 });
    expect(board[0][3]).toMatchObject({ type: 'k', player: 2 });
  });

  test('chessdown: a legal move in turn is accepted', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom();
      const seen = T.once(g.waiter, 'moveMade');
      g.mover.emit('makeMove', { roomCode: g.code, ...T.firstMove(g.starter) });
      return { moved: await seen, starter: g.starter };
    });
    expect(result.moved).toMatchObject({ nextPlayer: 3 - result.starter });
  });

  test('chessdown: moves out of turn, illegal moves and outsiders are rejected', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom();
      const intruder = await T.connect('/chessdown');
      const seen = T.once(g.p1, 'moveMade');
      const other = g.starter === 1 ? { from: { r: 0, c: 3 }, to: { r: 1, c: 3 } } : { from: { r: 9, c: 3 }, to: { r: 8, c: 3 } };
      g.waiter.emit('makeMove', { roomCode: g.code, ...other }); // Not their turn
      const kingFrom = g.starter === 1 ? { r: 11, c: 4 } : { r: 0, c: 3 };
      g.mover.emit('makeMove', { roomCode: g.code, from: kingFrom, to: { r: 5, c: 4 } }); // King cannot fly
      g.mover.emit('makeMove', { roomCode: g.code, from: { r: 5, c: 5 }, to: { r: 4, c: 5 } }); // Empty square
      intruder.emit('makeMove', { roomCode: g.code, ...T.firstMove(g.starter) }); // Not in the room
      return { moved: await seen };
    });
    expect(result.moved).toBeUndefined();
  });

  test("chessdown: the creator's timer reaches the other player; bad settings fall back to 10 s", async ({ page }) => {
    const timers = await page.evaluate(async () => [
      (await T.chessdownRoom({ timerMode: 'overall', timerSeconds: 90 })).joined.roomState.timer,
      (await T.chessdownRoom({ timerMode: 'forever', timerSeconds: -5 })).joined.roomState.timer,
      (await T.chessdownRoom()).joined.roomState.timer,
    ]);
    expect(timers).toEqual([{ mode: 'overall', seconds: 90 }, { mode: 'turn', seconds: 10 }, { mode: 'turn', seconds: 10 }]);
  });

  // 1 s timer: coin flip (3 s) + 1 s + grace (1.5 s) before the server steps in.
  test('chessdown: a player who never gives up the turn loses it to the server clock', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom({ timerMode: 'turn', timerSeconds: 1 });
      const early = await T.once(g.waiter, 'turnSkipped', 3_000); // Not before the time is over
      const skipped = await T.once(g.waiter, 'turnSkipped', 4_000);
      return { early, skipped, starter: g.starter };
    });
    expect(result.early).toBeUndefined();
    expect(result.skipped).toEqual({ nextPlayer: 3 - result.starter });
  });

  test('chessdown: with an overall timer, the server declares the time out', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom({ timerMode: 'overall', timerSeconds: 1 });
      return { timeOut: await T.once(g.waiter, 'timeOut', 7_000), starter: g.starter };
    });
    expect(result.timeOut).toEqual({ loser: result.starter });
  });

  test('chessdown: invalid or impersonated drafts are rejected', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const p1 = await T.connect('/chessdown');
      const p2 = await T.connect('/chessdown');
      const code = await new Promise((r) => { p1.once('roomCreated', r); p1.emit('createRoom'); });
      const started = T.once(p1, 'gameStarted');
      p2.emit('joinRoom', code);
      await started;
      const ended = T.once(p1, 'draftPhaseEnded', 1500);
      const bad = [
        { player: 1, color: 'blue', pieces: [{ r: 11, c: 4, type: 'k' }, { r: 11, c: 5, type: 'k' }] }, // two kings
        { player: 1, color: 'blue', pieces: [{ r: 9, c: 0, type: 'r' }] }, // no king
        { player: 1, color: 'blue', pieces: [{ r: 11, c: 4, type: 'k' }, ...[0, 1, 2, 3, 4].map((c) => ({ r: 10, c, type: 'q' }))] }, // 45 > 39 points
        { player: 1, color: 'blue', pieces: [{ r: 0, c: 0, type: 'k' }] }, // outside P1 zone
        { player: 1, color: 'blue', pieces: [{ r: 11, c: 4, type: 'k' }, { r: 10, c: 0, type: 'x' }] }, // unknown piece
        { player: 1, color: '"><img>', pieces: [{ r: 11, c: 4, type: 'k' }] }, // unknown colour
      ];
      for (const d of bad) p1.emit('draftComplete', { roomCode: code, ...d });
      p2.emit('draftComplete', { roomCode: code, player: 1, color: 'red', pieces: [{ r: 11, c: 0, type: 'k' }] }); // P2 posing as P1
      p2.emit('draftComplete', { roomCode: code, player: 2, color: 'red', pieces: [{ r: 0, c: 3, type: 'k' }] }); // valid
      return { ended: await ended };
    });
    expect(result.ended).toBeUndefined(); // Player 1 never submitted a valid draft
  });

  test('chessdown: a turn can only be skipped by the player whose turn it is', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom();
      const early = T.once(g.p1, 'turnSkipped', 500);
      g.waiter.emit('skipTurn', { roomCode: g.code });
      const rejected = await early;
      const ok = T.once(g.p1, 'turnSkipped');
      g.mover.emit('skipTurn', { roomCode: g.code });
      return { rejected, skipped: await ok, starter: g.starter };
    });
    expect(result.rejected).toBeUndefined();
    expect(result.skipped).toMatchObject({ nextPlayer: 3 - result.starter });
  });

  test('chessdown: outsiders cannot close a room, one player cannot restart alone', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chessdownRoom();
      const intruder = await T.connect('/chessdown');
      const left = T.once(g.p1, 'opponentLeft', 500);
      intruder.emit('leaveRoom', { roomCode: g.code });
      const restarted = T.once(g.p1, 'gameRestarted', 500);
      g.p1.emit('playAgainRequest', { roomCode: g.code });
      g.p1.emit('playAgainRequest', { roomCode: g.code });
      return { left: await left, restarted: await restarted };
    });
    expect(result.left).toBeUndefined();
    expect(result.restarted).toBeUndefined();
  });

  // Ches'spell: the server referees with games/chesspell/game.js and sends each player
  // { state, action } after every accepted action.
  test("ches'spell: outsiders, the wrong turn, foreign cards and illegal moves are refused", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom();
      const intruder = await T.connect('/chesspell');
      const nothing = T.once(g.white, 'gameState', 600);
      intruder.emit('makeMove', { roomCode: g.code, from: { r: 6, c: 4 }, to: { r: 4, c: 4 } }); // Not in the room
      g.black.emit('makeMove', { roomCode: g.code, from: { r: 1, c: 4 }, to: { r: 3, c: 4 } }); // Not their turn
      g.white.emit('makeMove', { roomCode: g.code, from: { r: 6, c: 4 }, to: { r: 3, c: 4 } }); // Pawn cannot go 3 squares
      g.white.emit('spellActivated', { roomCode: g.code, cardId: 1 }); // In the opponent's deck
      intruder.emit('spellActivated', { roomCode: g.code, cardId: 8 });
      const refused = await nothing;

      const moved = T.once(g.black, 'gameState');
      g.white.emit('makeMove', { roomCode: g.code, from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
      return { refused, moved: await moved };
    });
    expect(result.refused).toBeUndefined();
    expect(result.moved.action).toMatchObject({ type: 'move', by: 'white', turnEnded: true });
    expect(result.moved.state.turn).toBe('black');
    expect(result.moved.state.board[4][4]).toBe('P');
  });

  test("ches'spell: a card is played once, and spell targets are checked", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom();
      const [cast] = await g.act(g.white, 'spellActivated', { cardId: 8 }); // Wall
      const targeting = cast.state.targetingState;
      const error = T.once(g.white, 'errorMsg', 600);
      const noState = T.once(g.black, 'gameState', 600);
      g.white.emit('spellSquareClicked', { roomCode: g.code, r: 6, c: 0 }); // Occupied: ignored
      g.black.emit('spellSquareClicked', { roomCode: g.code, r: 4, c: 0 }); // Not the caster
      const ignored = await noState;
      const [, { state: walled }] = await g.act(g.white, 'spellSquareClicked', { r: 4, c: 0 });
      // Black's turn now; white tries again later with the same card.
      await g.act(g.black, 'makeMove', { from: { r: 1, c: 0 }, to: { r: 2, c: 0 } });
      const again = T.once(g.black, 'gameState', 600);
      g.white.emit('spellActivated', { roomCode: g.code, cardId: 8 });
      return { targeting, ignored, error: await error, wall: walled.board[4][0], turn: walled.turn, used: walled.usedCards.white, again: await again };
    });
    expect(result.targeting).toBe('select_empty_square');
    expect(result.ignored).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.wall).toBe('W');
    expect(result.turn).toBe('black');
    expect(result.used).toEqual([8]);
    expect(result.again).toBeUndefined();
  });

  test("ches'spell: both players see a trap", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom();
      await g.act(g.white, 'spellActivated', { cardId: 16 });
      const [forWhite, forBlack] = await g.act(g.white, 'spellSquareClicked', { r: 4, c: 4 });
      return { white: forWhite.state.traps, black: forBlack.state.traps };
    });
    expect(result.white).toEqual([{ r: 4, c: 4, owner: 'white' }]);
    expect(result.black).toEqual([{ r: 4, c: 4, owner: 'white' }]);
  });

  test("ches'spell: Tornado is shuffled once, by the server, for both players", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom();
      await g.act(g.white, 'spellActivated', { cardId: 10 });
      const [forWhite, forBlack] = await g.act(g.white, 'spellSquareClicked', { r: 6, c: 3 }); // Around d2
      return { white: forWhite.state.board, black: forBlack.state.board, turn: forWhite.state.turn };
    });
    expect(result.white).toEqual(result.black);
    expect(result.turn).toBe('black');
  });

  // 1 s timer + grace (1.5 s) before the server steps in.
  test("ches'spell: the server skips the turn of a player out of time", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom({ timerMode: 'turn', timerSeconds: 1 });
      return T.once(g.black, 'gameState', 5_000);
    });
    expect(result.action).toMatchObject({ type: 'timeout', by: 'white', turnEnded: true });
    expect(result.state.turn).toBe('black');
  });

  // 6 turns of 1 s + grace (1.5 s) each: about 15 s.
  test("ches'spell: a game where nobody plays any more is closed", async ({ page }) => {
    test.setTimeout(40_000);
    const result = await page.evaluate(async () => {
      const g = await T.chesspellRoom({ timerMode: 'turn', timerSeconds: 1 });
      const closed = [T.once(g.white, 'roomClosed', 25_000), T.once(g.black, 'roomClosed', 25_000)];
      const reasons = await Promise.all(closed);
      // The room is gone: a move into it is not answered.
      g.white.emit('makeMove', { roomCode: g.code, from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
      return { reasons, after: await T.once(g.white, 'gameState', 1_000) };
    });
    expect(result.reasons).toEqual(['Game closed: nobody played for 6 turns.', 'Game closed: nobody played for 6 turns.']);
    expect(result.after).toBeUndefined();
  });

  test("ches'spell: decks are validated and profiles sanitized", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const p1 = await T.connect('/chesspell');
      const p2 = await T.connect('/chesspell');
      const badDeck = T.once(p1, 'errorMsg');
      p1.emit('createRoom', { deck: [1, 2, 3, 4], profile: null });
      const deckError = await badDeck;

      const evil = { id: 'x', name: '<img src=x onerror=alert(1)> and a very long name', avatar: 'javascript:alert(1)', stats: { played: '<b>', wins: -5 }, deck: [8, 12, 5], extra: 'drop me' };
      const code = await new Promise((r) => { p1.once('roomCreated', r); p1.emit('createRoom', { deck: [8, 12, 5], profile: evil }); });
      const started = T.once(p2, 'gameStarted');
      p2.emit('joinRoom', { roomCode: code, deck: [1, 15, 14], profile: null });
      return { deckError, profile: (await started).roomState.profiles[1] };
    });
    expect(result.deckError).toBeTruthy();
    expect(result.profile.name.length).toBeLessThanOrEqual(15);
    expect(result.profile.avatar).toBe('');
    expect(result.profile.stats).toEqual({ played: 0, wins: 0 });
    expect(result.profile).not.toHaveProperty('extra');
  });
});
