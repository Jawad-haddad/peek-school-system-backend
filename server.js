// server.js
require('dotenv').config();
const logger = require('./src/config/logger');

// Validate critical environment variables at startup
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  logger.fatal(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});