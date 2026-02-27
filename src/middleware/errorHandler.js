// src/middleware/errorHandler.js

const logger = require('../config/logger');
const { fail } = require('../utils/response');

/**
 * Global Express error-handling middleware.
 * Must have exactly 4 parameters so Express recognises it as an error handler.
 */
const errorHandler = (err, req, res, _next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let code = undefined;
    let details = undefined;

    // Log the error
    logger.error({
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
    }, 'Unhandled error');

    // --- Map known error types ---

    // Prisma unique constraint violation
    if (err.code === 'P2002') {
        statusCode = 409;
        code = 'UNIQUE_CONSTRAINT';
        const target = err.meta?.target;
        message = target
            ? `A record with that ${target} already exists.`
            : 'Resource already exists.';
    }

    // Prisma record not found
    if (err.code === 'P2025') {
        statusCode = 404;
        code = 'NOT_FOUND';
        message = 'Resource not found.';
    }

    // Prisma foreign key constraint failure
    if (err.code === 'P2003') {
        statusCode = 400;
        code = 'FOREIGN_KEY_CONSTRAINT';
        message = 'Related resource does not exist.';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        code = 'INVALID_TOKEN';
        message = 'Invalid token.';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        code = 'TOKEN_EXPIRED';
        message = 'Token expired.';
    }

    // Zod validation errors
    if (err.name === 'ZodError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        message = 'Validation failed.';
        details = err.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
        }));
    }

    // Include stack in development
    if (process.env.NODE_ENV === 'development' && !details) {
        details = { stack: err.stack };
    }

    fail(res, statusCode, message, code, details);
};

module.exports = errorHandler;
