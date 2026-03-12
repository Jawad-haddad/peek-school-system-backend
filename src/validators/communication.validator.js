const { z } = require('zod');

const announcementQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = {
    announcementQuerySchema
};
