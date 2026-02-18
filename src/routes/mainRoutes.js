// src/routes/mainRoutes.js
const express = require('express');
const router = express.Router();
const { getWelcomeMessage } = require('../controllers/mainController');

/**
 * @swagger
 * tags:
 *   - name: Main
 *     description: The main entry point of the API
 */

/**
 * @swagger
 * /:
 *   get:
 *     summary: Returns a welcome message
 *     tags: [Main]
 *     responses:
 *       "200":
 *         description: A welcome message indicating the API is running.
 */
router.get('/', getWelcomeMessage);

module.exports = router;
