const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { getChildAttendance, getChildInvoices } = require('../controllers/parentController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Parent
 *     description: Parent-scoped endpoints
 */

const parentActions = [authMiddleware, hasRole([UserRole.parent])];

/**
 * @swagger
 * /api/parent/attendance/{studentId}:
 *   get:
 *     summary: Get attendance history for the parent's own child
 *     tags: [Parent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *         description: Start date (YYYY-MM-DD). Default last 14 days.
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *         description: End date (YYYY-MM-DD). Default today.
 *     responses:
 *       "200":
 *         description: Attendance records and summary
 *       "403":
 *         description: Not the parent of this student
 *       "404":
 *         description: Student not found
 */
router.get('/attendance/:studentId', parentActions, getChildAttendance);

/**
 * @swagger
 * /api/parent/invoices/{studentId}:
 *   get:
 *     summary: Get all invoices for the parent's own child
 *     tags: [Parent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "200":
 *         description: List of invoices with payments
 *       "403":
 *         description: Not the parent of this student
 *       "404":
 *         description: Student not found
 */
router.get('/invoices/:studentId', parentActions, getChildInvoices);

module.exports = router;
