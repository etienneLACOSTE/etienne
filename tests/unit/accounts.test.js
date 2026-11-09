// Accounts: database, passwords, sessions and the /api/auth routes, against a real
// (in-memory) PostgreSQL and a real HTTP server.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { openDb } = require('../../server/db');
const { migrate } = require('../../server/db/migrate');
const { hashPassword, verifyPassword } = require('../../server/accounts/passwords');
const { authRouter } = require('../../server/accounts/routes');
const { accountRouter } = require('../../server/accounts/account-routes');
const { readCookie } = require('../../server/accounts/sessions');

let db;
let server;
let base;

before(async () => {
    db = await openDb({ url: '' });
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000 }));
    app.use('/api/account', accountRouter(db, { attemptsPerWindow: 1000 }));
    server = http.createServer(app).listen(0);
    base = `http://localhost:${server.address().port}`;
});

after(async () => {
    server.close();
    await db.close();
});

/** A request as the site's own page would send it (same Origin), with an optional cookie. */
async function api(path, { body, cookie, origin = base, method = body ? 'POST' : 'GET' } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
    const setCookie = res.headers.get('set-cookie') || '';
    return { status: res.status, json: await res.json(), cookie: setCookie.split(';')[0], setCookie };
}

const signup = (username, extra = {}) => api('/api/auth/signup', {
    body: { username, email: `${username}@example.com`, password: 'correct horse battery', ...extra },
});

test('migrations: applied once, a second run changes nothing', async () => {
    await migrate(db);
    const { rows } = await db.query('SELECT name FROM schema_migrations ORDER BY name');
    const files = require('node:fs').readdirSync(require('node:path').join(__dirname, '../../server/db/migrations')).sort();
    assert.ok(files.length >= 2);
    assert.deepEqual(rows.map((r) => r.name), files);
});

test('passwords: scrypt hash, only the right password matches', async () => {
    const stored = await hashPassword('correct horse battery');
    assert.match(stored, /^scrypt\$131072\$8\$1\$/);
    assert.notEqual(stored, await hashPassword('correct horse battery'), 'a new salt each time');
    assert.equal(await verifyPassword('correct horse battery', stored), true);
    assert.equal(await verifyPassword('wrong horse battery', stored), false);
    assert.equal(await verifyPassword('anything', null), false);
    assert.equal(await verifyPassword('anything', 'not a hash'), false);
});

test('signup: creates the account and signs in with a safe cookie', async () => {
    const res = await signup('Alice');
    assert.equal(res.status, 201);
    assert.equal(res.json.user.username, 'Alice');
    assert.match(res.setCookie, /^sid=[\w-]{40,};/);
    assert.match(res.setCookie, /HttpOnly/);
    assert.match(res.setCookie, /SameSite=Lax/);
    const me = await api('/api/auth/me', { cookie: res.cookie });
    assert.deepEqual(me.json.user, res.json.user);

    const { rows } = await db.query('SELECT password_hash, token_hash FROM users JOIN sessions ON user_id = users.id WHERE username = $1', ['Alice']);
    assert.ok(!rows[0].password_hash.includes('correct horse'), 'the password is not stored');
    assert.notEqual(rows[0].token_hash, readCookie(res.cookie, 'sid'), 'the session token is not stored');
});

test('signup: usernames and emails are unique whatever their case', async () => {
    await signup('Bob');
    const sameName = await signup('BOB', { email: 'other@example.com' });
    assert.equal(sameName.status, 409);
    assert.match(sameName.json.error, /username is taken/);
    const sameEmail = await signup('Bobby', { email: 'BOB@example.com' });
    assert.equal(sameEmail.status, 409);
    assert.match(sameEmail.json.error, /email/);
});

test('signup: invalid fields are refused with the reason', async () => {
    for (const [body, reason] of [
        [{ username: 'a', email: 'a@example.com', password: 'long enough pass' }, /username/],
        [{ username: 'has space', email: 'a@example.com', password: 'long enough pass' }, /username/],
        [{ username: 'carol', email: 'not-an-email', password: 'long enough pass' }, /email/],
        [{ username: 'carol', email: 'c@example.com', password: 'short' }, /password/],
        [{ username: 'carol', email: 'c@example.com', password: 'x'.repeat(129) }, /password/],
        [{ username: ['carol'], email: 'c@example.com', password: 'long enough pass' }, /username/],
    ]) {
        const res = await api('/api/auth/signup', { body });
        assert.equal(res.status, 400, JSON.stringify(body));
        assert.match(res.json.error, reason);
    }
});

test('login: by username or email; the same answer for a wrong password or an unknown login', async () => {
    await signup('Dave');
    const byName = await api('/api/auth/login', { body: { login: 'dave', password: 'correct horse battery' } });
    assert.equal(byName.status, 200);
    assert.equal(byName.json.user.username, 'Dave');
    const byEmail = await api('/api/auth/login', { body: { login: 'DAVE@example.com', password: 'correct horse battery' } });
    assert.equal(byEmail.status, 200);

    const wrong = await api('/api/auth/login', { body: { login: 'dave', password: 'wrong horse battery' } });
    const unknown = await api('/api/auth/login', { body: { login: 'nobody', password: 'wrong horse battery' } });
    assert.equal(wrong.status, 401);
    assert.deepEqual(unknown, { ...wrong, cookie: unknown.cookie, setCookie: unknown.setCookie });
    assert.equal(wrong.cookie, '');
});

