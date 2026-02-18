// src/utils/asyncHandler.js

/**
 * Wraps an async Express route handler so that any rejected promise
 * is automatically forwarded to Express's error-handling middleware.
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = asyncHandler;
