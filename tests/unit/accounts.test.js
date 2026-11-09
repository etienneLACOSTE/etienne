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
const { readCookie } = require('../../server/accounts/sessions');

let db;
let server;
let base;

before(async () => {
    db = await openDb({ url: '' });
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000 }));
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
    const { rows } = await db.query('SELECT name FROM schema_migrations');
    assert.deepEqual(rows.map((r) => r.name), ['001_accounts.sql']);
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
