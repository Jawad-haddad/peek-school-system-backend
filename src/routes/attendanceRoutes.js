const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { submitClassAttendance, getClassAttendance, getAttendanceHistory } = require('../controllers/attendanceController');
const { validate, validateQuery } = require('../validators/userValidator');
const { bulkAttendanceSchema } = require('../validators/attendance.validator');
const { paginationSchema } = require('../utils/pagination');
const { cachePrivate } = require('../middleware/cacheHeaders');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Attendance
 *     description: Attendance management
 */

const teacherAdminActions = [authMiddleware, hasRole([UserRole.super_admin, UserRole.school_admin, UserRole.teacher]), belongsToSchool];

/**
 * @swagger
 * /api/attendance/bulk:
 *   post:
 *     summary: Submit attendance for a class (bulk upsert)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, date, records]
 *             properties:
 *               classId: { type: string, format: uuid }
 *               date: { type: string, format: date, example: "2026-02-24" }
 *               records:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [studentId, status]
 *                   properties:
 *                     studentId: { type: string, format: uuid }
 *                     status: { type: string, enum: [present, absent, late, excused], description: "Case-insensitive (normalized to lowercase)" }
 *                     reason: { type: string }
 *     responses:
 *       "200":
 *         description: Attendance saved
 *       "400":
 *         description: Validation error
 *       "403":
 *         description: Teacher not assigned to class
 *       "404":
 *         description: Class not found
 */
router.post('/bulk', teacherAdminActions, validate(bulkAttendanceSchema), submitClassAttendance);

/**
 * @swagger
 * /api/attendance/{classId}/history:
 *   get:
 *     summary: Get attendance day summaries for a class within a date range
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       "200":
 *         description: Array of per-day attendance summaries
 *       "403":
 *         description: Teacher not assigned to class
 */
router.get('/:classId/history', teacherAdminActions, cachePrivate(30), getAttendanceHistory);

/**
 * @swagger
 * /api/attendance/{classId}:
 *   get:
 *     summary: Get attendance for a class on a specific date
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date, example: "2026-02-24" }
 *     responses:
 *       "200":
 *         description: Array of student attendance records
 *       "403":
 *         description: Teacher not assigned to class
 *       "400":
 *         description: Missing classId or date
 */
router.get('/:classId', teacherAdminActions, validateQuery(paginationSchema), cachePrivate(30), getClassAttendance);

module.exports = router;

