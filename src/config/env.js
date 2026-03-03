const { z } = require('zod');
const logger = require('./logger');

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),

    // CORS origin(s) can be comma separated
    CORS_ORIGIN: z.string().optional(),

    // Optional External Integrations (these mirror the previous optional variables)
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
    FIREBASE_SERVICE_ACCOUNT: z.string().optional(),

    // Optional SMTP configuration placeholders
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
});

function validateEnv() {
    try {
        const parsed = envSchema.parse(process.env);

        // Warn about missing optional dependencies like the previous validator did
        const optionalEnvVars = [
            'TWILIO_ACCOUNT_SID',
            'TWILIO_AUTH_TOKEN',
            'TWILIO_PHONE_NUMBER',
            'FIREBASE_SERVICE_ACCOUNT'
        ];
        const missingOptional = optionalEnvVars.filter(v => !parsed[v]);

        if (missingOptional.length > 0) {
            if (parsed.NODE_ENV !== 'test') { // Supress in tests unless configured elsewhere
                logger.warn(`⚠️ The following optional environment variables are missing. Some features may be disabled: ${missingOptional.join(', ')}`);
            }
        }

        if (parsed.NODE_ENV !== 'test') {
            logger.info('✅ Environment validation completed successfully.');
        }
        return parsed;
    } catch (err) {
        if (err instanceof z.ZodError) {
            const issues = err.issues || err.errors || [];
            const missingOrInvalid = issues.map(e => `${(e.path || []).join('.')}: ${e.message}`).join(', ');
            logger.fatal(`\n❌ STARTUP FAILED: Missing or invalid environment variables: ${missingOrInvalid}\n`);
        } else {
            logger.fatal(`\n❌ STARTUP FAILED: Failed to validate environment variables: ${err.message}\n`);
        }
        process.exit(1);
    }
}

// freeze to prevent accidental modifications later
const env = Object.freeze(validateEnv());

module.exports = env;
