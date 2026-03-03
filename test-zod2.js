const { z } = require('zod');
const envSchema = z.object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

try {
    envSchema.parse({});
} catch (err) {
    console.log("Is Error?", err instanceof Error);
    console.log("Is ZodError?", err instanceof z.ZodError);
    console.log("Keys:", Object.keys(err));
    console.log("Error properties:", err);
}
