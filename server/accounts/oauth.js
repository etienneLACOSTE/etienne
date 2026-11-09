// @ts-check
// Sign in with Google or GitHub (OAuth 2 authorization code flow with PKCE and state;
// OpenID Connect with a nonce for Google), through openid-client.
//
//   GET  /api/auth/providers            which buttons to show (the configured providers)
//   GET  /api/auth/:provider/start      off to Google / GitHub (?next=, ?link=1 to link)
//   GET  /api/auth/:provider/callback   back from it: sign in, link, or choose a username
//   GET  /api/auth/pending              the first sign-in waiting for a username
//   POST /api/auth/finish               { username }: create the account and sign in
//
// Credentials: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID /
// GITHUB_CLIENT_SECRET (Render environment). A provider without them is not offered.

const express = require('express');
const { COOKIE, cookieOptions, readCookie, sessionStore, sha256, newToken } = require('./sessions');
const { usernameProblem } = require('./validate');
const { sameOrigin } = require('./routes');
const { rateLimit } = require('./rate-limit');

const FLOW_COOKIE = 'oauth_flow';
const PENDING_COOKIE = 'oauth_pending';
const FLOW_MINUTES = 10;
const PENDING_MINUTES = 30;
const UNIQUE_VIOLATION = '23505';

/** Only a page of this site: "/x", never "//x" or another origin. */
const safeNext = (next) => (typeof next === 'string' && /^\/(?![/\\])/.test(next) && next.length < 200 ? next : null);

/** The site's public address: behind Render's proxy, always HTTPS in production. */
function baseUrl(req) {
    const scheme = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    return `${scheme}://${req.get('host')}`;
}

/** A username suggestion from the provider's name: letters, digits, - and _ only. */
function suggestUsername(name) {
    const clean = String(name || '').normalize('NFKD').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
    return clean.length >= 3 ? clean : null;
}

/**
 * The real providers. Each one builds the URL to send the player to, and turns the
 * callback into { subject, name }: the provider's permanent id for this person.
 * @typedef {{
 *   authorizationUrl: (p: { redirectUri: string, state: string, codeChallenge: string, nonce: string }) => Promise<URL>,
 *   exchange: (currentUrl: URL, checks: { codeVerifier: string, state: string, nonce: string }) => Promise<{ subject: string, name?: string }>,
 * }} Provider
 * @returns {Record<string, Provider>}
 */
function realProviders(env = process.env) {
    /** @type {Promise<typeof import('openid-client')> | null} */
    let lib = null;
    const oidc = () => (lib ||= import('openid-client'));
    /** @type {Record<string, Provider>} */
    const providers = {};

    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
        let config = null;
        const google = async () => {
            const client = await oidc();
            return (config ||= await client.discovery(new URL('https://accounts.google.com'), env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET));
        };
        providers.google = {
            async authorizationUrl({ redirectUri, state, codeChallenge, nonce }) {
                const client = await oidc();
                return client.buildAuthorizationUrl(await google(), {
                    redirect_uri: redirectUri, scope: 'openid profile', state, nonce,
                    code_challenge: codeChallenge, code_challenge_method: 'S256', prompt: 'select_account',
                });
            },
            async exchange(currentUrl, { codeVerifier, state, nonce }) {
                const client = await oidc();
                const tokens = await client.authorizationCodeGrant(await google(), currentUrl, {
                    pkceCodeVerifier: codeVerifier, expectedState: state, expectedNonce: nonce, idTokenExpected: true,
                });
                const claims = tokens.claims();
                return { subject: String(claims.sub), name: String(claims.given_name || claims.name || '') };
            },
        };
    }

    if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
        let config = null;
        const github = async () => {
            const client = await oidc();
            return (config ||= new client.Configuration({
                issuer: 'https://github.com',
                authorization_endpoint: 'https://github.com/login/oauth/authorize',
                token_endpoint: 'https://github.com/login/oauth/access_token',
            }, env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET));
        };
        providers.github = {
            async authorizationUrl({ redirectUri, state, codeChallenge }) {
                const client = await oidc();
                // No scope: only the public profile (id and login) is needed.
                return client.buildAuthorizationUrl(await github(), {
                    redirect_uri: redirectUri, state, code_challenge: codeChallenge, code_challenge_method: 'S256',
                });
            },
            async exchange(currentUrl, { codeVerifier, state }) {
                const client = await oidc();
                const tokens = await client.authorizationCodeGrant(await github(), currentUrl, {
                    pkceCodeVerifier: codeVerifier, expectedState: state,
                });
                const res = await fetch('https://api.github.com/user', {
                    headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'pawnet' },
                });
                if (!res.ok) throw new Error(`GitHub profile request failed (${res.status})`);
                const user = await res.json();
                return { subject: String(user.id), name: user.login };
            },
        };
    }
    return providers;
}

/**
 * @param {import('../db').Db} db
 * @param {{ providers?: Record<string, Provider>, attemptsPerWindow?: number, windowMs?: number }} [options]
 */