test('logout: the session no longer works', async () => {
    const { cookie } = await signup('Erin');
    assert.equal((await api('/api/auth/logout', { body: {}, cookie })).status, 200);
    assert.equal((await api('/api/auth/me', { cookie })).json.user, null);
});

test('me: nobody without a cookie, or with a made-up one', async () => {
    assert.equal((await api('/api/auth/me')).json.user, null);
    assert.equal((await api('/api/auth/me', { cookie: 'sid=made-up-token' })).json.user, null);
});

test('expired sessions do not sign in', async () => {
    const { cookie } = await signup('Frank');
    await db.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
    assert.equal((await api('/api/auth/me', { cookie })).json.user, null);
});

test('changes from another site, or without an Origin, are refused (CSRF)', async () => {
    const body = { username: 'Grace', email: 'grace@example.com', password: 'correct horse battery' };
    assert.equal((await api('/api/auth/signup', { body, origin: 'https://evil.example' })).status, 403);
    assert.equal((await api('/api/auth/signup', { body, origin: '' })).status, 403);
    assert.equal((await api('/api/auth/signup', { body, origin: 'null' })).status, 403);
});

test('a body too large or not JSON is refused', async () => {
    const big = await api('/api/auth/login', { body: { login: 'x', password: 'y'.repeat(5000) } });
    assert.equal(big.status, 400);
    const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{not json',
    });
    assert.equal(res.status, 400);
});

test('too many attempts from one address are slowed down', async () => {
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 3, windowMs: 60_000 }));
    const limited = http.createServer(app).listen(0);
    const url = `http://localhost:${limited.address().port}`;
    const statuses = [];
    for (let i = 0; i < 5; i++) {
        const res = await fetch(`${url}/api/auth/login`, {
            method: 'POST', headers: { 'content-type': 'application/json', origin: url },
            body: JSON.stringify({ login: 'nobody', password: 'wrong horse battery' }),
        });
        statuses.push(res.status);
    }
    limited.close();
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
});

test('account: only for a signed-in player', async () => {
    assert.equal((await api('/api/account')).status, 401);
    assert.equal((await api('/api/account/export')).status, 401);
    assert.equal((await api('/api/account', { method: 'DELETE', body: { confirm: 'x' } })).status, 401);
});

test('account: shows the account, never the password hash', async () => {
    const { cookie } = await signup('Heidi');
    const { status, json } = await api('/api/account', { cookie });
    assert.equal(status, 200);
    assert.equal(json.account.username, 'Heidi');
    assert.equal(json.account.email, 'Heidi@example.com');
    assert.equal(json.account.hasPassword, true);
    assert.deepEqual(json.account.providers, []);
    assert.ok(!JSON.stringify(json).includes('scrypt'));
});

