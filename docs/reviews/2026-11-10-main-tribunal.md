# Tribunal — main (accounts work, since 67a26a6) — 2026-11-10

> Hater → judge → verdict. Files: 35 (code only, tests excluded; 33 groups incl. integration). Accusations: 135. Confirmed weak: 75.

## ⚖️ Verdict — genuinely weak spots

The accounts, stats and friends work stands on sound choices (hashed session tokens, scrypt, PKCE, parameterised SQL, server-side validation, CSRF checks, broad tests), but the review confirms 75 weak spots, 3 of them critical. Systemic patterns:

1. **Tests run on PGlite, production on `pg`, and they differ.** `pg` returns `bigint` ids as strings, PGlite as numbers: in production, accepting a friend whose id has another number of digits fails (`CHECK user_a < user_b`), and live friend updates never fire. No test can see it.
2. **Async errors and early exits that can take the whole server down.** The presence connection handler awaits the database without a catch, the `pg` pool has no `error` listener, and `disconnect(true)` closes the game connection shared with presence. One Neon hiccup can end the process and every game in progress.
3. **Identity read once, never revoked.** Sign out, sign out everywhere and account deletion only touch the database: open tabs keep playing, inviting and showing as online.
4. **Trusting what the client or the network says.** The redirect after sign-in accepts `/%09/evil.com` (open redirect, client and server), the rate limit trusts a `CF-Connecting-IP` header anyone can send to `*.onrender.com`, linking Google relies on a hidden button, a malformed stored hash accepts any password.
5. **Online rules with holes.** Leaving a losing game cancels the loss, the same account can sit on both sides, page-reported bot/local wins appear in the totals opponents see, invitations join a new room without leaving the current game.
6. **Accessibility of the new dynamic parts.** Lists rebuilt on every presence event lose the keyboard focus, and invitations steal the focus in the middle of a game.

### Critical (3)

- **[critical] hub/js/account.js:nextPage() 14-17 (+ oauth.js safeNext same regex)** — Open redirect: the regex checks the raw second char but the URL parser strips tab/CR/LF first: ?next=/%09/evil.com -> '/\t/evil.com' passes and resolves to https://evil.com/ (verified with Node's URL). location.assign after sign-in and the guest link both use it; oauth.js safeNext copies the regex.
  _Fix:_ new URL(next, origin) and compare origins (or reject control characters and backslashes); share one helper with oauth.js.  
  _Judge:_ Confirmed: regex accepts '/\t/evil.com', new URL resolves it to https://evil.com/; same regex in oauth.js safeNext (Google redirect too).
- **[critical] server/friends.js:001_accounts.sql users.id bigint + db/index.js (no int8 parser) → friends.js pair()/areFriends/befriend/unfriend/block, sessions.userFor** — users.id is bigint: node-postgres returns it as a STRING, PGlite (tests) as a number. In production pair('9','10') compares strings, gets ['10','9'], the friendships INSERT breaks CHECK (user_a < user_b) -> accept fails with 500; areFriends/unfriend/block look up the reversed pair. Accounts whose ids differ in digit count cannot be friends; tests cannot see it.
  _Fix:_ pg.types.setTypeParser(20, Number) in openPostgres (or Number() at the boundary); a test with string ids 9 and 10.  
  _Judge:_ Confirmed: pg returns int8 as a string, no setTypeParser anywhere; pair('9','10') -> CHECK violation on accept (500); areFriends/unfriend/block miss; tests (PGlite numbers) hide it.
- **[critical] server/presence.js:ns.on('connection', async …) lines 64-99** — Async connection handler passed to ns.on awaits announce() and onlineFriends() (DB) without try/catch; a DB failure becomes an unhandled rejection, which kills the Node process (all games drop).
  _Fix:_ try/catch around the awaited presence I/O (or a safe wrapper).  
  _Judge:_ Confirmed: Node >=24 kills the process on an unhandled rejection; no handler installed; the connection handler is the one unguarded path.

### Major (44)

- **[major] assets/js/presence.js:inviteFriend 53-59 + showInviteList click** — Answer matched with socket.once('inviteResult') on a shared event, no correlation, no timeout: two quick invites get each other's answers; when the server drops the message (rate limit in safeOn, handler error) or the socket is down, the promise never settles: button disabled forever, listener leaks.
  _Fix:_ Socket.io acknowledgements with timeout (socket.timeout(5000).emit(..., ack)).  
  _Judge:_ Partly overstated, but a throwing server handler sends no answer: promise never settles, button stays disabled, a leftover once listener takes the next answer; acks with timeout fix it.
- **[major] assets/js/presence.js:showInvitation 64, 91-92 (+ onJoin wiring)** — Unsolicited invitation steals focus (join.focus()) even mid-game: the next Space/Enter meant for the board accepts it, and onJoin may location.assign away from the game in progress; any friend can steal focus 10 times a minute; dismissing drops focus to body; no Escape on role=alertdialog.
  _Fix:_ Don't move focus for unsolicited notices (live region), restore focus, Escape to dismiss, confirm before leaving a game in progress.  
  _Judge:_ No game-in-progress check: Space/Enter meant for the board can accept and leave a live game; no Escape, no focus return: misses WCAG goal.
- **[major] assets/js/session.js:top-level block 89-94 + showUserInTopbar 57-62** — Presence socket started as an import-time side effect, never stopped: sign out, sign out everywhere and deletion only repaint the button; friends still see the player online and the page keeps receiving invitations. Server does not disconnect presence sockets on logout.
  _Fix:_ Own the signed-in transition: stopPresence() on sign-out/deletion, or the server disconnects the user's presence sockets.  
  _Judge:_ Sign-out/delete only repaint; the presence socket stays connected and identified: friends see a signed-out or deleted account online; tabs keep receiving invitations.
- **[major] games/chessdown/js/gameplay.js:endGame 272-283 local branch** — Same-screen game credited as win/loss by hard-coding player 1 = the account; nothing says which seat the account took; one person can play both sides and farm wins (60/hour).
  _Fix:_ Record local games neutrally (not in win/loss totals) or ask which side the player took.  
  _Judge:_ Self-reporting accepted, player 1 = account is the obvious default; but local farming leaks into the totals opponents see (stats totals c1); hot-seat win/loss means little.
- **[major] games/chessdown/js/invites.js:setupInvites onJoin line 19 + joinFromInvite** — Guard only checks gameState !== 'gameplay', ignores currentRoomCode: waiting in own room, online draft or victory screen -> joins a second room without leaving the first (server keeps the socket in both, gameStarted re-runs for the wrong room); during gameplay the fallback location.assign reloads and kills the live online game, no confirmation.
  _Fix:_ Decide from currentRoomCode; confirm, run the leave teardown, then join; never reload to join Chessdown.  
  _Judge:_ Real: draft/over/waiting states slip through; server joinRoom never leaves the old room: two rooms, orphaned first room; during gameplay location.assign kills a live match without confirmation.
- **[major] games/chessdown/js/main.js:init() currentUser().then block** — ?join=CODE never removed from the URL: reload/back/reopen joins the (now stale) room again every visit.
  _Fix:_ history.replaceState after reading.  
  _Judge:_ Correct: ?join read and never removed; reload re-joins a stale (or reused) room.
- **[major] games/chesspell/js/deck-builder.js:openDeckBuilder / showAccountInvite 32-39, 66-69** — Snapshot of async state: opened before loadAccount finishes (or if it failed), no '(you)' entry, guest deck preselected, and the 'Sign in' invitation is shown to a signed-in player; never refreshed on profilesChanged.
  _Fix:_ Refresh on profilesChanged while shown; base the invite on the session, not on ProfileManager.account.  
  _Judge:_ Narrow race, but if loadAccount fails a signed-in player is told to sign in; deck builder not redrawn on profilesChanged.
- **[major] games/chesspell/js/deck-builder.js:saveDeckForProfile 53-64 + ProfileManager.saveDeck** — Live mutable builder.cards Set passed to an awaited save and read twice: toggling a card mid-request makes the local deck differ from the server's; no guard against double click; switching profile mid-save shows the wrong message.
  _Fix:_ Snapshot cards and id; disable Save during the request; only message if the profile is still selected.  
  _Judge:_ saveDeck reads the live Set after the await: a toggle mid-request makes local and server decks differ.
- **[major] games/chesspell/js/invites.js:setupInvites line 16 + online.js joinFromInvite** — Joins in place whatever the player is doing: no leaveGame (timer keeps running, online game abandoned without leaveRoom, own waiting room orphaned until idle timeout).
  _Fix:_ Tear down current activity (leaveGame) first; confirm or refuse during a game.  
  _Judge:_ Valid: joinFromInvite never leaves the current game (timer runs, room not left); Chessdown at least guards gameplay.
- **[major] games/chesspell/js/online.js:joinFromInvite 138-149 + btn-join-room handler** — Accepting an invitation during a game or while waiting in one's own room never leaves the current room (no leaveRoom), never stops the timer, never resets isOnline; the server joinRoom does not check the socket's other rooms: ghost room, abandoned opponent, background timer can still fire endGame.
  _Fix:_ Leave whatever is in progress with leaveGame() first (confirm if a game is under way), then join.  
  _Judge:_ Confirmed: accepting during a game or from one's waiting room never leaves/stops anything; server accepts a second room: ghost room, abandoned opponent, running timer.
- **[major] games/chesspell/js/profiles.js:ProfileManager.loadAccount 45-61 (+ main.js caller)** — Promise.all ties account, deck and stats: a stats failure (or payload shape change) means no account profile at all; the caller swallows it: the player silently becomes a guest, their server deck disappears, new decks go to a local guest.
  _Fix:_ Stats optional (allSettled / fallback), defensive reads, surface the failure.  
  _Judge:_ Guest fallback deliberate, but tying the account and its server deck to the stats call means a stats failure silently drops the deck and account profile; stats should be optional.
- **[major] hub/js/account.js:logout-all and logout handlers 275-288** — Failures swallowed (.catch(() => {})) then the page shows signed out anyway: a 'sign out everywhere' that failed gives a false security confirmation.
  _Fix:_ Switch view only on success; show the error otherwise; busy button.  
  _Judge:_ Acceptable for single logout, but swallowing failure of 'sign out everywhere' gives false reassurance on a security action.
- **[major] hub/js/account.js:delete-form / logout handlers vs presence socket** — Sign out or account deletion only repaints the DOM: the /presence socket stays connected (identity checked at connect), the tab still shows the player online and receives invitations until reload.
  _Fix:_ stopPresence() in a shared signedOut() helper, or reload the page after success.  
  _Judge:_ Presence socket never stopped on logout/logout-all/delete: tab stays online and receives invitations.
- **[major] hub/js/friends.js:action() 31-44 + draw() 78-104 + onFriendsOnline 72-75** — Double-request guard is button.disabled, but presence events redraw the card (replaceChildren) with fresh enabled buttons while the request is in flight: the action can be fired twice; the second fails and shows an error although the first worked.
  _Fix:_ Track pending actions by key outside the DOM, or update only presence spans on presence events.  
  _Judge:_ Real: presence redraws give fresh enabled buttons mid-request; second click shows a false error.
- **[major] hub/js/friends.js:action()/draw() replaceChildren** — Every action rebuilds the list holding the focused button: focus falls to body for keyboard users (also on random presence redraws); successes are never announced to screen readers. WCAG 2.2 AA target.
  _Fix:_ Restore focus predictably after redraw; announce the result in the status region.  
  _Judge:_ Focus lost to body after actions and on presence events; successes not announced: WCAG gap.
- **[major] server/presence.js:friends.js onChange([me.id, them.id]) (strings from pg) → presence.js friendsChanged online.has(id) (Map keyed by Number)** — Presence keys online by Number(user.id) but friendsRouter passes pg string ids: online.has('5') is always false, live friend-list updates never reach anyone in production.
  _Fix:_ Numbers in one place (DB layer), or map(Number) in friendsChanged.  
  _Judge:_ Confirmed: friendsChanged gets string ids, online Map is keyed by Number: live friends-panel updates never fire in production.
- **[major] server/accounts/account-routes.js:DELETE / and logout-all → presence online map / identifyPlayers / game rooms** — Deleting an account or signing out everywhere only touches the DB: live sockets keep socket.data.user (still online for friends; on disconnect announce() finds no friends, so they appear online until friends reload); rooms keep the account and recordOnline later inserts a row for a deleted user (FK error); open tabs keep playing/inviting as the account after logout-all.
  _Fix:_ Hook from index.js: on delete/logout-all disconnect the user's sockets and notify friends first.  
  _Judge:_ FK failure caught and logged; but logout-all/delete leave open sockets playing and inviting as the account, deleted user still online to friends; unrecorded gap.
