// server.js
require('dotenv').config();
const logger = require('./src/config/logger');

// Validate environment variables at startup
const validateEnv = require('./src/config/envValidator');
validateEnv();

const app = require('./index');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});