test('account: the export is a JSON file with the account and its sign-ins, no secret', async () => {
    const { cookie } = await signup('Ivan');
    const res = await fetch(`${base}/api/account/export`, { headers: { cookie } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition'), /attachment; filename="pawnet-account-Ivan.json"/);
    const text = await res.text();
    const data = JSON.parse(text);
    assert.equal(data.account.username, 'Ivan');
    assert.equal(data.sessions.length, 1);
    assert.ok(!/scrypt|token_hash|password_hash/.test(text));
});

test('account: deleting needs the username and the password, then removes everything', async () => {
    const { cookie } = await signup('Judy');
    const del = (body) => api('/api/account', { method: 'DELETE', body, cookie });
    assert.equal((await del({ confirm: 'someone', password: 'correct horse battery' })).status, 400);
    assert.equal((await del({ confirm: 'judy', password: 'wrong horse battery' })).status, 401);
    assert.equal((await del({ confirm: 'judy' })).status, 401);
    const ok = await del({ confirm: 'judy', password: 'correct horse battery' });
    assert.equal(ok.status, 200);
    assert.match(ok.setCookie, /^sid=;/);
    assert.equal((await api('/api/auth/me', { cookie })).json.user, null);
    const left = await db.query("SELECT (SELECT count(*) FROM users WHERE username = 'Judy') AS users, (SELECT count(*) FROM sessions s WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = s.user_id)) AS orphans");
    assert.deepEqual(left.rows[0], { users: 0, orphans: 0 });
});

test('account: another site cannot delete it (CSRF)', async () => {
    const { cookie } = await signup('Ken');
    const res = await api('/api/account', { method: 'DELETE', body: { confirm: 'Ken', password: 'correct horse battery' }, cookie, origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal((await api('/api/auth/me', { cookie })).json.user.username, 'Ken');
});

const { avatarProblem } = require('../../server/accounts/avatar');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('avatar: only a small real JPEG, PNG or WebP image is accepted', () => {
    assert.equal(avatarProblem(PNG_1PX), null);
    const jpeg = `data:image/jpeg;base64,${Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, ...Array(20).fill(1)]).toString('base64')}`;
    assert.equal(avatarProblem(jpeg), null);
    assert.match(avatarProblem(PNG_1PX.replace('image/png', 'image/jpeg')), /JPEG, PNG or WebP/, 'type and bytes must agree');
    assert.match(avatarProblem('data:image/svg+xml;base64,PHN2Zz4='), /JPEG, PNG or WebP/);
    assert.match(avatarProblem('javascript:alert(1)'), /JPEG, PNG or WebP/);
    assert.match(avatarProblem(`data:image/png;base64,${Buffer.alloc(30_000, 1).toString('base64')}`), /too large/);
    assert.match(avatarProblem(42), /too large/);
});

test('account: set and remove the picture; refused when not an image', async () => {
    const { cookie } = await signup('Liam');
    const put = (avatar) => api('/api/account/avatar', { method: 'PUT', body: { avatar }, cookie });
    assert.equal((await put('data:image/png;base64,AAAA')).status, 400);
    assert.equal((await put(PNG_1PX)).status, 200);
    assert.equal((await api('/api/account', { cookie })).json.account.avatar, PNG_1PX);
    assert.equal((await put(null)).status, 200);
    assert.equal((await api('/api/account', { cookie })).json.account.avatar, '');
});

test('account: a game deck is checked, saved, read back, exported and deleted with the account', async () => {
    const { cookie } = await signup('Mona');
    const deckApi = (body, game = 'chesspell') => api(`/api/account/decks/${game}`, body ? { method: 'PUT', body, cookie } : { cookie });
    assert.deepEqual((await deckApi()).json, { deck: null });
    assert.equal((await deckApi({ deck: [1, 1, 2] })).status, 400);
    assert.equal((await deckApi({ deck: [1, 2, 99] })).status, 400);
    assert.equal((await deckApi({ deck: [1, 2, 3, 4] })).status, 400);
    assert.equal((await deckApi({ deck: [8, 16, 10] }, 'poker')).status, 404);
    assert.equal((await deckApi({ deck: [8, 16, 10] })).status, 200);
    assert.equal((await deckApi({ deck: [8, 16, 12] })).status, 200);
    assert.deepEqual((await deckApi()).json, { deck: [8, 16, 12] });

    const res = await fetch(`${base}/api/account/export`, { headers: { cookie } });
    assert.deepEqual((await res.json()).decks.map((d) => [d.game, d.deck]), [['chesspell', [8, 16, 12]]]);

    await api('/api/account', { method: 'DELETE', body: { confirm: 'Mona', password: 'correct horse battery' }, cookie });
    const { rows } = await db.query('SELECT count(*)::int AS n FROM game_decks');
    assert.equal(rows[0].n, 0);
});

const { sameOriginHandshake } = require('../../server/security');

test('Socket.io handshakes: refused from another site, accepted from this one or without an Origin', () => {
    const decide = (headers) => { let answer; sameOriginHandshake({ headers }, (err, ok) => { answer = ok; }); return answer; };
    assert.equal(decide({ host: 'pawnet.example', origin: 'https://pawnet.example' }), true);
    assert.equal(decide({ host: 'pawnet.example' }), true, 'same-site polling may send no Origin');
    assert.equal(decide({ host: 'pawnet.example', origin: 'https://evil.example' }), false);
    assert.equal(decide({ host: 'pawnet.example', origin: 'null' }), false);
    assert.equal(decide({ host: 'pawnet.example', origin: 'https://pawnet.example.evil.example' }), false);
});

test('many wrong passwords on one account, from any address, are slowed down for that account only', async () => {
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000, failuresPerLogin: 3, windowMs: 60_000 }));
    const limited = http.createServer(app).listen(0);
    const url = `http://localhost:${limited.address().port}`;
    const login = async (who, password) => (await fetch(`${url}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: url },
        body: JSON.stringify({ login: who, password }),
    })).status;
    await signup('Nora');
    await signup('Otto');
    const tries = [];
    for (let i = 0; i < 4; i++) tries.push(await login('nora', 'wrong horse battery'));
    assert.deepEqual(tries, [401, 401, 401, 429]);
    assert.equal(await login('NORA@example.com', 'correct horse battery'), 429, 'the email counts for the same account');
    assert.equal(await login('Nora', 'correct horse battery'), 429, 'even the right password waits');
    assert.equal(await login('otto', 'correct horse battery'), 200, 'other accounts are not affected');
    limited.close();
});

test('sign out on every device', async () => {
    const first = await signup('Pia');
    const second = await api('/api/auth/login', { body: { login: 'pia', password: 'correct horse battery' } });
    assert.equal((await api('/api/account/sessions/logout-all', { body: {}, cookie: second.cookie })).status, 200);
    assert.equal((await api('/api/auth/me', { cookie: first.cookie })).json.user, null);
    assert.equal((await api('/api/auth/me', { cookie: second.cookie })).json.user, null);
});