- **[major] server/chessdown.js:chessdown gameplay.js startTurn repetition draw (also online) → server chessdown.js timeUp/recordResult** — Online repetition draw only exists in the browser: server room stays 'playing', the overall clock runs and timeUp() later records a 'time' win and loss for a game both clients showed as a draw.
  _Fix:_ Detect repetition on the server with engine.js, recordResult(room, 0, 'repetition'), emit the result.  
  _Judge:_ Known limit (online repetition draw not counted), but the doc understates it: the room stays 'playing' and in overall mode timeUp records a time win/loss.
- **[major] server/presence.js:socket-utils identifyPlayers promise vs presence.js async connection handler** — Socket helpers promise a DB failure is harmless, but the presence connection handler awaits DB calls without catch: unhandled rejection ends the process; disconnect listener attached after the awaits.
  _Fix:_ Register listeners first, try/catch the async part.  
  _Judge:_ Confirmed (same as presence c1/c2): unguarded async connection handler can end the process; late disconnect listener leaves ghosts.
- **[major] server/accounts/account-routes.js:DECK_CHECKS lookup, GET/PUT /decks/:game** — Plain object indexed by a URL param: /decks/constructor makes check = Object, which returns the body unchanged, so unvalidated JSON is stored under game='constructor' (also /decks/toString). No CHECK on the game column.
  _Fix:_ Use a Map or Object.hasOwn guard; only declared games reach the database.  
  _Judge:_ Right: /decks/constructor and /decks/toString skip sanitizeDeck and store rows; limited to own rows but breaks the whitelist; Object.hasOwn fixes it.
- **[major] server/accounts/account-routes.js:DELETE /providers/:provider 145-154** — Read-then-write without transaction: two concurrent unlinks on a passwordless account can both pass and lock it out; counts identity rows, so two rows of the same provider pass the check and the DELETE removes both.
  _Fix:_ One conditional DELETE (password exists OR another provider remains), 400 when rowCount is 0.  
  _Judge:_ Race moot (Google only), but a second Google account can be linked (no UNIQUE(user_id, provider)); unlink then deletes both rows: lockout.
- **[major] server/accounts/avatar.js:avatarProblem lines 6-7, 18 vs server/chesspell.js 21-22** — Avatar check duplicated: DATA_URL repeats chesspell.js AVATAR_RE and 40_000 repeats AVATAR_MAX; the two validators already disagree (the guest socket path only runs the regex, no canonical base64 or signature check), so pictures shown to other players can pass the weaker check; limits will drift.
  _Fix:_ Export one isValidAvatar + MAX_DATA_URL_LENGTH from avatar.js and use it in chesspell.js too.  
  _Judge:_ Different purposes (guest socket path vs stored account picture), both inert in <img>; but regex and limit are copied and will drift.
- **[major] server/accounts/avatar.js:SIGNATURES + avatarProblem 10-14, 25** — Only magic bytes checked: a 28 KB PNG declaring 30000x30000 (or a JPEG SOF 65500x65500) passes, is stored and decoded by every friend/opponent's browser: a decompression bomb aimed at other users.
  _Fix:_ Read declared dimensions (PNG IHDR, WebP VP8*, JPEG SOFn) and reject above ~512x512.  
  _Judge:_ Re-encoding is an accepted limit, but reading declared dimensions is cheap, dependency-free, and stops an oversized image aimed at other players.
- **[major] server/accounts/oauth.js:callback link branch 147-152** — Link only checks whether this Google subject belongs to someone else, not whether the user already has a google identity (no UNIQUE(user_id, provider)); a second Google account can be linked; then unlink sees ['google','google'], passes the 'last way' guard and the DELETE removes both rows: Google-only account locked out.
  _Fix:_ Refuse linking when the user already has that provider; CREATE UNIQUE INDEX ON identities (user_id, provider).  
  _Judge:_ Confirmed: UI hides the link button but the server trusts it; a hand-typed ?link=1 links a second Google account; unlink then removes both: Google-only account locked out.
- **[major] server/accounts/passwords.js:verifyPassword 44-50** — Only checks 6 fields and 'scrypt'; keylen from expected.length: an empty hash field gives 0-byte key and timingSafeEqual(empty, empty) = true. verifyPassword('whatever','scrypt$16384$8$1$AAAA$') returns true: a truncated/corrupted row means any password works (fails open).
  _Fix:_ Require expected.length === KEY_LENGTH, salt length, sane N/r/p; else dummy path -> false.  
  _Judge:_ Confirmed: verifyPassword('whatever','scrypt$16384$8$1$AAAA$') is true; needs a corrupted row, but an auth check must not fail open; one-line length check.
- **[major] server/accounts/rate-limit.js:rateLimit line 22 key = addressFrom (cf-connecting-ip trusted unconditionally)** — Key comes from the CF-Connecting-IP header, trusted whenever present; the Render origin (*.onrender.com) is reachable directly, so an attacker sends a random CF-Connecting-IP on each request and gets a fresh bucket: limits on login/signup/etc. do nothing.
  _Fix:_ Trust the header only from Cloudflare IP ranges (or a shared-secret origin header); otherwise use the TCP peer.  
  _Judge:_ Header trusted on the premise that only Cloudflare reaches the origin, but *.onrender.com answers directly: per-address limits on signup, friends, results, deletion are bypassable.
- **[major] server/accounts/rate-limit.js:rateLimit line 22 full address string** — IPv6 clients rotate addresses within their /64 for free: each is a new bucket, bypassing signup/friend/results/deletion limits.
  _Fix:_ Normalise ::ffff: IPv4 and truncate IPv6 to /64.  
  _Judge:_ Full IPv6 address as key is a well-known gap (rotate within /64); not considered in the docs.
- **[major] server/accounts/routes.js:POST /login 104-112** — Per-account failure cap is check-then-act: tooManyFailures before await verifyPassword, recordFailure after; concurrent requests all pass the check before any failure is counted, so the cap is not enforced under concurrency.
  _Fix:_ Reserve the attempt synchronously before the await (increment pending count), clear on success.  
  _Judge:_ Correct: concurrent attempts all pass the check before failures are counted; bursts from N addresses get ~10N guesses; count before the await, refund on success.
- **[major] server/accounts/routes.js:failures map + POST /login** — Anyone can lock any account out for 15 minutes, repeatedly, with 10 wrong passwords from one address (usernames are public); the message suggests Google but password accounts have no Google link.
  _Fix:_ Count per (account, address); use the global per-account count only for delay/challenge, or exempt known-device cookies.  
  _Judge:_ Per-account lock is a documented, accepted trade-off; but 'or sign in with Google' is misleading for password-only accounts (no automatic Google link).
- **[major] server/accounts/validate.js:emailProblem / EMAIL regex** — [^\s@] accepts control characters incl. NUL and bidi/zero-width; a NUL passes validation, Postgres rejects 0x00 (22021) -> unhandled 500; invisible chars stored and displayed.
  _Fix:_ Reject \p{Cc}\p{Cf} with the u flag.  
  _Judge:_ Loose on purpose; NUL gives a handled 500 (also via login); still, rejecting \p{Cc}\p{Cf} is one line and keeps bidi/zero-width out.
- **[major] server/chessdown.js:leaveRoom 266-273 / disconnect 285-292 vs recordResult 83-90** — Results only recorded on board endings; a losing player can leave or disconnect and the loss never reaches game_results (opponent gets no win). Stats can be dodged.
  _Fix:_ On leave/disconnect during 'playing', recordResult(room, other, 'forfeit') before closeRoom, gameState='over' first.  
  _Judge:_ Documented limit with a planned grace-period forfeit; instant forfeit would punish honest disconnects. Gap still real.
- **[major] server/chessdown.js:joinRoom 156-173 + recordResult** — A signed-in user can join their own room as a guest (private window) and lose on purpose to farm 'win against Player 2', or from two tabs of the same account (+1 win +1 loss). Nothing compares accounts.
  _Fix:_ Refuse a second seat by the same account; decide whether games against guests count (e.g. only when both are signed in).  
  _Judge:_ Personal stats only, no ranking; but online results were meant to be trustworthy and same-account seats are not blocked (one comparison); guest-alt farming should at least be documented.
- **[major] server/chesspell.js:recordResult 83-93 via sendState; leaveRoom/disconnect handlers** — A result is recorded only when the board gives a winner: a losing signed-in player can leave or disconnect and the loss vanishes (and the opponent gets no win), undoing 'server-set stats that cannot be faked'.
  _Fix:_ On leave/disconnect/idle close during 'playing', record a loss for the leaver and a win for the other (reason 'abandon'), gameState='over' first.  
  _Judge:_ Documented known limit; a forfeit needs a reconnection grace period (mobile drops, Render restarts). Still, rage-quitting dodges a loss today.
- **[major] server/db/index.js:openPostgres l.21 new Pool, no pool.on('error')** — No 'error' listener on the pg Pool: when Neon drops an idle connection (normal: PgBouncer, scale-to-zero), the Pool emits 'error' and the process crashes, taking every game down.
  _Fix:_ pool.on('error', err => console.error(...)).  
  _Judge:_ Confirmed in pg-pool: an idle client error is emitted on the Pool; no listener -> process crash; Neon suspends/blips happen.
- **[major] server/db/index.js:openPostgres.transaction l.31-36** — ROLLBACK unprotected: on a broken connection its error replaces the real cause, and client.release() returns a broken/aborted client to the pool.
  _Fix:_ try ROLLBACK, on failure release(err) to destroy the client; always rethrow the original error.  
  _Judge:_ pg-pool already drops dead clients; remaining: a failing ROLLBACK masks the original error.
- **[major] server/db/migrate.js:migrate() 20-21 split(/;\s*$/m)** — SQL split by regex on line-ending ';': breaks inside comments, multi-line strings and $$ bodies (any future trigger/DO block); failed boot with a fragment error.
  _Fix:_ Add Db.exec(sql) (PGlite exec / pg simple query) and run the whole file.  
  _Judge:_ Simplicity choice and failures are loud, but the ';' constraint is undocumented and a whole-file exec removes the trap at near-zero cost.
- **[major] server/friends.js:friendStore.request 83-93 + POST /requests** — Blocked sender gets status 'sent' but no row is stored, so the request is missing from their own outgoing list: a reliable block detector, the 'silent' promise fails.
  _Fix:_ Store the request (shown to sender as pending) and hide it from the blocker's incoming, or return a neutral answer.  
  _Judge:_ The silent block leaks: 'sent' but nothing in the sender's outgoing list; contradicts the stated intent; not an accepted limit.
- **[major] server/friends.js:accept route + auto-befriend path** — MAX_FRIENDS only checked on the sender's own count and only when sending; accept and the auto-befriend path never check, so caps can be exceeded; counts read outside a transaction.
  _Fix:_ Enforce both players' caps where the friendship is created (inside befriend's transaction), on accept too.  
  _Judge:_ Cap only checked on the sender at send time; accepting incoming requests exceeds MAX_FRIENDS without limit, defeating the fan-out bound.
- **[major] server/friends.js:DELETE /requests/:u, POST /blocks, DELETE /:u** — Only POST /requests is rate-limited; other mutations always call onChange([me, them]) which makes presence query the victim's friends (1+N queries) and push a socket event, even on no-op deletes: unthrottled spam/load on a victim; also fast username-existence probing.
  _Fix:_ Rate limit the whole router per user; call onChange only when rows actually changed.  
  _Judge:_ No rate limit on other routes: loops of DELETE/blocks spam the victim's presence (1+N queries each), unlimited username enumeration (against the stated intent), Neon cost.
- **[major] server/presence.js:connection handler lines 72-75 vs 78 and 99** — online map updated before two awaits, but 'disconnect' and 'invite' listeners are attached after them: a client leaving during the DB round-trip leaves a stale online entry forever (looks online, map grows); invites in that window dropped.
  _Fix:_ Register disconnect/invite synchronously right after updating online, then do the awaited work.  
  _Judge:_ Correct: listeners attached after the awaits; a client leaving in that window leaves a permanent online entry.
- **[major] server/presence.js:announce() lines 39-44** — where is computed before awaiting friendIds and emitted after; concurrent disconnect/connect announces can arrive out of order, so friends see the player offline while online.
  _Fix:_ Compute whereIs at emit time (after the await), or serialize announces per user.  
  _Judge:_ Real but rare and cosmetic; trivial fix: compute whereIs after the await.
