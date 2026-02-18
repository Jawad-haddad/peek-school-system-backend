// src/middleware/errorHandler.js

const logger = require('../config/logger');

/**
 * Global Express error-handling middleware.
 * Must have exactly 4 parameters so Express recognises it as an error handler.
 */
const errorHandler = (err, req, res, _next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';

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
        const target = err.meta?.target;
        message = target
            ? `A record with that ${target} already exists.`
            : 'Resource already exists.';
    }

    // Prisma record not found
    if (err.code === 'P2025') {
        statusCode = 404;
        message = 'Resource not found.';
    }

    // Prisma foreign key constraint failure
    if (err.code === 'P2003') {
        statusCode = 400;
        message = 'Related resource does not exist.';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token.';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired.';
    }

    // Zod validation errors
    if (err.name === 'ZodError') {
        statusCode = 400;
        message = 'Validation failed.';
    }

    res.status(statusCode).json({
        success: false,
        error: {
            message,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
            }),
        },
    });
};

module.exports = errorHandler;
