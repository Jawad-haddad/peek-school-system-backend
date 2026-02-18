const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { createAnnouncement, getAnnouncements, sendBroadcast } = require('../controllers/communicationController');
const { UserRole } = require('@prisma/client');

// Middleware sets
const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];
const viewActions = [authMiddleware, belongsToSchool];

/**
 * @swagger
 * tags:
 *   - name: Communication
 *     description: APIs for announcements and school communication
 */

/**
 * @swagger
 * /api/communication/announcements:
 *   post:
 *     summary: Create a new announcement (Admin only)
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - scope
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               scope:
 *                 type: string
 *                 enum: [SCHOOL, CLASS]
 *               classId:
 *                 type: string
 *                 description: Required if scope is CLASS
 *     responses:
 *       "201":
 *         description: Announcement created successfully
 */
router.post('/announcements', adminActions, createAnnouncement);

/**
 * @swagger
 * /api/communication/announcements:
 *   get:
 *     summary: Get announcements relevant to the current user
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of announcements
 */
router.get('/announcements', viewActions, getAnnouncements);

/**
 * @swagger
 * /api/communication/broadcast:
 *   post:
 *     summary: Send a school-wide broadcast (Admin only)
 *     tags: [Communication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "201":
 *         description: Broadcast sent
 */
router.post('/broadcast', adminActions, sendBroadcast);

module.exports = router;