- **[major] server/presence.js:connection handler line 66 socket.disconnect(true)** — disconnect(true) closes the whole shared Engine.IO connection, including the game namespace: a player whose session expired (or DB error -> guest) gets their game connection killed.
  _Fix:_ socket.disconnect() (namespace only), or reject in namespace middleware with next(new Error()).  
  _Judge:_ Checked socket.io: disconnect(true) closes the whole shared Engine.IO connection, cutting a live game when presence refuses a downgraded user; repeats on reconnect.
- **[major] server/socket-utils.js:identifyPlayers 67-79 with limitConnections 109-122** — New async DB await in the middleware chain after limitConnections: if the client hangs up during the await, socket.io 4.8.4 cleans up without emitting 'disconnect' (namespace.js 223-226), so the per-IP counter never decrements; 20 such handshakes lock an address out until restart (whole site if the IP header is misconfigured). No timeout on the DB lookups.
  _Fix:_ Decrement on socket.conn close (once) or count in 'connection'; time-box DB lookups (~2 s) falling back to guest; test it.  
  _Judge:_ Verified in socket.io 4.8.4: a client closing during the async middleware is cleaned up without 'disconnect', so the per-IP counter leaks until restart; the window now lasts a Neon query (seconds on cold start), no timeout.
- **[major] server/stats.js:resultProblem 20-29 + totals 58-68** — Public totals (shown to online opponents) count all modes, including bot/local results the page self-reports: anyone can POST 60 fake 'local' wins an hour and inflate the record opponents see; local win/loss is meaningless anyway.
  _Fix:_ Public totals from mode='online' only; keep bot/local for the private account page.  
  _Judge:_ Deliberate to count all modes, but the accepted limit says page-reported results stay in the player's own stats, shown apart; totals() shows them to opponents: filter on mode='online'.

### Minor (28)

- **[minor] assets/js/presence.js:showInviteList draw 103-126** — Every presence event rebuilds the invite list: focused button destroyed (focus to body), detached button re-enabled, fresh button clickable again (feeds c1).
  _Fix:_ Keyed diff or restore focus; pending state in a Set.  
  _Judge:_ Simple full redraw; rare events; but keyboard focus is lost when a friend's presence changes.
- **[minor] games/chessdown/js/invites.js:joinFromInvite 10-13** — Join through the DOM: writes the visible input and fires a fake pointerdown; breaks silently if the handler changes; re-runs enterFullscreen without user activation.
  _Fix:_ Exported joinRoom(code) used by the button and invitations.  
  _Judge:_ Reuses the one join path; fullscreen point mostly off-base; but a synthetic PointerEvent on an element id is fragile.
- **[minor] games/chessdown/js/invites.js:?join flow** — ?join=CODE never removed: reload replays a stale join with alerts.
  _Fix:_ history.replaceState after reading.  
  _Judge:_ ?join never cleared: reload/back re-join with alerts.
- **[minor] games/chesspell/js/deck-builder.js:saveDeckForProfile catch 61-63** — err.message shown as is: network errors show 'Failed to fetch' in the status.
  _Fix:_ Fixed fallback message for non-API errors.  
  _Judge:_ fetch TypeError ('Failed to fetch') shown raw; minor inconsistency.
- **[minor] games/chesspell/js/main.js:currentUser().then lines 98-102** — setupInvites is called before loadAccount resolves: clicking Join early uses a guest profile and shows a misleading 'build your deck' error; same on a swallowed load failure.
  _Fix:_ setupInvites(code => account.then(() => joinFromInvite(code))); report load failures.  
  _Judge:_ Invitation callback doesn't wait for the account load (the ?join path does): misleading 'build your deck' alert.
- **[minor] games/chesspell/js/main.js:?join=CODE handling 100-102** — join param never removed: reload replays a stale invitation; a signed-out visitor with the link is dropped silently.
  _Fix:_ history.replaceState after reading; for guests keep the code / say sign in.  
  _Judge:_ ?join never cleared: reload replays a stale code with an alert.
- **[minor] games/chesspell/js/state.js:session.account** — session.account written once, never read; duplicates ProfileManager.account and can disagree.
  _Fix:_ Drop it or make it the single source.  
  _Judge:_ session.account written, never read: dead duplicate state.
- **[minor] games/chesspell/js/match.js:recordAccountResult 111-127** — Win/played bookkeeping duplicated from ProfileManager.recordResult; match.js reaches into the data layer.
  _Fix:_ One ProfileManager method owns profile stats.  
  _Judge:_ Paths differ (localStorage vs server), but match.js mutating ProfileManager.account.stats breaks the 'data only' role: an accountPlayed(won) method would be cleaner.
- **[minor] games/chesspell/js/online.js:joinFromInvite 141-148** — Join driven through the DOM: writes select.value, third copy of the deck check with a third message, synthetic click (no-op if the listener was not attached), overwrites the player's chosen profile.
  _Fix:_ Exported joinRoom(profile, code) used by the button and the invite.  
  _Judge:_ Single join path is a simple choice, but synthetic click + duplicated validation is fragile; an exported joinRoom would be cleaner.
- **[minor] games/chesspell/js/profiles.js:loadAccount stats snapshot / recordResult** — Account stats are a one-time snapshot, updated by ad-hoc increments in match.js that skip online games: stale after online games until reload.
  _Fix:_ refreshAccountStats() re-fetching after any finished game.  
  _Judge:_ Intentional, but the account's own totals go stale after online games and this isn't listed.
- **[minor] hub/js/account.js:shrinkPicture() 79-98** — Transparent PNG/WebP exported as JPEG turns transparent areas black; no file size check before reading (50 MB photo read twice into memory).
  _Fix:_ Fill the canvas with a background colour first (or keep alpha); reject files over ~10 MB.  
  _Judge:_ JPEG deliberate; transparent areas turn black: one-line fill; cosmetic.
- **[minor] hub/js/account.js:Unlink handler 176-181** — Button not disabled: double-click sends two DELETEs, second shows a spurious error; a failed refresh after it is an unhandled rejection.
  _Fix:_ Disable, try/catch, single outcome.  
  _Judge:_ Rare, server authoritative, but inconsistent with the busy-button pattern.
- **[minor] hub/js/friends.js:action()/showMessage** — Old messages stay up after later unrelated actions (stale error in role=alert).
  _Fix:_ Clear messages at the start of each action/submit.  
  _Judge:_ An earlier error stays visible after a successful action: minor, easy.
- **[minor] hub/js/friends.js:showFriends refresh failures** — Load failures swallowed: a failed first load shows 'No friends yet' (wrong); failed refreshes keep stale buttons, no error.
  _Fix:_ Show a load error; hide the empty text until the first successful load.  
  _Judge:_ A failed first load says 'No friends yet', which is false.
- **[minor] server/accounts/account-routes.js:DELETE / account deletion rate limit** — Password re-check throttled only per IP: a stolen session cookie lets an attacker guess from rotating IPs; successful/400 attempts use the same budget.
  _Fix:_ Also limit failed password checks per account.  
  _Judge:_ With a stolen cookie the deletion endpoint is a password-guessing oracle per IP only, bypassing the per-account lock adopted for sign-in.
- **[minor] server/accounts/oauth.js:start and callback error paths** — Navigation routes: discovery, DB queries, session creation not wrapped; failures end on a bare JSON 500 page mid-sign-in.
  _Fix:_ Wrap handler bodies; any error -> back(res, {error:'failed'}).  
  _Judge:_ Token exchange failure is handled; others mean a Google/Neon outage and give a clean 500, but a raw JSON page mid-navigation; a try/catch to back(failed) is cheap.
- **[minor] server/accounts/oauth.js:callback 128-130, 155, 165** — flow.next validated when written to the unsigned cookie but trusted when read back: a planted cookie makes an open redirect after sign-in.
  _Fix:_ Re-run safeNext(flow.next) on read.  
  _Judge:_ Cookie planting is hard (HttpOnly, path, HTTPS, no third-party subdomain), but the client re-validates next and the server does not: one safeNext() call as defense in depth.
- **[minor] server/accounts/sessions.js:COOKIE line 6 / cookieOptions 13-21** — Plain 'sid' cookie without __Host- prefix: on a custom domain a sibling subdomain can toss a Domain= sid cookie (session fixation); readCookie takes the first sid.
  _Fix:_ Name it __Host-sid in production (Secure, Path=/, no Domain already met).  
  _Judge:_ Not exploitable on onrender.com (public suffix), but a custom domain is planned: naming the cookie __Host-sid in production is one line and closes it.
- **[minor] server/accounts/validate.js:exports PASSWORD_MAX / literals** — PASSWORD_MIN/MAX exported but login and deletion hard-code 128 and 254 again; will drift.
  _Fix:_ Use the constants (and EMAIL_MAX) everywhere.  
  _Judge:_ Accurate: 254/128 hard-coded in routes.js and account-routes.js; can drift.
- **[minor] server/accounts/validate.js:passwordProblem 24-29** — length counts UTF-16 units; no Unicode normalisation (NFD vs NFC devices -> lockouts); trivial passwords (10 spaces, repeated char, equal to username/email) accepted.
  _Fix:_ Normalise NFKC in a shared helper, count code points, reject trivial ones.  
  _Judge:_ Length bounds fine; trivial passwords (repeated char, username) accepted: minor gap.
- **[minor] server/chesspell.js:joinRoom 181-189 + recordResult** — Self-join check compares sockets, not accounts: the same account in two tabs plays both sides and recordOnline writes a win and a loss for the same user, inflating played/wins.
  _Fix:_ Refuse joining your own room by account id, or skip recording when both accounts are the same.  
  _Judge:_ Small gain (win+loss each game), second accounts possible anyway; but a one-line account check at join closes the cheapest route.
- **[minor] server/db/index.js:openPostgres l.21 Pool options** — No connectionTimeoutMillis (default wait forever): Neon waking or pool exhausted makes requests, socket handlers and startup hang silently.
  _Fix:_ connectionTimeoutMillis 10 s, idleTimeoutMillis 30 s, maybe statement_timeout.  
  _Judge:_ idleTimeout already 10 s by default, but connectionTimeoutMillis defaults to 0 (wait forever): stalls hang requests silently.
- **[minor] server/friends.js:accept route vs befriend** — Accept checks the request with a raw query then calls befriend in a separate transaction: a cancel or block in between still yields a friendship; duplicates store SQL.
  _Fix:_ store.accept(): DELETE ... RETURNING inside the transaction, insert the friendship only if a row came back.  
  _Judge:_ Tiny window, mostly harmless, but DELETE ... RETURNING inside the transaction closes it simply.
- **[minor] server/index.js:start() lines 54, 56-59** — Background DB calls end in .catch(() => {}): cleanup and friendsChanged failures are never logged.
  _Fix:_ .catch(err => console.error(...)).  
  _Judge:_ Catching is right, swallowing without a log is not: DB failures become invisible.
- **[minor] server/index.js:start() hourly setInterval** — Cleanup runs only after an hour of uptime, never at boot; the free Render instance sleeps after 15 min, so it rarely runs.
  _Fix:_ Run cleanup once at start, then on the interval.  
  _Judge:_ Expiry enforced at read time, so no security effect; but on a sleeping free instance the hourly cleanup almost never runs: run it once at boot.
- **[minor] server/socket-utils.js:identifyPlayers line 75 catch** — All failures swallowed silently (DB outage turns everyone into guests with no log); a stats failure throws away a valid user.
  _Fix:_ Log; userFor failure -> guest, totals failure -> keep user, stats null.  
  _Judge:_ Guest fallback deliberate and right, but no log at all and a stats failure discards a valid identity: cheap to fix.
- **[minor] server/socket-utils.js:safeOn 147-150** — ignored() reads err.message blindly: an async handler rejecting with null/undefined makes ignored throw inside .catch -> unhandled rejection -> process crash. Also logs server failures as 'malformed message'.
  _Fix:_ err instanceof Error ? err.message : err; neutral wording.  
  _Judge:_ Theoretical (project code throws Errors), but a crash guard should be robust: err?.message ?? err; wording mislabels DB failures.
- **[minor] server/stats.js:recordOnline 50-55** — No check that the two seats are different accounts: self-play in two tabs writes a refereed win and loss for the same user.
  _Fix:_ Skip when both seats hold the same account; refuse it at join.  
  _Judge:_ Same account in both seats (two tabs) gets refereed win+loss: inflates played/time shown to opponents; trivial check.

## 📜 Full transcript (hate + defense per file)

