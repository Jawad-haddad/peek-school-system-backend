const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { getFeeStats } = require('../controllers/statsController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Stats
 *     description: Statistical data for dashboards
 */

// Admin only actions
const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];

/**
 * @swagger
 * /api/stats/fees:
 *   get:
 *     summary: Get fee statistics (collected, pending, total)
 *     tags: [Stats]
 */
router.get('/fees', adminActions, getFeeStats);

module.exports = router;
