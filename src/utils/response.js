// src/utils/response.js

/**
 * Send a successful response with consistent envelope.
 * @param {import('express').Response} res
 * @param {*} data   – payload (object, array, primitive)
 * @param {object}  [meta]       – optional pagination / extra metadata
 * @param {number}  [statusCode] – HTTP status, defaults to 200
 */
const ok = (res, data, meta, statusCode = 200) => {
    const body = { success: true, data };
    if (meta !== undefined && meta !== null) body.meta = meta;
    return res.status(statusCode).json(body);
};

/**
 * Send an error response with consistent envelope.
 * @param {import('express').Response} res
 * @param {number}  statusCode – HTTP status (4xx / 5xx)
 * @param {string}  message    – human-readable error message
 * @param {string}  [code]     – machine-readable error code
 * @param {*}       [details]  – field-level info, stack, etc.
 */
const fail = (res, statusCode, message, code, details) => {
    const error = { message };
    if (code !== undefined && code !== null) error.code = code;
    if (details !== undefined && details !== null) error.details = details;
    return res.status(statusCode).json({ success: false, error });
};

module.exports = { ok, fail };