### assets/js/presence.js
- **[major] inviteFriend 53-59 + showInviteList click**
  - 🔥 Hater: Answer matched with socket.once('inviteResult') on a shared event, no correlation, no timeout: two quick invites get each other's answers; when the server drops the message (rate limit in safeOn, handler error) or the socket is down, the promise never settles: button disabled forever, listener leaks.
  - 💡 Should have been: Socket.io acknowledgements with timeout (socket.timeout(5000).emit(..., ack)).
  - ⚖️ Judge (❌ not defended — conceded weak): Partly overstated, but a throwing server handler sends no answer: promise never settles, button stays disabled, a leftover once listener takes the next answer; acks with timeout fix it.
- **[major] showInvitation 64, 91-92 (+ onJoin wiring)**
  - 🔥 Hater: Unsolicited invitation steals focus (join.focus()) even mid-game: the next Space/Enter meant for the board accepts it, and onJoin may location.assign away from the game in progress; any friend can steal focus 10 times a minute; dismissing drops focus to body; no Escape on role=alertdialog.
  - 💡 Should have been: Don't move focus for unsolicited notices (live region), restore focus, Escape to dismiss, confirm before leaving a game in progress.
  - ⚖️ Judge (❌ not defended — conceded weak): No game-in-progress check: Space/Enter meant for the board can accept and leave a live game; no Escape, no focus return: misses WCAG goal.
- **[minor] showInviteList draw 103-126**
  - 🔥 Hater: Every presence event rebuilds the invite list: focused button destroyed (focus to body), detached button re-enabled, fresh button clickable again (feeds c1).
  - 💡 Should have been: Keyed diff or restore focus; pending state in a Set.
  - ⚖️ Judge (✅ defended — conceded weak): Simple full redraw; rare events; but keyboard focus is lost when a friend's presence changes.
- **[minor] startPresence 35-50**
  - 🔥 Hater: No disconnect handling: onlineFriends keeps stale contents after a drop; UI shows friends online and invite buttons that cannot work.
  - 💡 Should have been: On disconnect: clear and notify; the server resends the list on reconnect.
  - ⚖️ Judge (✅ defended): Self-correcting on reconnect (server resends the list); documented.
- **[minor] onFriendsOnline / showInviteList 24-27, 127-128**
  - 🔥 Hater: No unsubscribe; repeated showInviteList calls leak closures; returns undefined or a function (callers use || redraw).
  - 💡 Should have been: Return an unsubscribe; always return a function.
  - ⚖️ Judge (✅ defended): Called once per page; guarded; speculative API.

### assets/js/session.js
- **[major] top-level block 89-94 + showUserInTopbar 57-62**
  - 🔥 Hater: Presence socket started as an import-time side effect, never stopped: sign out, sign out everywhere and deletion only repaint the button; friends still see the player online and the page keeps receiving invitations. Server does not disconnect presence sockets on logout.
  - 💡 Should have been: Own the signed-in transition: stopPresence() on sign-out/deletion, or the server disconnects the user's presence sockets.
  - ⚖️ Judge (❌ not defended — conceded weak): Sign-out/delete only repaint; the presence socket stays connected and identified: friends see a signed-out or deleted account online; tabs keep receiving invitations.
- **[minor] reportResult 45-54**
  - 🔥 Hater: try/catch only catches network errors; 400/401/500 silently ignored (validator drift stops stats forever unnoticed); re-implements api(); no keepalive (navigation right after the end screen can abort it).
  - 💡 Should have been: Reuse api() with a logged catch; keepalive: true.
  - ⚖️ Judge (✅ defended): Deliberately fire-and-forget, documented; best-effort self-declared stats.
- **[minor] currentUser 28-36**
  - 🔥 Hater: Signed out, server error and network down all return null: a cold-start 502 makes a signed-in player a guest for the session (wrong account line, results not reported), no retry.
  - 💡 Should have been: null only for a definitive 'not signed in'; distinct unknown state otherwise.
  - ⚖️ Judge (✅ defended): Documented: unknown treated as guest, safe; reload fixes it.
- **[minor] top-level block 89-94**
  - 🔥 Hater: Import-time side effect: on /account/ two /api/auth/me requests and two unordered writers of the top-bar button; presence start depends on an id existing in the HTML.
  - 💡 Should have been: Memoise currentUser; explicit initTopbar().
  - ⚖️ Judge (✅ defended): Only on hub pages; race theoretical; extra request negligible.

### games/chessdown/js/gameplay.js
- **[major] endGame 272-283 local branch**
  - 🔥 Hater: Same-screen game credited as win/loss by hard-coding player 1 = the account; nothing says which seat the account took; one person can play both sides and farm wins (60/hour).
  - 💡 Should have been: Record local games neutrally (not in win/loss totals) or ask which side the player took.
  - ⚖️ Judge (✅ defended — conceded weak): Self-reporting accepted, player 1 = account is the obvious default; but local farming leaks into the totals opponents see (stats totals c1); hot-seat win/loss means little.
- **[minor] endGame signature + gate 264-274**
  - 🔥 Hater: Optional 'how' doubles as the hidden switch for reporting: a future local end path forgetting it silently stops stats.
  - 💡 Should have been: Make 'how' required; decide reporting on room/account only.
  - ⚖️ Judge (✅ defended): Every local/bot end path passes it; ts-checked union; speculative risk.
- **[minor] endGame reporting only point**
  - 🔥 Hater: Bot/local results only sent on a finished game: reloading when losing to the bot never records the loss; bot record biased toward wins.
  - 💡 Should have been: Record abandons on pagehide (sendBeacon/keepalive).
  - ⚖️ Judge (✅ defended): Beacon gives no integrity and would count accidental reloads; consistent with the accepted online-abandon limit.

### games/chessdown/js/invites.js
- **[major] setupInvites onJoin line 19 + joinFromInvite**
  - 🔥 Hater: Guard only checks gameState !== 'gameplay', ignores currentRoomCode: waiting in own room, online draft or victory screen -> joins a second room without leaving the first (server keeps the socket in both, gameStarted re-runs for the wrong room); during gameplay the fallback location.assign reloads and kills the live online game, no confirmation.
  - 💡 Should have been: Decide from currentRoomCode; confirm, run the leave teardown, then join; never reload to join Chessdown.
  - ⚖️ Judge (❌ not defended — conceded weak): Real: draft/over/waiting states slip through; server joinRoom never leaves the old room: two rooms, orphaned first room; during gameplay location.assign kills a live match without confirmation.
- **[minor] joinFromInvite 10-13**
  - 🔥 Hater: Join through the DOM: writes the visible input and fires a fake pointerdown; breaks silently if the handler changes; re-runs enterFullscreen without user activation.
  - 💡 Should have been: Exported joinRoom(code) used by the button and invitations.
  - ⚖️ Judge (✅ defended — conceded weak): Reuses the one join path; fullscreen point mostly off-base; but a synthetic PointerEvent on an element id is fragile.
- **[minor] ?join flow**
  - 🔥 Hater: ?join=CODE never removed: reload replays a stale join with alerts.
  - 💡 Should have been: history.replaceState after reading.
  - ⚖️ Judge (❌ not defended — conceded weak): ?join never cleared: reload/back re-join with alerts.
- **[minor] onJoin line 19**
  - 🔥 Hater: Copies presence.js's fallback URL and the room-code format (three places).
  - 💡 Should have been: Export joinUrl and ROOM_CODE from presence.js; delegate other games.
  - ⚖️ Judge (✅ defended): Client regex is a cheap sanity guard; server validates; nit.

### games/chessdown/js/main.js
- **[major] init() currentUser().then block**
  - 🔥 Hater: ?join=CODE never removed from the URL: reload/back/reopen joins the (now stale) room again every visit.
  - 💡 Should have been: history.replaceState after reading.
  - ⚖️ Judge (❌ not defended — conceded weak): Correct: ?join read and never removed; reload re-joins a stale (or reused) room.
- **[minor] if (!user) return before ?join**
  - 🔥 Hater: Invitation link does nothing (silently) for a guest or when /api/auth/me fails, though joining needs no account; code lost after sign-in.
  - 💡 Should have been: Handle ?join outside the user gate, or keep it in next.
  - ⚖️ Judge (✅ defended): Links only reach signed-in friends; edge case.
- **[minor] joinFromInvite(code) on load**
  - 🔥 Hater: Auto-join fires whenever /api/auth/me returns, even if the player already started a match; the invites.js path has a gameplay guard, this one none.
  - 💡 Should have been: Same guard (main menu visible / initial state); one entry point.
  - ⚖️ Judge (✅ defended): /api/auth/me returns before a match can start; theoretical.
- **[minor] account/invite block**
  - 🔥 Hater: Copy of the Ches'spell block incl. the room-code regex: the code format now lives in four places; location.search parsed twice.
  - 💡 Should have been: Shared readJoinCode() in assets/js/session.js.
  - ⚖️ Judge (✅ defended): Mirrors Ches'spell on purpose; cheap duplication; server validates.

### games/chesspell/js/deck-builder.js
- **[major] openDeckBuilder / showAccountInvite 32-39, 66-69**
  - 🔥 Hater: Snapshot of async state: opened before loadAccount finishes (or if it failed), no '(you)' entry, guest deck preselected, and the 'Sign in' invitation is shown to a signed-in player; never refreshed on profilesChanged.
  - 💡 Should have been: Refresh on profilesChanged while shown; base the invite on the session, not on ProfileManager.account.
  - ⚖️ Judge (❌ not defended — conceded weak): Narrow race, but if loadAccount fails a signed-in player is told to sign in; deck builder not redrawn on profilesChanged.
- **[major] saveDeckForProfile 53-64 + ProfileManager.saveDeck**
  - 🔥 Hater: Live mutable builder.cards Set passed to an awaited save and read twice: toggling a card mid-request makes the local deck differ from the server's; no guard against double click; switching profile mid-save shows the wrong message.
  - 💡 Should have been: Snapshot cards and id; disable Save during the request; only message if the profile is still selected.
  - ⚖️ Judge (❌ not defended — conceded weak): saveDeck reads the live Set after the await: a toggle mid-request makes local and server decks differ.
- **[minor] saveDeckForProfile catch 61-63**
  - 🔥 Hater: err.message shown as is: network errors show 'Failed to fetch' in the status.
  - 💡 Should have been: Fixed fallback message for non-API errors.
  - ⚖️ Judge (❌ not defended — conceded weak): fetch TypeError ('Failed to fetch') shown raw; minor inconsistency.
- **[minor] openDeckBuilder line 35 vs profiles-view line 57**
  - 🔥 Hater: '(you)' label rule copy-pasted.
  - 💡 Should have been: One exported profileLabel(p).
  - ⚖️ Judge (✅ defended): One-line rule twice; simplicity.

### games/chesspell/js/invites.js
- **[major] setupInvites line 16 + online.js joinFromInvite**
  - 🔥 Hater: Joins in place whatever the player is doing: no leaveGame (timer keeps running, online game abandoned without leaveRoom, own waiting room orphaned until idle timeout).
  - 💡 Should have been: Tear down current activity (leaveGame) first; confirm or refuse during a game.
  - ⚖️ Judge (❌ not defended — conceded weak): Valid: joinFromInvite never leaves the current game (timer runs, room not left); Chessdown at least guards gameplay.
- **[minor] setupInvites line 16**
  - 🔥 Hater: Cross-game fallback URL and the room-code regex duplicated from presence.js.
  - 💡 Should have been: Let presence handle other games; one isRoomCode() helper.
  - ⚖️ Judge (✅ defended): onJoin override must handle other games; re-validation is defensive.

### games/chesspell/js/main.js
- **[minor] currentUser().then lines 98-102**
  - 🔥 Hater: setupInvites is called before loadAccount resolves: clicking Join early uses a guest profile and shows a misleading 'build your deck' error; same on a swallowed load failure.
  - 💡 Should have been: setupInvites(code => account.then(() => joinFromInvite(code))); report load failures.
  - ⚖️ Judge (❌ not defended — conceded weak): Invitation callback doesn't wait for the account load (the ?join path does): misleading 'build your deck' alert.
- **[minor] ?join=CODE handling 100-102**
  - 🔥 Hater: join param never removed: reload replays a stale invitation; a signed-out visitor with the link is dropped silently.
  - 💡 Should have been: history.replaceState after reading; for guests keep the code / say sign in.
  - ⚖️ Judge (❌ not defended — conceded weak): ?join never cleared: reload replays a stale code with an alert.

### games/chesspell/js/match.js
- **[major] recordAccountResult 117-126**
  - 🔥 Hater: Local account stats incremented without waiting for or checking reportResult: on 401/429/400 the server never stores the game but the menu counts it; drift until reload, then games 'disappear'.
  - 💡 Should have been: reportResult returns res.ok; increment only on success, or re-fetch stats.
  - ⚖️ Judge (✅ defended): Deliberate optimistic update; drift only on failure, a reload fixes it.
