const { z } = require('zod');
const envSchema = z.object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

try {
    envSchema.parse({});
} catch (err) {
    if (err instanceof z.ZodError) {
        console.log(JSON.stringify(err.errors, null, 2));
    }
}
