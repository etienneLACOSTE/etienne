// @ts-check
// Password hashing with scrypt (built into Node), at the cost OWASP recommends
// (N = 2^17, r = 8, p = 1: 128 MiB and about a tenth of a second per hash).
// Stored as "scrypt$N$r$p$salt$hash" (base64), so the cost can be raised later
// without breaking the hashes already stored.

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = /** @type {(password: string, salt: Buffer, keylen: number, options: crypto.ScryptOptions) => Promise<Buffer>} */ (promisify(crypto.scrypt));

const COST = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const maxmem = (N, r) => 256 * N * r; // Twice what scrypt needs

// One hash at a time: each takes 128 MiB, and the server has 512 MiB.
/** @type {Promise<unknown>} */
let queue = Promise.resolve();
/** @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
function oneAtATime(fn) {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
}

/** @param {string} password @returns {Promise<string>} */
function hashPassword(password) {
    return oneAtATime(async () => {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const { N, r, p } = COST;
        const key = await scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: maxmem(N, r) });
        return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
    });
}

/**
 * Whether `password` matches `stored`. With no stored hash (unknown user), a hash is
 * still computed, so that the answer takes as long either way.
 * @param {string} password @param {string | null | undefined} stored
 */
function verifyPassword(password, stored) {
    return oneAtATime(async () => {
        const parts = typeof stored === 'string' ? stored.split('$') : [];
        const valid = parts.length === 6 && parts[0] === 'scrypt';
        const [N, r, p] = valid ? parts.slice(1, 4).map(Number) : [COST.N, COST.r, COST.p];
        const salt = valid ? Buffer.from(parts[4], 'base64') : crypto.randomBytes(SALT_LENGTH);
        const expected = valid ? Buffer.from(parts[5], 'base64') : crypto.randomBytes(KEY_LENGTH);
        const key = await scrypt(password, salt, expected.length, { N, r, p, maxmem: maxmem(N, r) });
        return valid && crypto.timingSafeEqual(key, expected);
    });
}

module.exports = { hashPassword, verifyPassword, COST };