- **[minor] recordAccountResult 125-126**
  - 🔥 Hater: account.stats changed without emitting profilesChanged; views never refresh.
  - 💡 Should have been: Emit profilesChanged from ProfileManager.
  - ⚖️ Judge (✅ defended): No view shows the account's stats between games; banners read stats at next start.
- **[minor] recordAccountResult 111-127**
  - 🔥 Hater: Win/played bookkeeping duplicated from ProfileManager.recordResult; match.js reaches into the data layer.
  - 💡 Should have been: One ProfileManager method owns profile stats.
  - ⚖️ Judge (✅ defended — conceded weak): Paths differ (localStorage vs server), but match.js mutating ProfileManager.account.stats breaks the 'data only' role: an accountPlayed(won) method would be cleaner.

### games/chesspell/js/online.js
- **[major] joinFromInvite 138-149 + btn-join-room handler**
  - 🔥 Hater: Accepting an invitation during a game or while waiting in one's own room never leaves the current room (no leaveRoom), never stops the timer, never resets isOnline; the server joinRoom does not check the socket's other rooms: ghost room, abandoned opponent, background timer can still fire endGame.
  - 💡 Should have been: Leave whatever is in progress with leaveGame() first (confirm if a game is under way), then join.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: accepting during a game or from one's waiting room never leaves/stops anything; server accepts a second room: ghost room, abandoned opponent, running timer.
- **[minor] joinFromInvite 141-148**
  - 🔥 Hater: Join driven through the DOM: writes select.value, third copy of the deck check with a third message, synthetic click (no-op if the listener was not attached), overwrites the player's chosen profile.
  - 💡 Should have been: Exported joinRoom(profile, code) used by the button and the invite.
  - ⚖️ Judge (✅ defended — conceded weak): Single join path is a simple choice, but synthetic click + duplicated validation is fragile; an exported joinRoom would be cleaner.
- **[minor] joinFromInvite line 142 + main.js 101-102**
  - 🔥 Hater: If loadAccount failed (swallowed), it falls back to the selected guest: the signed-in player joins under a guest name, or gets a misleading 'build your deck' message.
  - 💡 Should have been: Say the account could not be loaded; let the player choose.
  - ⚖️ Judge (✅ defended): Server replaces the name with the account's; only the deck/message side effects remain, rooted in profiles c1.

### games/chesspell/js/profiles-view.js
- **[minor] updatePlayerSelects 56-66**
  - 🔥 Hater: Selects rebuilt from scratch on every profilesChanged, now emitted asynchronously: the player's current choice is silently reset.
  - 💡 Should have been: Restore the previous value when it still exists.
  - ⚖️ Judge (✅ defended): Existing design; async emits never fire while choosing on the select screen.

### games/chesspell/js/profiles.js
- **[major] ProfileManager.loadAccount 45-61 (+ main.js caller)**
  - 🔥 Hater: Promise.all ties account, deck and stats: a stats failure (or payload shape change) means no account profile at all; the caller swallows it: the player silently becomes a guest, their server deck disappears, new decks go to a local guest.
  - 💡 Should have been: Stats optional (allSettled / fallback), defensive reads, surface the failure.
  - ⚖️ Judge (❌ not defended — conceded weak): Guest fallback deliberate, but tying the account and its server deck to the stats call means a stats failure silently drops the deck and account profile; stats should be optional.
- **[minor] accountApi 22-31**
  - 🔥 Hater: Generic helper hardcodes 'The deck could not be saved' for every failure including GETs; loses status (401 vs 500); network errors come out raw.
  - 💡 Should have been: Neutral error with status; caller-specific messages.
  - ⚖️ Judge (✅ defended): Only saveDeck shows the message; no caller branches on status.
- **[minor] find() -> updateProfile / deleteProfile**
  - 🔥 Hater: find() widened to all(): updateProfile(ACCOUNT_ID) edits the account in memory and saves only guests (lost on reload); deleteProfile(ACCOUNT_ID) silently no-ops; safe only by accident of the view.
  - 💡 Should have been: Guest-only lookup for guest mutators, or refuse the account explicitly.
  - ⚖️ Judge (✅ defended): Profile screen lists guests only; latent trap, not a live bug.
- **[minor] loadAccount stats snapshot / recordResult**
  - 🔥 Hater: Account stats are a one-time snapshot, updated by ad-hoc increments in match.js that skip online games: stale after online games until reload.
  - 💡 Should have been: refreshAccountStats() re-fetching after any finished game.
  - ⚖️ Judge (✅ defended — conceded weak): Intentional, but the account's own totals go stale after online games and this isn't listed.

### games/chesspell/js/state.js
- **[minor] session.account**
  - 🔥 Hater: session.account written once, never read; duplicates ProfileManager.account and can disagree.
  - 💡 Should have been: Drop it or make it the single source.
  - ⚖️ Judge (❌ not defended — conceded weak): session.account written, never read: dead duplicate state.

### hub/js/account.js
- **[critical] nextPage() 14-17 (+ oauth.js safeNext same regex)**
  - 🔥 Hater: Open redirect: the regex checks the raw second char but the URL parser strips tab/CR/LF first: ?next=/%09/evil.com -> '/\t/evil.com' passes and resolves to https://evil.com/ (verified with Node's URL). location.assign after sign-in and the guest link both use it; oauth.js safeNext copies the regex.
  - 💡 Should have been: new URL(next, origin) and compare origins (or reject control characters and backslashes); share one helper with oauth.js.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: regex accepts '/\t/evil.com', new URL resolves it to https://evil.com/; same regex in oauth.js safeNext (Google redirect too).
- **[major] logout-all and logout handlers 275-288**
  - 🔥 Hater: Failures swallowed (.catch(() => {})) then the page shows signed out anyway: a 'sign out everywhere' that failed gives a false security confirmation.
  - 💡 Should have been: Switch view only on success; show the error otherwise; busy button.
  - ⚖️ Judge (✅ defended — conceded weak): Acceptable for single logout, but swallowing failure of 'sign out everywhere' gives false reassurance on a security action.
- **[major] delete-form / logout handlers vs presence socket**
  - 🔥 Hater: Sign out or account deletion only repaints the DOM: the /presence socket stays connected (identity checked at connect), the tab still shows the player online and receives invitations until reload.
  - 💡 Should have been: stopPresence() in a shared signedOut() helper, or reload the page after success.
  - ⚖️ Judge (❌ not defended — conceded weak): Presence socket never stopped on logout/logout-all/delete: tab stays online and receives invitations.
- **[minor] shrinkPicture() 79-98**
  - 🔥 Hater: Transparent PNG/WebP exported as JPEG turns transparent areas black; no file size check before reading (50 MB photo read twice into memory).
  - 💡 Should have been: Fill the canvas with a background colour first (or keep alpha); reject files over ~10 MB.
  - ⚖️ Judge (✅ defended — conceded weak): JPEG deliberate; transparent areas turn black: one-line fill; cosmetic.
- **[minor] Unlink handler 176-181**
  - 🔥 Hater: Button not disabled: double-click sends two DELETEs, second shows a spurious error; a failed refresh after it is an unhandled rejection.
  - 💡 Should have been: Disable, try/catch, single outcome.
  - ⚖️ Judge (✅ defended — conceded weak): Rare, server authoritative, but inconsistent with the busy-button pattern.

### hub/js/friends.js
- **[major] action() 31-44 + draw() 78-104 + onFriendsOnline 72-75**
  - 🔥 Hater: Double-request guard is button.disabled, but presence events redraw the card (replaceChildren) with fresh enabled buttons while the request is in flight: the action can be fired twice; the second fails and shows an error although the first worked.
  - 💡 Should have been: Track pending actions by key outside the DOM, or update only presence spans on presence events.
  - ⚖️ Judge (❌ not defended — conceded weak): Real: presence redraws give fresh enabled buttons mid-request; second click shows a false error.
- **[minor] showFriends() 67-70**
  - 🔥 Hater: Concurrent fetches with no ordering: an older GET can resolve last and draw stale lists.
  - 💡 Should have been: Sequence number or AbortController.
  - ⚖️ Judge (✅ defended): Tiny window on a small list; next action corrects it.
- **[major] action()/draw() replaceChildren**
  - 🔥 Hater: Every action rebuilds the list holding the focused button: focus falls to body for keyboard users (also on random presence redraws); successes are never announced to screen readers. WCAG 2.2 AA target.
  - 💡 Should have been: Restore focus predictably after redraw; announce the result in the status region.
  - ⚖️ Judge (❌ not defended — conceded weak): Focus lost to body after actions and on presence events; successes not announced: WCAG gap.
- **[minor] action()/showMessage**
  - 🔥 Hater: Old messages stay up after later unrelated actions (stale error in role=alert).
  - 💡 Should have been: Clear messages at the start of each action/submit.
  - ⚖️ Judge (✅ defended — conceded weak): An earlier error stays visible after a successful action: minor, easy.
- **[minor] showFriends refresh failures**
  - 🔥 Hater: Load failures swallowed: a failed first load shows 'No friends yet' (wrong); failed refreshes keep stale buttons, no error.
  - 💡 Should have been: Show a load error; hide the empty text until the first successful load.
  - ⚖️ Judge (✅ defended — conceded weak): A failed first load says 'No friends yet', which is false.

### server/accounts/account-routes.js
- **[major] DELETE / and logout-all → presence online map / identifyPlayers / game rooms**
  - 🔥 Hater: Deleting an account or signing out everywhere only touches the DB: live sockets keep socket.data.user (still online for friends; on disconnect announce() finds no friends, so they appear online until friends reload); rooms keep the account and recordOnline later inserts a row for a deleted user (FK error); open tabs keep playing/inviting as the account after logout-all.
  - 💡 Should have been: Hook from index.js: on delete/logout-all disconnect the user's sockets and notify friends first.
  - ⚖️ Judge (❌ not defended — conceded weak): FK failure caught and logged; but logout-all/delete leave open sockets playing and inviting as the account, deleted user still online to friends; unrecorded gap.
- **[major] DECK_CHECKS lookup, GET/PUT /decks/:game**
  - 🔥 Hater: Plain object indexed by a URL param: /decks/constructor makes check = Object, which returns the body unchanged, so unvalidated JSON is stored under game='constructor' (also /decks/toString). No CHECK on the game column.
  - 💡 Should have been: Use a Map or Object.hasOwn guard; only declared games reach the database.
  - ⚖️ Judge (❌ not defended — conceded weak): Right: /decks/constructor and /decks/toString skip sanitizeDeck and store rows; limited to own rows but breaks the whitelist; Object.hasOwn fixes it.
- **[major] DELETE /providers/:provider 145-154**
  - 🔥 Hater: Read-then-write without transaction: two concurrent unlinks on a passwordless account can both pass and lock it out; counts identity rows, so two rows of the same provider pass the check and the DELETE removes both.
  - 💡 Should have been: One conditional DELETE (password exists OR another provider remains), 400 when rowCount is 0.
  - ⚖️ Judge (❌ not defended — conceded weak): Race moot (Google only), but a second Google account can be linked (no UNIQUE(user_id, provider)); unlink then deletes both rows: lockout.
- **[minor] body-parser selector line 30**
  - 🔥 Hater: req.path === '/avatar' exact match while Express routing is case-insensitive/non-strict (/avatar/ gets the 4 kB parser); the 48 kB parser runs before sameOrigin and the session check.
  - 💡 Should have been: Attach pictureBody to the avatar route itself, after auth.
  - ⚖️ Judge (✅ defended): Fails safe (smaller limit -> 400); body parsers before auth are standard.
- **[minor] DELETE / account deletion rate limit**
  - 🔥 Hater: Password re-check throttled only per IP: a stolen session cookie lets an attacker guess from rotating IPs; successful/400 attempts use the same budget.
  - 💡 Should have been: Also limit failed password checks per account.
  - ⚖️ Judge (❌ not defended — conceded weak): With a stolen cookie the deletion endpoint is a password-guessing oracle per IP only, bypassing the per-account lock adopted for sign-in.
- **[minor] DELETE / and GET / loadAccount**
  - 🔥 Hater: Assumes the user row still exists after the session lookup: concurrent deletion -> TypeError 500 in DELETE, 200 with undefined fields in GET.
  - 💡 Should have been: Return 401 when the row is gone.
  - ⚖️ Judge (✅ defended): Tiny window; Express 5 turns it into a clean 500; harmless.

