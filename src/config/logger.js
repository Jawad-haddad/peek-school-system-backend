// src/config/logger.js
const pino = require('pino');

// Configure pino-pretty for a readable development format
const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true, // Make the output colorful
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss', // A nice timestamp format
    ignore: 'pid,hostname', // Ignore noisy fields we don't need
  },
});

// Create the logger instance.
// In a real production environment, we would remove the 'transport'
// to log in pure JSON format for better performance and machine readability.
const logger = pino(transport);

module.exports = logger;