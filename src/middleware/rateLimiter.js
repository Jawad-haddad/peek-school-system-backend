// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

// Strict limiter for auth endpoints (login, register, password reset)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: {
        success: false,
        error: { message: 'Too many attempts from this IP, please try again after 15 minutes.' }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 requests per window
    message: {
        success: false,
        error: { message: 'Too many requests, please try again later.' }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    loginLimiter,
    apiLimiter,
};