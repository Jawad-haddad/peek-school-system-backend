// src/routes/healthRoutes.js
const express = require('express');
const router = express.Router();
const { checkHealth } = require('../controllers/healthController');

/**
 * @swagger
 * tags:
 *   - name: Health Check
 *     description: API to check the health status of the server
 */

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Check server and database connectivity
 *     tags: [Health Check]
 *     responses:
 *       "200":
 *         description: Server is up and database is connected.
 *       "503":
 *         description: Service Unavailable. Could not connect to the database.
 */
router.get('/', checkHealth);

module.exports = router;