### server/accounts/avatar.js
- **[major] avatarProblem lines 6-7, 18 vs server/chesspell.js 21-22**
  - 🔥 Hater: Avatar check duplicated: DATA_URL repeats chesspell.js AVATAR_RE and 40_000 repeats AVATAR_MAX; the two validators already disagree (the guest socket path only runs the regex, no canonical base64 or signature check), so pictures shown to other players can pass the weaker check; limits will drift.
  - 💡 Should have been: Export one isValidAvatar + MAX_DATA_URL_LENGTH from avatar.js and use it in chesspell.js too.
  - ⚖️ Judge (✅ defended — conceded weak): Different purposes (guest socket path vs stored account picture), both inert in <img>; but regex and limit are copied and will drift.
- **[major] SIGNATURES + avatarProblem 10-14, 25**
  - 🔥 Hater: Only magic bytes checked: a 28 KB PNG declaring 30000x30000 (or a JPEG SOF 65500x65500) passes, is stored and decoded by every friend/opponent's browser: a decompression bomb aimed at other users.
  - 💡 Should have been: Read declared dimensions (PNG IHDR, WebP VP8*, JPEG SOFn) and reject above ~512x512.
  - ⚖️ Judge (✅ defended — conceded weak): Re-encoding is an accepted limit, but reading declared dimensions is cheap, dependency-free, and stops an oversized image aimed at other players.

### server/accounts/oauth.js
- **[major] callback link branch 147-152**
  - 🔥 Hater: Link only checks whether this Google subject belongs to someone else, not whether the user already has a google identity (no UNIQUE(user_id, provider)); a second Google account can be linked; then unlink sees ['google','google'], passes the 'last way' guard and the DELETE removes both rows: Google-only account locked out.
  - 💡 Should have been: Refuse linking when the user already has that provider; CREATE UNIQUE INDEX ON identities (user_id, provider).
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: UI hides the link button but the server trusts it; a hand-typed ?link=1 links a second Google account; unlink then removes both: Google-only account locked out.
- **[minor] callback link INSERT line 150**
  - 🔥 Hater: Check-then-insert without conflict handling: racing callbacks -> 23505 -> raw JSON 500 on a browser navigation.
  - 💡 Should have been: INSERT ... ON CONFLICT DO NOTHING RETURNING, then redirect taken/linked.
  - ⚖️ Judge (✅ defended): Single-use codes and cleared flow cookie make the race near impossible; PK blocks duplicates; clean 500.
- **[minor] POST /finish catch 199-202**
  - 🔥 Hater: Every 23505 reported as 'username taken', but the identities PK can also conflict (double finish, two tabs): user keeps getting 409, pending row never cleared.
  - 💡 Should have been: Distinguish err.constraint, or consume the pending row first (DELETE ... RETURNING) inside the transaction.
  - ⚖️ Judge (✅ defended): Half wrong: the winning transaction deletes the pending row; only a misleading message in a two-tab edge case.
- **[minor] start and callback error paths**
  - 🔥 Hater: Navigation routes: discovery, DB queries, session creation not wrapped; failures end on a bare JSON 500 page mid-sign-in.
  - 💡 Should have been: Wrap handler bodies; any error -> back(res, {error:'failed'}).
  - ⚖️ Judge (✅ defended — conceded weak): Token exchange failure is handled; others mean a Google/Neon outage and give a clean 500, but a raw JSON page mid-navigation; a try/catch to back(failed) is cheap.
- **[minor] GET /:provider/start line 101**
  - 🔥 Hater: Provider abstraction bypassed: route imports openid-client directly for state/nonce/PKCE; tests with fake providers still load the real library.
  - 💡 Should have been: crypto.randomBytes + sha256 for PKCE, or a provider helper.
  - ⚖️ Judge (✅ defended): PKCE/state helpers are generic; reusing the library avoids hand-written crypto; taste.
- **[minor] callback 128-130, 155, 165**
  - 🔥 Hater: flow.next validated when written to the unsigned cookie but trusted when read back: a planted cookie makes an open redirect after sign-in.
  - 💡 Should have been: Re-run safeNext(flow.next) on read.
  - ⚖️ Judge (✅ defended — conceded weak): Cookie planting is hard (HttpOnly, path, HTTPS, no third-party subdomain), but the client re-validates next and the server does not: one safeNext() call as defense in depth.

### server/accounts/passwords.js
- **[major] verifyPassword 44-50**
  - 🔥 Hater: Only checks 6 fields and 'scrypt'; keylen from expected.length: an empty hash field gives 0-byte key and timingSafeEqual(empty, empty) = true. verifyPassword('whatever','scrypt$16384$8$1$AAAA$') returns true: a truncated/corrupted row means any password works (fails open).
  - 💡 Should have been: Require expected.length === KEY_LENGTH, salt length, sane N/r/p; else dummy path -> false.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: verifyPassword('whatever','scrypt$16384$8$1$AAAA$') is true; needs a corrupted row, but an auth check must not fail open; one-line length check.
- **[minor] verifyPassword 46-49**
  - 🔥 Hater: N/r/p from the stored string unchecked: non-numeric -> scrypt throws -> 500; huge N -> memory blow-up.
  - 💡 Should have been: Bound N/r/p; out of range -> false.
  - ⚖️ Judge (✅ defended): Stored string comes from the server's own hash; 500 not crash; one format check (c1) covers it.
- **[major] oneAtATime queue 17-25**
  - 🔥 Hater: Global serialised scrypt queue, unbounded, no timeout: ~10 hashes/s for the whole server; a spread of clients queues hashes and every legitimate login waits indefinitely (DoS of sign-in), memory grows.
  - 💡 Should have been: Cap pending jobs (e.g. 20) -> 503/429 with Retry-After; maybe concurrency 2.
  - ⚖️ Judge (✅ defended): Serialisation deliberate (128 MiB per hash on 512 MiB); flooding is the rate limiter's job.
- **[minor] hash/verify 28-52**
  - 🔥 Hater: No Unicode normalisation: NFC vs NFD input of the same password fails.
  - 💡 Should have been: normalize('NFC'/'NFKC') before hashing, now before hashes exist.
  - ⚖️ Judge (✅ defended): Usual default; typed input is NFC in practice.
- **[minor] API 42-54**
  - 🔥 Hater: Cost stored for future upgrades but no needsRehash signal; any old low cost accepted forever.
  - 💡 Should have been: Return {ok, needsRehash} and rehash on login.
  - ⚖️ Judge (✅ defended): Only one cost ever used; YAGNI.
- **[minor] oneAtATime line 22**
  - 🔥 Hater: queue.then(fn, fn): the rejection handler is dead code and would pass the error as argument.
  - 💡 Should have been: queue.then(() => fn()).
  - ⚖️ Judge (✅ defended): Defensive and harmless.

### server/accounts/rate-limit.js
- **[major] rateLimit line 22 key = addressFrom (cf-connecting-ip trusted unconditionally)**
  - 🔥 Hater: Key comes from the CF-Connecting-IP header, trusted whenever present; the Render origin (*.onrender.com) is reachable directly, so an attacker sends a random CF-Connecting-IP on each request and gets a fresh bucket: limits on login/signup/etc. do nothing.
  - 💡 Should have been: Trust the header only from Cloudflare IP ranges (or a shared-secret origin header); otherwise use the TCP peer.
  - ⚖️ Judge (❌ not defended — conceded weak): Header trusted on the premise that only Cloudflare reaches the origin, but *.onrender.com answers directly: per-address limits on signup, friends, results, deletion are bypassable.
- **[major] rateLimit line 22 full address string**
  - 🔥 Hater: IPv6 clients rotate addresses within their /64 for free: each is a new bucket, bypassing signup/friend/results/deletion limits.
  - 💡 Should have been: Normalise ::ffff: IPv4 and truncate IPv6 to /64.
  - ⚖️ Judge (❌ not defended — conceded weak): Full IPv6 address as key is a well-known gap (rotate within /64); not considered in the docs.
- **[minor] hits Map + sweep 12-18**
  - 🔥 Hater: Unbounded Map, swept once per window: with c1/c2 an attacker inserts millions of entries (memory DoS on the free instance), sweep is O(n) blocking.
  - 💡 Should have been: Cap the map size, evict oldest or fail closed.
  - ⚖️ Judge (✅ defended): ~100 B per entry, one request each; fixing c1/c2 bounds it.
- **[minor] line 22/25 empty-string key**
  - 🔥 Hater: addressFrom falls back to '' when remoteAddress is undefined: unrelated clients share one bucket.
  - 💡 Should have been: Handle a missing address explicitly.
  - ⚖️ Judge (✅ defended): Practically unreachable and fails in the safe direction.
- **[minor] line 28 message**
  - 🔥 Hater: Hard-coded 'try again in a few minutes' for every use, including the 1-hour /results limit; contradicts Retry-After.
  - 💡 Should have been: Optional message, or build it from the retry delay.
  - ⚖️ Judge (✅ defended): Retry-After carries the exact delay; /results is background.

### server/accounts/routes.js
- **[major] POST /login 104-112**
  - 🔥 Hater: Per-account failure cap is check-then-act: tooManyFailures before await verifyPassword, recordFailure after; concurrent requests all pass the check before any failure is counted, so the cap is not enforced under concurrency.
  - 💡 Should have been: Reserve the attempt synchronously before the await (increment pending count), clear on success.
  - ⚖️ Judge (❌ not defended — conceded weak): Correct: concurrent attempts all pass the check before failures are counted; bursts from N addresses get ~10N guesses; count before the await, refund on success.
- **[major] failures map + POST /login**
  - 🔥 Hater: Anyone can lock any account out for 15 minutes, repeatedly, with 10 wrong passwords from one address (usernames are public); the message suggests Google but password accounts have no Google link.
  - 💡 Should have been: Count per (account, address); use the global per-account count only for delay/challenge, or exempt known-device cookies.
  - ⚖️ Judge (✅ defended — conceded weak): Per-account lock is a documented, accepted trade-off; but 'or sign in with Google' is misleading for password-only accounts (no automatic Google link).
- **[minor] POST /signup 73-81**
  - 🔥 Hater: Signup tells whether an email has an account ('An account already uses this email'), contradicting the file's promise; email enumeration at 10/15 min per IP.
  - 💡 Should have been: Same generic answer for a taken email, or email the owner.
  - ⚖️ Judge (✅ defended): Promise covers sign-in only; no email sending possible yet; signup rate-limited; usual UX trade-off.
- **[minor] POST /signup 82-92**
  - 🔥 Hater: Account creation and session creation not atomic; the 23505 catch also wraps signIn, so a session-table unique error is misreported as 'username taken'; a session failure after insert leaves the user seeing 'taken' on retry.
  - 💡 Should have been: Only the INSERT in the 23505 try; signIn outside; or one transaction.
  - ⚖️ Judge (✅ defended): Session-key collision practically impossible; non-atomic case harmless (account exists, sign in).
- **[minor] TOO_MANY_ON_LOGIN + line 106**
  - 🔥 Hater: Message hardcodes '15 minutes' while the window is configurable and remaining time varies; no Retry-After on this 429.
  - 💡 Should have been: Return remaining ms, set Retry-After, build the message from it.
  - ⚖️ Judge (✅ defended): Default window is 15 min, matching the text; only the site's page reads it.

### server/accounts/sessions.js
- **[minor] sessionStore().deleteExpired, lines 72-74 (+ migration 001)**
  - 🔥 Hater: Hourly sweep DELETE FROM sessions WHERE expires_at <= now() filters an unindexed column: full scan every run; no cap on sessions per user, table grows between sweeps.
  - 💡 Should have been: CREATE INDEX sessions_expires_at ON sessions (expires_at); optionally prune old sessions per user in create().
  - ⚖️ Judge (✅ defended): Tiny table on one instance; rows expire in 30 days and the hourly sweep removes them; hot paths already indexed.
- **[minor] create / userFor lines 37-60; cookieOptions maxAge line 19**
  - 🔥 Hater: Absolute 30-day expiry, never extended: daily players are signed out on day 30 (maybe mid-game); a stolen cookie stays valid 30 days. No idle timeout, no rotation.
  - 💡 Should have been: Sliding window with hard cap: bump expires_at / re-issue past half-life, absolute max from created_at.
  - ⚖️ Judge (✅ defended): Fixed 30-day expiry is a common simple choice, listed in known-limits; 256-bit HttpOnly token stored hashed; open games are not cut.
- **[minor] userFor line 55**
  - 🔥 Hater: SQL text built by interpolation (${withAvatar ? ', u.avatar' : ''}); safe today but invites misuse, shape depends on flag, two statement texts.
  - 💡 Should have been: Two constant queries, or always select avatar, or a separate avatarFor(userId).
  - ⚖️ Judge (✅ defended): Interpolation picks one of two constant literals; token still parameterised; avatar deliberately loaded only at socket handshake.
