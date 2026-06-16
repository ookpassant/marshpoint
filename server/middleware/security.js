const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';

// Security headers. The API serves JSON and file downloads only (the SPA is
// served by Nginx), so the restrictive defaults are fine; we disable CSP here
// because it's enforced at the Nginx layer for the static app.
const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
});

// Generic limiter — skipped under test to keep the suite deterministic.
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: message },
  });
}

// Tight limit on login to slow brute-force attempts.
const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

// Limit on public token endpoints (apply/status/licence) to curb abuse.
const publicLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please slow down and try again shortly.',
});

// Broad safety net across the whole API.
const globalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many requests.',
});

module.exports = { securityHeaders, loginLimiter, publicLimiter, globalLimiter };
