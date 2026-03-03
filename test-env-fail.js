const { z } = require('zod');
const fs = require('fs');
const logger = require('./src/config/logger');

const envSchema = z.object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

try {
    envSchema.parse({});
} catch (err) {
    try {
        const missingOrInvalid = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        logger.fatal(`\n❌ STARTUP FAILED: Missing or invalid environment variables: ${missingOrInvalid}\n`);
    } catch (innerErr) {
        fs.writeFileSync('dump.txt', `INNER ERROR: ${innerErr.stack}`);
    }
}
