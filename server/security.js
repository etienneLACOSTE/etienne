// @ts-check
// HTTP hardening headers for every response.

// Scripts only from this origin: no inline or injected scripts can run.
// Inline styles are still allowed (the pages use style attributes).
// Fonts are self-hosted (assets/fonts): no third-party style or font origin.
// connect-src allows the optional local Ches'spell AI (ai/chesspell/api.py).
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:5000",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
}

module.exports = { securityHeaders, CONTENT_SECURITY_POLICY };
