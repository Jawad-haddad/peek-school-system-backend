// src/config/envValidator.js
const logger = require('./logger');

const validateEnv = () => {
    // 1. Critical Variables - Fail Fast
    const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
    const missingRequired = requiredEnvVars.filter(v => !process.env[v]);

    if (missingRequired.length > 0) {
        // Output clear message
        logger.fatal(`\n❌ STARTUP FAILED: Missing required environment variables: ${missingRequired.join(', ')}\n`);
        process.exit(1);
    }

    // 2. Optional Variables - Warn Only
    const optionalEnvVars = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER',
        'FIREBASE_SERVICE_ACCOUNT',
        'FRONTEND_URL'
    ];

    const missingOptional = optionalEnvVars.filter(v => !process.env[v]);

    if (missingOptional.length > 0) {
        logger.warn(`⚠️ The following optional environment variables are missing. Some features may be disabled: ${missingOptional.join(', ')}`);
    }

    logger.info('✅ Environment validation completed successfully.');
};

module.exports = validateEnv;
