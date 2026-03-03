/**
 * src/utils/pagination.js
 * Extractor and formatter for generic API List endpoints to protect against massive JSON loads.
 */

const { z } = require('zod');

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).optional()
}).passthrough();

const getPaginationParams = (req, defaultLimit = 50, maxLimit = 200) => {
    let page = req.query.page ? parseInt(req.query.page, 10) : 1;
    let limit = req.query.limit ? parseInt(req.query.limit, 10) : defaultLimit;

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = defaultLimit;
    if (limit > maxLimit) limit = maxLimit;

    const skip = (page - 1) * limit;
    const take = limit;

    return {
        skip,
        take,
        meta: {
            page,
            limit
        }
    };
};

module.exports = {
    getPaginationParams,
    paginationSchema
};
