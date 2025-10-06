// src/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { getAdminStats } = require('../controllers/dashboardController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Dashboard
 *     description: APIs for fetching aggregated dashboard statistics
 */

const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];

/**
 * @swagger
 * /api/dashboard/admin-stats:
 *   get:
 *     summary: Get key statistics for the school admin dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: An object containing dashboard stats (students, teachers, revenue, classes).
 *       "403":
 *         description: Forbidden. User is not a school admin.
 */
router.get('/admin-stats', adminActions, getAdminStats);

module.exports = router;