- **[minor] COOKIE line 6 / cookieOptions 13-21**
  - 🔥 Hater: Plain 'sid' cookie without __Host- prefix: on a custom domain a sibling subdomain can toss a Domain= sid cookie (session fixation); readCookie takes the first sid.
  - 💡 Should have been: Name it __Host-sid in production (Secure, Path=/, no Domain already met).
  - ⚖️ Judge (✅ defended — conceded weak): Not exploitable on onrender.com (public suffix), but a custom domain is planned: naming the cookie __Host-sid in production is one line and closes it.

### server/accounts/validate.js
- **[major] emailProblem / EMAIL regex**
  - 🔥 Hater: [^\s@] accepts control characters incl. NUL and bidi/zero-width; a NUL passes validation, Postgres rejects 0x00 (22021) -> unhandled 500; invisible chars stored and displayed.
  - 💡 Should have been: Reject \p{Cc}\p{Cf} with the u flag.
  - ⚖️ Judge (✅ defended — conceded weak): Loose on purpose; NUL gives a handled 500 (also via login); still, rejecting \p{Cc}\p{Cf} is one line and keeps bidi/zero-width out.
- **[major] usernameProblem / USERNAME regex**
  - 🔥 Hater: Public usernames: admin, moderator, system, support, bot accepted (impersonation); punctuation-only names (---) accepted; same validator for Google sign-up.
  - 💡 Should have been: Require a letter/digit at both ends; reserved names list.
  - ⚖️ Judge (✅ defended): No staff/system accounts to impersonate yet; reserved names when moderation exists.
- **[minor] exports PASSWORD_MAX / literals**
  - 🔥 Hater: PASSWORD_MIN/MAX exported but login and deletion hard-code 128 and 254 again; will drift.
  - 💡 Should have been: Use the constants (and EMAIL_MAX) everywhere.
  - ⚖️ Judge (❌ not defended — conceded weak): Accurate: 254/128 hard-coded in routes.js and account-routes.js; can drift.
- **[minor] passwordProblem 24-29**
  - 🔥 Hater: length counts UTF-16 units; no Unicode normalisation (NFD vs NFC devices -> lockouts); trivial passwords (10 spaces, repeated char, equal to username/email) accepted.
  - 💡 Should have been: Normalise NFKC in a shared helper, count code points, reject trivial ones.
  - ⚖️ Judge (✅ defended — conceded weak): Length bounds fine; trivial passwords (repeated char, username) accepted: minor gap.

### server/chessdown.js
- **[major] chessdown gameplay.js startTurn repetition draw (also online) → server chessdown.js timeUp/recordResult**
  - 🔥 Hater: Online repetition draw only exists in the browser: server room stays 'playing', the overall clock runs and timeUp() later records a 'time' win and loss for a game both clients showed as a draw.
  - 💡 Should have been: Detect repetition on the server with engine.js, recordResult(room, 0, 'repetition'), emit the result.
  - ⚖️ Judge (✅ defended — conceded weak): Known limit (online repetition draw not counted), but the doc understates it: the room stays 'playing' and in overall mode timeUp records a time win/loss.
- **[major] leaveRoom 266-273 / disconnect 285-292 vs recordResult 83-90**
  - 🔥 Hater: Results only recorded on board endings; a losing player can leave or disconnect and the loss never reaches game_results (opponent gets no win). Stats can be dodged.
  - 💡 Should have been: On leave/disconnect during 'playing', recordResult(room, other, 'forfeit') before closeRoom, gameState='over' first.
  - ⚖️ Judge (✅ defended — conceded weak): Documented limit with a planned grace-period forfeit; instant forfeit would punish honest disconnects. Gap still real.
- **[major] joinRoom 156-173 + recordResult**
  - 🔥 Hater: A signed-in user can join their own room as a guest (private window) and lose on purpose to farm 'win against Player 2', or from two tabs of the same account (+1 win +1 loss). Nothing compares accounts.
  - 💡 Should have been: Refuse a second seat by the same account; decide whether games against guests count (e.g. only when both are signed in).
  - ⚖️ Judge (✅ defended — conceded weak): Personal stats only, no ranking; but online results were meant to be trustworthy and same-account seats are not blocked (one comparison); guest-alt farming should at least be documented.
- **[minor] return { rooms } l.295**
  - 🔥 Hater: Hands presence.js the live mutable room table (players, accounts, clocks, boards): invariants no longer enforced in one place.
  - 💡 Should have been: Expose a narrow read-only findOpenRoom(code) API.
  - ⚖️ Judge (✅ defended): presence.js only reads the table; single process, one author; a narrow API is a possible future tightening.
- **[minor] getChessdownPublicRoomState l.35 and recordResult l.85**
  - 🔥 Hater: Same username projection written twice with different fallbacks; will drift.
  - 💡 Should have been: One usernameOf(room, p) helper, fallback at call site.
  - ⚖️ Judge (✅ defended): Different jobs, intentional fallbacks (null for client labels, non-empty name for stats rows).

### server/chesspell.js
- **[major] recordResult 83-93 via sendState; leaveRoom/disconnect handlers**
  - 🔥 Hater: A result is recorded only when the board gives a winner: a losing signed-in player can leave or disconnect and the loss vanishes (and the opponent gets no win), undoing 'server-set stats that cannot be faked'.
  - 💡 Should have been: On leave/disconnect/idle close during 'playing', record a loss for the leaver and a win for the other (reason 'abandon'), gameState='over' first.
  - ⚖️ Judge (✅ defended — conceded weak): Documented known limit; a forfeit needs a reconnection grace period (mobile drops, Render restarts). Still, rage-quitting dodges a loss today.
- **[minor] joinRoom 181-189 + recordResult**
  - 🔥 Hater: Self-join check compares sockets, not accounts: the same account in two tabs plays both sides and recordOnline writes a win and a loss for the same user, inflating played/wins.
  - 💡 Should have been: Refuse joining your own room by account id, or skip recording when both accounts are the same.
  - ⚖️ Judge (✅ defended — conceded weak): Small gain (win+loss each game), second accounts possible anyway; but a one-line account check at join closes the cheapest route.
- **[minor] playerProfile 49-55 / room.accounts**
  - 🔥 Hater: Identity and stats frozen at socket handshake and reused for every room on that socket (stale after sign-out, stats exclude games just finished); whole user object incl. ~40 KB avatar stored in room.accounts for .id only.
  - 💡 Should have been: Store only {id}; look up session/stats at room create/join.
  - ⚖️ Judge (✅ defended): Handshake identity is the documented design; sign-in/out navigates (new socket); same object reference, no copy.

### server/db/index.js
- **[major] openPostgres l.21 new Pool, no pool.on('error')**
  - 🔥 Hater: No 'error' listener on the pg Pool: when Neon drops an idle connection (normal: PgBouncer, scale-to-zero), the Pool emits 'error' and the process crashes, taking every game down.
  - 💡 Should have been: pool.on('error', err => console.error(...)).
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed in pg-pool: an idle client error is emitted on the Pool; no listener -> process crash; Neon suspends/blips happen.
- **[major] openPostgres.transaction l.31-36**
  - 🔥 Hater: ROLLBACK unprotected: on a broken connection its error replaces the real cause, and client.release() returns a broken/aborted client to the pool.
  - 💡 Should have been: try ROLLBACK, on failure release(err) to destroy the client; always rethrow the original error.
  - ⚖️ Judge (✅ defended — conceded weak): pg-pool already drops dead clients; remaining: a failing ROLLBACK masks the original error.
- **[minor] openDb l.62-64**
  - 🔥 Hater: If migrate() throws, the open db is never closed (pool sockets / PGlite instance keep the process alive).
  - 💡 Should have been: try migrate, on error close db then rethrow.
  - ⚖️ Judge (✅ defended): Only called from start(), which exits on failure; tests use fresh PGlite.
- **[minor] openPostgres l.21 Pool options**
  - 🔥 Hater: No connectionTimeoutMillis (default wait forever): Neon waking or pool exhausted makes requests, socket handlers and startup hang silently.
  - 💡 Should have been: connectionTimeoutMillis 10 s, idleTimeoutMillis 30 s, maybe statement_timeout.
  - ⚖️ Judge (❌ not defended — conceded weak): idleTimeout already 10 s by default, but connectionTimeoutMillis defaults to 0 (wait forever): stalls hang requests silently.

### server/db/migrate.js
- **[major] migrate() 12-25, no lock**
  - 🔥 Hater: Two processes starting together (scale-out, overlapping deploy) both see the same pending file and run its DDL; the second fails 'already exists' and does not boot. CREATE TABLE IF NOT EXISTS itself is not concurrency-safe.
  - 💡 Should have been: pg_advisory_xact_lock as the first statement of each migration transaction, re-check inside.
  - ⚖️ Judge (✅ defended): One instance, the old one already migrated; a loser would fail loudly, not corrupt; advisory lock is future-proofing.
- **[major] migrate() 20-21 split(/;\s*$/m)**
  - 🔥 Hater: SQL split by regex on line-ending ';': breaks inside comments, multi-line strings and $$ bodies (any future trigger/DO block); failed boot with a fragment error.
  - 💡 Should have been: Add Db.exec(sql) (PGlite exec / pg simple query) and run the whole file.
  - ⚖️ Judge (✅ defended — conceded weak): Simplicity choice and failures are loud, but the ';' constraint is undocumented and a whole-file exec removes the trap at near-zero cost.
- **[minor] line 17 filename filter**
  - 🔥 Hater: Files not matching the pattern are silently skipped (006_add-index.sql), duplicate numbers accepted.
  - 💡 Should have been: Throw at startup on a misnamed or duplicated migration.
  - ⚖️ Judge (✅ defended): Convention documented; tests would fail at once on a misnamed file.
- **[minor] lines 16-19 done.has(file)**
  - 🔥 Hater: 'Never edit an applied file' is only a comment: edits go undetected, prod/test schemas drift; unknown applied rows (rollback) ignored.
  - 💡 Should have been: Store a checksum, throw on mismatch; log unknown applied migrations.
  - ⚖️ Judge (✅ defended): Rule stated; one developer; checksums are team tooling.

### server/friends.js
- **[critical] 001_accounts.sql users.id bigint + db/index.js (no int8 parser) → friends.js pair()/areFriends/befriend/unfriend/block, sessions.userFor**
  - 🔥 Hater: users.id is bigint: node-postgres returns it as a STRING, PGlite (tests) as a number. In production pair('9','10') compares strings, gets ['10','9'], the friendships INSERT breaks CHECK (user_a < user_b) -> accept fails with 500; areFriends/unfriend/block look up the reversed pair. Accounts whose ids differ in digit count cannot be friends; tests cannot see it.
  - 💡 Should have been: pg.types.setTypeParser(20, Number) in openPostgres (or Number() at the boundary); a test with string ids 9 and 10.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: pg returns int8 as a string, no setTypeParser anywhere; pair('9','10') -> CHECK violation on accept (500); areFriends/unfriend/block miss; tests (PGlite numbers) hide it.
- **[major] friendStore.request 83-93 + POST /requests**
  - 🔥 Hater: Blocked sender gets status 'sent' but no row is stored, so the request is missing from their own outgoing list: a reliable block detector, the 'silent' promise fails.
  - 💡 Should have been: Store the request (shown to sender as pending) and hide it from the blocker's incoming, or return a neutral answer.
  - ⚖️ Judge (❌ not defended — conceded weak): The silent block leaks: 'sent' but nothing in the sender's outgoing list; contradicts the stated intent; not an accepted limit.
- **[major] friendStore.request 84-92**
  - 🔥 Hater: Check-then-act over four autocommit queries: two simultaneous crossed requests both insert -> two pending requests, no friendship; a block between check and insert lets a request through.
  - 💡 Should have been: One transaction with a per-pair lock (pg_advisory_xact_lock) around checks and insert/befriend.
  - ⚖️ Judge (✅ defended): Real but self-repairing (either can accept; befriend deletes both); millisecond windows; schema stays consistent.
- **[major] accept route + auto-befriend path**
  - 🔥 Hater: MAX_FRIENDS only checked on the sender's own count and only when sending; accept and the auto-befriend path never check, so caps can be exceeded; counts read outside a transaction.
  - 💡 Should have been: Enforce both players' caps where the friendship is created (inside befriend's transaction), on accept too.
  - ⚖️ Judge (❌ not defended — conceded weak): Cap only checked on the sender at send time; accepting incoming requests exceeds MAX_FRIENDS without limit, defeating the fan-out bound.
