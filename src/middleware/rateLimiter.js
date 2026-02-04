// src/middleware/rateLimiter.js

const rateLimit = require('express-rate-limit');

// Limiter for login and password reset attempts
const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // Limit each IP to 1000 requests per window
    message: {
        status: 'error',
        message: 'Too many login attempts from this IP, please try again after 15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = {
    loginLimiter,
};