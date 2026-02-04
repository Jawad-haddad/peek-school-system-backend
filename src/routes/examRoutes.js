const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { createExam, createExamSchedule, submitBulkMarks, getStudentGrades } = require('../controllers/examController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Exams
 *     description: Examination management
 */

const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];
const teacherAdminActions = [authMiddleware, hasRole([UserRole.school_admin, UserRole.teacher]), belongsToSchool];
const parentActions = [authMiddleware, hasRole([UserRole.parent])]; // Student ID check is usually inside controller or middleware

/**
 * @swagger
 * /api/exams:
 *   post:
 *     summary: Create a master exam
 *     tags: [Exams]
 */
router.post('/', adminActions, createExam);

/**
 * @swagger
 * /api/exams/schedule:
 *   post:
 *     summary: Schedule an exam
 *     tags: [Exams]
 */
router.post('/schedule', adminActions, createExamSchedule);

/**
 * @swagger
 * /api/exams/marks:
 *   post:
 *     summary: Submit bulk marks for an exam schedule
 *     tags: [Exams]
 */
router.post('/marks', teacherAdminActions, submitBulkMarks);

/**
 * @swagger
 * /api/exams/students/{studentId}/grades:
 *   get:
 *     summary: Get grades for a student
 *     tags: [Exams]
 */
router.get('/students/:studentId/grades', parentActions, getStudentGrades);

module.exports = router;
