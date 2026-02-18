const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { submitClassAttendance, getClassAttendance } = require('../controllers/attendanceController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Attendance
 *     description: Attendance management
 */

const teacherAdminActions = [authMiddleware, hasRole([UserRole.teacher, UserRole.school_admin]), belongsToSchool];

/**
 * @swagger
 * /api/attendance/bulk:
 *   post:
 *     summary: Submit attendance for a class
 *     tags: [Attendance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId, date, records]
 *             properties:
 *               classId: { type: string }
 *               date: { type: string, format: date }
 *               records: 
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     studentId: { type: string }
 *                     status: { type: string, enum: [present, absent, late, excused] }
 *                     reason: { type: string }
 *     responses:
 *       200: { description: Success }
 */
router.post('/bulk', teacherAdminActions, submitClassAttendance);

/**
 * @swagger
 * /api/attendance/{classId}:
 *   get:
 *     summary: Get attendance for a class on a specific date
 *     tags: [Attendance]
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *     responses:
 *       200: { description: List of students and statuses }
 */
router.get('/:classId', teacherAdminActions, getClassAttendance);

module.exports = router;