- **[major] DELETE /requests/:u, POST /blocks, DELETE /:u**
  - 🔥 Hater: Only POST /requests is rate-limited; other mutations always call onChange([me, them]) which makes presence query the victim's friends (1+N queries) and push a socket event, even on no-op deletes: unthrottled spam/load on a victim; also fast username-existence probing.
  - 💡 Should have been: Rate limit the whole router per user; call onChange only when rows actually changed.
  - ⚖️ Judge (❌ not defended — conceded weak): No rate limit on other routes: loops of DELETE/blocks spam the victim's presence (1+N queries each), unlimited username enumeration (against the stated intent), Neon cost.
- **[minor] accept route vs befriend**
  - 🔥 Hater: Accept checks the request with a raw query then calls befriend in a separate transaction: a cancel or block in between still yields a friendship; duplicates store SQL.
  - 💡 Should have been: store.accept(): DELETE ... RETURNING inside the transaction, insert the friendship only if a row came back.
  - ⚖️ Judge (✅ defended — conceded weak): Tiny window, mostly harmless, but DELETE ... RETURNING inside the transaction closes it simply.
- **[minor] DELETE /blocks/:u**
  - 🔥 Hater: Unblock does not call onChange, unlike every other mutation: other open pages keep a stale blocked list.
  - 💡 Should have been: onChange([me.id]) after unblocking.
  - ⚖️ Judge (✅ defended): Off-base: onChange only refreshes the online-friends list, which unblocking does not change.

### server/index.js
- **[minor] start() lines 54, 56-59**
  - 🔥 Hater: Background DB calls end in .catch(() => {}): cleanup and friendsChanged failures are never logged.
  - 💡 Should have been: .catch(err => console.error(...)).
  - ⚖️ Judge (❌ not defended — conceded weak): Catching is right, swallowing without a log is not: DB failures become invisible.
- **[minor] start() hourly setInterval**
  - 🔥 Hater: Cleanup runs only after an hour of uptime, never at boot; the free Render instance sleeps after 15 min, so it rarely runs.
  - 💡 Should have been: Run cleanup once at start, then on the interval.
  - ⚖️ Judge (✅ defended — conceded weak): Expiry enforced at read time, so no security effect; but on a sleeping free instance the hourly cleanup almost never runs: run it once at boot.
- **[minor] start() / start().catch 42-43, 65-68**
  - 🔥 Hater: listen gated behind openDb (connect + migrate): a Neon outage takes the whole site (hub, games, guests) down in a crash loop; only err.message logged (stack lost).
  - 💡 Should have been: Listen first and degrade DB routes (503), or at least log err with its stack.
  - ⚖️ Judge (✅ defended): Fail fast is sound (migrations before routes; health check keeps the old instance); logging only err.message is a minor wart.
- **[minor] start() db lifetime**
  - 🔥 Hater: No shutdown path: pg Pool never closed on SIGTERM (every deploy), in-flight queries cut.
  - 💡 Should have been: SIGTERM handler: server.close, io.close, db.close, exit.
  - ⚖️ Judge (✅ defended): Postgres rolls back on disconnect; in-memory games lost on any restart anyway; graceful drain is nice-to-have.

### server/presence.js
- **[major] friends.js onChange([me.id, them.id]) (strings from pg) → presence.js friendsChanged online.has(id) (Map keyed by Number)**
  - 🔥 Hater: Presence keys online by Number(user.id) but friendsRouter passes pg string ids: online.has('5') is always false, live friend-list updates never reach anyone in production.
  - 💡 Should have been: Numbers in one place (DB layer), or map(Number) in friendsChanged.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: friendsChanged gets string ids, online Map is keyed by Number: live friends-panel updates never fire in production.
- **[major] socket-utils identifyPlayers promise vs presence.js async connection handler**
  - 🔥 Hater: Socket helpers promise a DB failure is harmless, but the presence connection handler awaits DB calls without catch: unhandled rejection ends the process; disconnect listener attached after the awaits.
  - 💡 Should have been: Register listeners first, try/catch the async part.
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed (same as presence c1/c2): unguarded async connection handler can end the process; late disconnect listener leaves ghosts.
- **[critical] ns.on('connection', async …) lines 64-99**
  - 🔥 Hater: Async connection handler passed to ns.on awaits announce() and onlineFriends() (DB) without try/catch; a DB failure becomes an unhandled rejection, which kills the Node process (all games drop).
  - 💡 Should have been: try/catch around the awaited presence I/O (or a safe wrapper).
  - ⚖️ Judge (❌ not defended — conceded weak): Confirmed: Node >=24 kills the process on an unhandled rejection; no handler installed; the connection handler is the one unguarded path.
- **[major] connection handler lines 72-75 vs 78 and 99**
  - 🔥 Hater: online map updated before two awaits, but 'disconnect' and 'invite' listeners are attached after them: a client leaving during the DB round-trip leaves a stale online entry forever (looks online, map grows); invites in that window dropped.
  - 💡 Should have been: Register disconnect/invite synchronously right after updating online, then do the awaited work.
  - ⚖️ Judge (❌ not defended — conceded weak): Correct: listeners attached after the awaits; a client leaving in that window leaves a permanent online entry.
- **[major] announce() lines 39-44**
  - 🔥 Hater: where is computed before awaiting friendIds and emitted after; concurrent disconnect/connect announces can arrive out of order, so friends see the player offline while online.
  - 💡 Should have been: Compute whereIs at emit time (after the await), or serialize announces per user.
  - ⚖️ Judge (❌ not defended — conceded weak): Real but rare and cosmetic; trivial fix: compute whereIs after the await.
- **[major] connection handler line 66 socket.disconnect(true)**
  - 🔥 Hater: disconnect(true) closes the whole shared Engine.IO connection, including the game namespace: a player whose session expired (or DB error -> guest) gets their game connection killed.
  - 💡 Should have been: socket.disconnect() (namespace only), or reject in namespace middleware with next(new Error()).
  - ⚖️ Judge (❌ not defended — conceded weak): Checked socket.io: disconnect(true) closes the whole shared Engine.IO connection, cutting a live game when presence refuses a downgraded user; repeats on reconnect.
- **[minor] invite handler lines 77-81**
  - 🔥 Hater: Invite rate limit is per socket, not per user: new tabs/reconnects reset it.
  - 💡 Should have been: Keep timestamps per userId.
  - ⚖️ Judge (✅ defended): Only to online friends from one's own waiting room; per-IP and per-socket limits; recipient can block. Cleaner per user, not a real weakness.

### server/security.js
- **[minor] sameOriginHandshake 38-45 vs sameOrigin in routes.js 22-29**
  - 🔥 Hater: Same origin check written twice with different policies (HTTP rejects missing Origin, sockets accept it); fixes will drift.
  - 💡 Should have been: One helper originMatchesHost(origin, host, {allowMissing}) used by both.
  - ⚖️ Judge (✅ defended): Policies differ on purpose (HTTP guards only state-changing methods; polling GETs may lack Origin); both tested.
- **[minor] sameOriginHandshake line 43**
  - 🔥 Hater: Compares Origin to the request's own Host header instead of a configured allowlist: DNS rebinding passes; port/case normalisation mismatches (Host: example.com:443) could reject legitimate pages.
  - 💡 Should have been: Compare new URL(origin).origin to an allowlist from config (PUBLIC_ORIGIN, localhost in dev).
  - ⚖️ Judge (✅ defended): Origin vs Host is the usual same-origin check; DNS rebinding gains no session (cookie keyed to the real host).
- **[minor] sameOriginHandshake tests**
  - 🔥 Hater: Only three e2e cases; no unit test for malformed Origin, 'null', other port/scheme, missing Host.
  - 💡 Should have been: A small node:test file covering those cases.
  - ⚖️ Judge (✅ defended): Premise wrong: a unit test already covers same, missing, foreign, 'null' and suffix-attack origins.

### server/socket-utils.js
- **[minor] assets/js/presence.js second namespace → limitConnections per-IP counter shared by namespaces**
  - 🔥 Hater: Counter counts namespace sockets: each signed-in game tab now uses two slots; the 20-per-IP limit is halved for signed-in players behind one NAT.
  - 💡 Should have been: Count per engine connection, or give presence its own budget.
  - ⚖️ Judge (✅ defended): True but a tuning note: 10 signed-in tabs per IP is plenty for a small site.
- **[major] identifyPlayers 67-79 with limitConnections 109-122**
  - 🔥 Hater: New async DB await in the middleware chain after limitConnections: if the client hangs up during the await, socket.io 4.8.4 cleans up without emitting 'disconnect' (namespace.js 223-226), so the per-IP counter never decrements; 20 such handshakes lock an address out until restart (whole site if the IP header is misconfigured). No timeout on the DB lookups.
  - 💡 Should have been: Decrement on socket.conn close (once) or count in 'connection'; time-box DB lookups (~2 s) falling back to guest; test it.
  - ⚖️ Judge (❌ not defended — conceded weak): Verified in socket.io 4.8.4: a client closing during the async middleware is cleaned up without 'disconnect', so the per-IP counter leaks until restart; the window now lasts a Neon query (seconds on cold start), no timeout.
- **[minor] identifyPlayers line 72-74**
  - 🔥 Hater: Every handshake on every namespace loads the full avatar and stats into socket.data.user: up to 6 lookups/avatar copies per signed-in visitor with two tabs; stats and identity go stale (logout/sign-out-everywhere don't affect open sockets).
  - 💡 Should have been: Light identity at handshake; avatar by URL; stats at room join.
  - ⚖️ Judge (✅ defended): Stale stats documented; handshake identity is standard; small waste: avatar loaded on presence too.
- **[minor] identifyPlayers line 75 catch**
  - 🔥 Hater: All failures swallowed silently (DB outage turns everyone into guests with no log); a stats failure throws away a valid user.
  - 💡 Should have been: Log; userFor failure -> guest, totals failure -> keep user, stats null.
  - ⚖️ Judge (✅ defended — conceded weak): Guest fallback deliberate and right, but no log at all and a stats failure discards a valid identity: cheap to fix.
- **[minor] safeOn 147-150**
  - 🔥 Hater: ignored() reads err.message blindly: an async handler rejecting with null/undefined makes ignored throw inside .catch -> unhandled rejection -> process crash. Also logs server failures as 'malformed message'.
  - 💡 Should have been: err instanceof Error ? err.message : err; neutral wording.
  - ⚖️ Judge (✅ defended — conceded weak): Theoretical (project code throws Errors), but a crash guard should be robust: err?.message ?? err; wording mislabels DB failures.

### server/stats.js
- **[major] resultProblem 20-29 + totals 58-68**
  - 🔥 Hater: Public totals (shown to online opponents) count all modes, including bot/local results the page self-reports: anyone can POST 60 fake 'local' wins an hour and inflate the record opponents see; local win/loss is meaningless anyway.
  - 💡 Should have been: Public totals from mode='online' only; keep bot/local for the private account page.
  - ⚖️ Judge (✅ defended — conceded weak): Deliberate to count all modes, but the accepted limit says page-reported results stay in the player's own stats, shown apart; totals() shows them to opponents: filter on mode='online'.
- **[minor] recordOnline 48-56**
  - 🔥 Hater: Two sequential INSERTs without a transaction: one side recorded, the other lost on failure.
  - 💡 Should have been: One multi-row INSERT (or a transaction).
  - ⚖️ Judge (✅ defended): Each row is complete on its own; a failed second insert leaves a true first row; logged.
- **[minor] recordOnline 50-55**
  - 🔥 Hater: No check that the two seats are different accounts: self-play in two tabs writes a refereed win and loss for the same user.
  - 💡 Should have been: Skip when both seats hold the same account; refuse it at join.
  - ⚖️ Judge (❌ not defended — conceded weak): Same account in both seats (two tabs) gets refereed win+loss: inflates played/time shown to opponents; trivial check.
- **[minor] recordOnline durationS + clampDuration**
  - 🔥 Hater: startedAt trusted blindly; rooms start with startedAt 0, so a premature record would count ~56 years, silently clamped to 4 h.
  - 💡 Should have been: durationS = startedAt > 0 ? ... : 0.
  - ⚖️ Judge (✅ defended): startedAt is set with gameState='playing'; startedAt 0 cannot reach recordResult today.
- **[minor] resultProblem 24-25**
  - 🔥 Hater: result and reason checked independently: impossible combos accepted (draw by king, Ches'spell draw, win by repetition); no CHECK in schema.
  - 💡 Should have been: Per-game table of allowed reason -> results.
  - ⚖️ Judge (✅ defended): Whitelisted fields; worst case an odd label on one's own unverifiable result.

