// Sign in with Google / GitHub: the whole flow against a fake provider, through the
// real routes and an in-memory PostgreSQL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { openDb } = require('../../server/db');
const { authRouter } = require('../../server/accounts/routes');
const { accountRouter } = require('../../server/accounts/account-routes');
const { oauthRouter, suggestUsername, safeNext } = require('../../server/accounts/oauth');

/** A provider that signs in whoever is named by ?code=, if the state matches. */
const fake = {
    async authorizationUrl({ redirectUri, state, codeChallenge }) {
        const url = new URL('https://fake.example/authorize');
        url.search = new URLSearchParams({ redirectUri, state, codeChallenge }).toString();
        return url;
    },
    async exchange(currentUrl, { state, codeVerifier }) {
        assert.ok(codeVerifier.length >= 43, 'PKCE verifier');
        if (currentUrl.searchParams.get('state') !== state) throw new Error('state mismatch');
        const code = currentUrl.searchParams.get('code');
        return { subject: `sub-${code}`, name: `${code} Smith` };
    },
};

let db; let server; let base;
before(async () => {
    db = await openDb({ url: '' });
    const app = express();
    const options = { attemptsPerWindow: 1000 };
    app.use('/api/auth', oauthRouter(db, { providers: { fake }, ...options }));
    app.use('/api/auth', authRouter(db, options));
    app.use('/api/account', accountRouter(db, options));
    server = http.createServer(app).listen(0);
    base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

/** A tiny browser: keeps cookies, does not follow redirects, sends this site's Origin. */
function browser() {
    const jar = new Map();
    const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    return async (path, { method = 'GET', body } = {}) => {
        const res = await fetch(base + path, {
            method, redirect: 'manual',
            headers: { origin: base, cookie: cookieHeader(), ...(body ? { 'content-type': 'application/json' } : {}) },
            body: body && JSON.stringify(body),
        });
        for (const c of res.headers.getSetCookie()) {
            const [pair] = c.split(';');
            const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
            if (v) jar.set(k, v); else jar.delete(k);
        }
        const location = res.headers.get('location');
        const json = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
        return { status: res.status, location, json };
    };
}

/** Go to the provider and come back as `code` (the fake provider's user). */
async function signInWith(b, code, startQuery = '') {
    const start = await b(`/api/auth/fake/start${startQuery}`);
    assert.equal(start.status, 303);
    const state = new URL(start.location).searchParams.get('state');
    return b(`/api/auth/fake/callback?code=${code}&state=${state}`);
}

test('helpers: username suggestions and safe ?next=', () => {
    assert.equal(suggestUsername('Zoé Martin'), 'ZoeMartin');
    assert.equal(suggestUsername('李'), null);
    assert.equal(safeNext('/chesspell/'), '/chesspell/');
    assert.equal(safeNext('//evil.example'), null);
    assert.equal(safeNext('https://evil.example'), null);
    assert.equal(safeNext('/\\evil.example'), null);
});

test('only configured providers are offered; unknown ones are 404', async () => {
    const b = browser();
    assert.deepEqual((await b('/api/auth/providers')).json, { providers: ['fake'] });
    assert.equal((await b('/api/auth/google/start')).status, 404);
});

test('first sign-in: choose a username, then the same person signs straight in', async () => {
    const b = browser();
    const back = await signInWith(b, 'alice');
    assert.equal(back.status, 303);
    assert.equal(back.location, '/account/?finish=fake');
    assert.equal((await b('/api/auth/me')).json.user, null, 'not signed in before choosing a name');
    assert.deepEqual((await b('/api/auth/pending')).json.pending, { provider: 'fake', suggestedUsername: 'aliceSmith' });

    assert.equal((await b('/api/auth/finish', { method: 'POST', body: { username: 'x' } })).status, 400);
    const done = await b('/api/auth/finish', { method: 'POST', body: { username: 'Alice' } });
    assert.equal(done.status, 201);
    assert.equal((await b('/api/auth/me')).json.user.username, 'Alice');
    assert.equal((await b('/api/auth/pending')).json.pending, null, 'used once');

    const again = browser();
    const back2 = await signInWith(again, 'alice', '?next=/chesspell/');
    assert.equal(back2.location, '/chesspell/');
    assert.equal((await again('/api/auth/me')).json.user.username, 'Alice');
    const { json } = await again('/api/account');
    assert.deepEqual([json.account.hasPassword, json.account.providers, json.account.email], [false, ['fake'], null]);
});

test('the callback refuses a missing flow, a wrong state and a cancelled sign-in', async () => {
    const b = browser();
    assert.equal((await b('/api/auth/fake/callback?code=bob&state=x')).location, '/account/?error=cancelled');
    await b('/api/auth/fake/start');
    assert.equal((await b('/api/auth/fake/callback?code=bob&state=forged')).location, '/account/?error=failed');
    await b('/api/auth/fake/start');
    assert.equal((await b('/api/auth/fake/callback?error=access_denied')).location, '/account/?error=cancelled');
    assert.equal((await b('/api/auth/me')).json.user, null);
});

test('an unfinished first sign-in cannot be finished by another browser', async () => {
    const b = browser();
    await signInWith(b, 'carol');
    const other = browser();
    const res = await other('/api/auth/finish', { method: 'POST', body: { username: 'Carol' } });
    assert.equal(res.status, 400);
});

test('?next= to another site is ignored', async () => {
    const b = browser();
    await signInWith(b, 'dan');
    await b('/api/auth/finish', { method: 'POST', body: { username: 'Dan' } });
    const c = browser();
    assert.equal((await signInWith(c, 'dan', '?next=//evil.example/')).location, '/account/');
});

test('link a provider to a password account, unlink it; one account per provider identity', async () => {
    const b = browser();
    await b('/api/auth/signup', { method: 'POST', body: { username: 'Erin', email: 'erin@example.com', password: 'correct horse battery' } });
    assert.equal((await signInWith(b, 'erin', '?link=1')).location, '/account/?linked=fake');
    assert.deepEqual((await b('/api/account')).json.account.providers, ['fake']);

    const other = browser();
    await other('/api/auth/signup', { method: 'POST', body: { username: 'Frank', email: 'frank@example.com', password: 'correct horse battery' } });
    assert.equal((await signInWith(other, 'erin', '?link=1')).location, '/account/?error=taken');

    // Signing in with it now opens Erin's account
    const c = browser();
    await signInWith(c, 'erin');
    assert.equal((await c('/api/auth/me')).json.user.username, 'Erin');

    assert.equal((await b('/api/account/providers/fake', { method: 'DELETE' })).status, 200);
    assert.deepEqual((await b('/api/account')).json.account.providers, []);
});

test('the only way to sign in cannot be unlinked', async () => {
    const b = browser();
    await signInWith(b, 'gina');
    await b('/api/auth/finish', { method: 'POST', body: { username: 'Gina' } });
    const res = await b('/api/account/providers/fake', { method: 'DELETE' });
    assert.equal(res.status, 400);
    assert.match(res.json.error, /only way/);
});

test('an account made with a provider is deleted with the username only', async () => {
    const b = browser();
    await signInWith(b, 'hank');
    await b('/api/auth/finish', { method: 'POST', body: { username: 'Hank' } });
    assert.equal((await b('/api/account', { method: 'DELETE', body: { confirm: 'hank' } })).status, 200);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM identities WHERE subject = 'sub-hank'");
    assert.equal(rows[0].n, 0);
});
