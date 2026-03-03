// src/middleware/requestId.js
const crypto = require('crypto');

const requestIdMiddleware = (req, res, next) => {
    // Read existing ID or generate a new UUID
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();

    // Attach to request object for downstream logging
    req.requestId = requestId;

    // Attach to response headers
    res.setHeader('x-request-id', requestId);

    next();
};

module.exports = requestIdMiddleware;
