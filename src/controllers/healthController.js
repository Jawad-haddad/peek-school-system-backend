// src/controllers/healthController.js
const prisma = require('../prismaClient');
const logger = require('../config/logger');

const checkHealth = async (req, res) => {
    try {
        // Check 1: Simple API uptime check
        const uptime = process.uptime();

        // Check 2: Database connectivity check
        // $queryRaw`SELECT 1` is a lightweight query to ensure the DB is responsive.
        await prisma.$queryRaw`SELECT 1`;

        const healthStatus = {
            status: 'ok',
            uptime: `${Math.floor(uptime)}s`,
            database: 'connected',
            timestamp: new Date().toISOString()
        };

        res.status(200).json(healthStatus);

    } catch (error) {
        logger.error({ error }, "Health check failed: Could not connect to the database.");
        const errorStatus = {
            status: 'error',
            database: 'disconnected',
            timestamp: new Date().toISOString(),
            details: 'Could not establish a connection with the database.'
        };
        res.status(503).json(errorStatus); // 503 Service Unavailable
    }
};

module.exports = { checkHealth };