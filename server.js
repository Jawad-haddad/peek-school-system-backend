// server.js
require('dotenv').config();
const logger = require('./src/config/logger');

// Validate environment variables at startup
const env = require('./src/config/env');

const app = require('./index');

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});