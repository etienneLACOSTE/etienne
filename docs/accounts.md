# Accounts on Pawnet

One account for the whole site (hub and both games): stats, decks and friends follow the
player on every device. Playing without an account stays possible everywhere.

## Choices made (owner, 2026-11-09)

- Database: PostgreSQL at **Neon** (project `etienne`, Frankfurt, `DATABASE_URL` in Render).
  Locally and in tests, an in-memory PGlite. Migrations: `server/db/migrations/NNN_*.sql`,
  applied at startup, never edited once applied.
- Sign-in: **password** (scrypt, OWASP cost) or **Google** (OpenID Connect, PKCE, state,
  nonce). GitHub dropped (too niche). Password reset by email needs a domain of our own
  (to be decided).
- Sessions: random token in an HttpOnly, SameSite=Lax cookie (`sid`, 30 days); only its
  SHA-256 is stored. Every change checks the Origin header (CSRF).
- Guests: every game stays playable without an account; the games invite players to
  create one ("keep your deck and stats on every device").
- Stats: every game counts. Online games are recorded by the server (reliable); games
  against the bot or on the same screen are sent by the browser and shown apart.
- Avatar on the account, now: a small image (150 px, 40 KB at most), checked on the
  server, shown to online opponents.
- After signing in: on to the games (or the `?next=` page), not the account page.

## Steps

1. **Foundations** (done): database, migrations, sessions, `/api/auth` (signup, login,
   logout, me), rate limit, CSRF check.
2. **Accounts** (done): `/account/` (sign in, create, account, data download, deletion),
   `/privacy/`, Google sign-in with a username chosen on first sign-in, top-bar button,
   "Play as a guest".
3. **The games on the account** (in progress: 3a, 3b and 3c done)
   - 3a. The game servers know the signed-in player (session cookie read at the Socket.io
     handshake); online, the name shown to the opponent is the account's, set by the
     server. Each game's menu shows who is signed in, or a sign-in button that comes
     back to the game.
   - 3b. Ches'spell: signed in, player 1 is the account, with its deck (saved on the
     account) and its avatar; guest profiles stay for player 2 on the same screen and
     for playing without an account. Invitation to create an account when signed out.
   - 3c. Stats and time played: a `game_results` table (game, mode, result, reason,
     duration, date). The account page shows, per game, games played, wins by mode,
     time played and the last 20 games. In the data download; deleted with the account;
     privacy notice updated.
   - 3d. Chessdown: account name online, stats as in 3c. Later: saved armies.
4. **Friends**: find a username, request / accept / remove / block, who is online,
   invite a friend straight into a game.
5. **Hardening**: limits on friend requests, end-to-end review (`/tribunal`).

## Where the code is

- `server/db/`: connection (`index.js`), migrations.
- `server/accounts/`: passwords, sessions, validation, rate limit, routes (`/api/auth`,
  `/api/account`), Google (`oauth.js`).
- `hub/account/`, `hub/privacy/`, `hub/js/session.js` (top-bar button), `hub/js/account.js`.
- `server/stats.js`: game results (online games written by `server/chesspell.js` and
  `server/chessdown.js`, bot and same-screen games sent by the page through
  `/api/account/results`, via `reportResult` in `assets/js/session.js`).
- Tests: `tests/unit/accounts.test.js`, `tests/unit/oauth.test.js`, `tests/unit/stats.test.js`,
  `tests/e2e/account.spec.js`, `tests/e2e/chesspell-account.spec.js`, `tests/e2e/stats.spec.js`.
