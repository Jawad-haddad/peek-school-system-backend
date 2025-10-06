// src/middleware/loggingMiddleware.js
const logger = require('../config/logger');

// This middleware will log details about every incoming HTTP request
const httpLogger = (req, res, next) => {
    const start = Date.now();

    // The 'finish' event is emitted when the response has been sent
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logDetails = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
        };

        // Log with different levels based on status code
        if (res.statusCode >= 500) {
            logger.error(logDetails, `HTTP Request`);
        } else if (res.statusCode >= 400) {
            logger.warn(logDetails, `HTTP Request`);
        } else {
            logger.info(logDetails, `HTTP Request`);
        }
    });

    next();
};

module.exports = httpLogger;