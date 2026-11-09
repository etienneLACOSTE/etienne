// @ts-check
// A limit on how often one address may try something (sign in, sign up...): a fixed
// window per address, kept in memory. Guessing passwords one after another gets slow.

const { addressFrom } = require('../socket-utils');

/**
 * Express middleware: at most `max` requests per `windowMs` from one address, then 429.
 * @param {{ max: number, windowMs: number }} limit
 */
function rateLimit({ max, windowMs }) {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    const hits = new Map();
    const off = process.env.PER_IP_LIMITS === 'off'; // End-to-end tests only (one machine)
    setInterval(() => { // Forget old windows, so the map stays small
        const now = Date.now();
        for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key);
    }, windowMs).unref();

    return (req, res, next) => {
        if (off) return next();
        const key = addressFrom(req.headers, req.socket.remoteAddress);
        const now = Date.now();
        let hit = hits.get(key);
        if (!hit || hit.resetAt <= now) hits.set(key, hit = { count: 0, resetAt: now + windowMs });
        if (++hit.count > max) {
            res.set('Retry-After', String(Math.ceil((hit.resetAt - now) / 1000)));
            return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
        }
        next();
    };
}

module.exports = { rateLimit };