function oauthRouter(db, { providers = realProviders(), attemptsPerWindow = 30, windowMs = 15 * 60 * 1000 } = {}) {
    const sessions = sessionStore(db);
    const router = express.Router();
    const attempts = rateLimit({ max: attemptsPerWindow, windowMs });
    const shortCookie = (minutes, path) => ({ ...cookieOptions(), maxAge: minutes * 60 * 1000, path });
    const back = (res, query) => res.redirect(303, `/account/?${new URLSearchParams(query)}`);

    router.get('/providers', (req, res) => res.json({ providers: Object.keys(providers) }));

    router.get('/:provider/start', attempts, async (req, res) => {
        const provider = providers[req.params.provider];
        if (!provider) return res.status(404).json({ error: 'Not found.' });
        const client = await import('openid-client');
        const flow = {
            provider: req.params.provider,
            state: client.randomState(),
            nonce: client.randomNonce(),
            codeVerifier: client.randomPKCECodeVerifier(),
            next: safeNext(req.query.next),
            link: req.query.link === '1',
        };
        const url = await provider.authorizationUrl({
            redirectUri: `${baseUrl(req)}/api/auth/${flow.provider}/callback`,
            state: flow.state,
            nonce: flow.nonce,
            codeChallenge: await client.calculatePKCECodeChallenge(flow.codeVerifier),
        });
        // Lax: sent back when the provider redirects here, never on another site's request.
        res.cookie(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString('base64url'), shortCookie(FLOW_MINUTES, '/api/auth'));
        res.redirect(303, url.href);
    });

    router.get('/:provider/callback', attempts, async (req, res) => {
        const name = req.params.provider;
        const provider = providers[name];
        if (!provider) return res.status(404).json({ error: 'Not found.' });
        res.clearCookie(FLOW_COOKIE, { ...cookieOptions(), path: '/api/auth', maxAge: undefined });
        let flow = null;
        try {
            flow = JSON.parse(Buffer.from(readCookie(req.headers.cookie, FLOW_COOKIE) || '', 'base64url').toString());
        } catch { flow = null; }
        if (!flow || flow.provider !== name || req.query.error) return back(res, { error: 'cancelled' });

        let who;
        try {
            const currentUrl = new URL(req.originalUrl, baseUrl(req));
            who = await provider.exchange(currentUrl, { codeVerifier: flow.codeVerifier, state: flow.state, nonce: flow.nonce });
        } catch (err) {
            console.error(`Sign-in with ${name} failed: ${err.message}`);
            return back(res, { error: 'failed' });
        }

        const owner = (await db.query(
            'SELECT u.id, u.username FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2',
            [name, who.subject],
        )).rows[0];
        const current = await sessions.userFor(req.headers.cookie);

        if (flow.link) { // From the account page: add this sign-in to the signed-in account
            if (!current) return back(res, { error: 'failed' });
            if (owner && owner.id !== current.id) return back(res, { error: 'taken' });
            if (!owner) await db.query('INSERT INTO identities (provider, subject, user_id) VALUES ($1, $2, $3)', [name, who.subject, current.id]);
            return back(res, { linked: name });
        }
        if (owner) {
            res.cookie(COOKIE, await sessions.create(owner.id), cookieOptions());
            return res.redirect(303, flow.next || '/account/');
        }
        // First time: the player chooses a username before the account exists.
        const token = newToken();
        await db.query(
            `INSERT INTO oauth_pending (token_hash, provider, subject, suggested_username, expires_at)
             VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
            [sha256(token), name, who.subject, suggestUsername(who.name), PENDING_MINUTES],
        );
        res.cookie(PENDING_COOKIE, token, shortCookie(PENDING_MINUTES, '/api/auth'));
        back(res, { finish: name, ...(flow.next ? { next: flow.next } : {}) });
    });

    const pendingFor = async (req) => {
        const token = readCookie(req.headers.cookie, PENDING_COOKIE);
        if (!token || token.length > 100) return null;
        return (await db.query(
            'SELECT provider, subject, suggested_username FROM oauth_pending WHERE token_hash = $1 AND expires_at > now()',
            [sha256(token)],
        )).rows[0] || null;
    };

    router.get('/pending', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const pending = await pendingFor(req);
        res.json({ pending: pending && { provider: pending.provider, suggestedUsername: pending.suggested_username } });
    });

    router.post('/finish', express.json({ limit: '1kb' }), sameOrigin, attempts, async (req, res) => {
        const pending = await pendingFor(req);
        if (!pending) return res.status(400).json({ error: 'This sign-in has expired. Start again.' });
        const { username } = req.body || {};
        const problem = usernameProblem(username);
        if (problem) return res.status(400).json({ error: problem });
        try {
            const user = await db.transaction(async (tx) => {
                const { rows } = await tx.query('INSERT INTO users (username) VALUES ($1) RETURNING id, username', [username]);
                await tx.query('INSERT INTO identities (provider, subject, user_id) VALUES ($1, $2, $3)', [pending.provider, pending.subject, rows[0].id]);
                await tx.query('DELETE FROM oauth_pending WHERE provider = $1 AND subject = $2', [pending.provider, pending.subject]);
                return rows[0];
            });
            res.clearCookie(PENDING_COOKIE, { ...cookieOptions(), path: '/api/auth', maxAge: undefined });
            res.cookie(COOKIE, await sessions.create(user.id), cookieOptions());
            res.status(201).json({ user: { id: user.id, username: user.username } });
        } catch (err) {
            if (err.code !== UNIQUE_VIOLATION) throw err;
            res.status(409).json({ error: 'This username is taken.' });
        }
    });

    router.use((err, req, res, next) => {
        if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Bad request.' });
        }
        console.error(`Sign-in error on ${req.method} ${req.path}: ${err.message}`);
        res.status(500).json({ error: 'Something went wrong. Try again.' });
    });

    return router;
}

/** Remove first sign-ins nobody finished. */
async function deleteExpiredPending(db) {
    await db.query('DELETE FROM oauth_pending WHERE expires_at <= now()');
}

module.exports = { oauthRouter, realProviders, deleteExpiredPending, suggestUsername, safeNext };
