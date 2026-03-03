/**
 * src/middleware/cacheHeaders.js
 *
 * Lightweight middleware factories for Cache-Control headers.
 * Only applied to safe, idempotent GET endpoints that return
 * user-specific list data behind authentication.
 *
 * Rules:
 *  - "private"  → browsers may cache, shared proxies must not (user-specific data)
 *  - max-age=30 → 30-second freshness window (good for class/student lists)
 *  - Mutations, login, payments → never cached (no middleware applied)
 */

/**
 * Sets `Cache-Control: private, max-age=<seconds>` on the response.
 * Defaults to 30 seconds if no argument is supplied.
 * @param {number} [maxAge=30]
 */
const cachePrivate = (maxAge = 30) => (_req, res, next) => {
    res.set('Cache-Control', `private, max-age=${maxAge}`);
    next();
};

/**
 * Explicitly prevents any caching. Useful as documentation-level
 * middleware on sensitive endpoints (login, payments, etc.)
 * even though browsers already default to no-cache for POST.
 */
const noCache = (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
};

module.exports = { cachePrivate, noCache };
