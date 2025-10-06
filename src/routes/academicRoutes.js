// src/routes/academicRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
  createHomework,
  getHomeworkForStudent,
  addGrade,
  recordAttendance,
  getMySchedule,
  createExam,
  scheduleExam,
  addExamMarks,
  createTimeTableEntry,
} = require('../controllers/academicController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Academics
 *     description: APIs for managing academic operations like homework, exams, and timetables
 */

// Middleware sets
const teacherAdminActions = [authMiddleware, hasRole([UserRole.teacher, UserRole.school_admin]), belongsToSchool];
const adminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];

/**
 * @swagger
 * /api/academics/homework:
 *   post:
 *     summary: Create a new homework assignment
 *     tags: [Academics]
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
 *               - classId
 *               - subjectId
 *               - dueDate
 *             properties:
 *               title:
 *                 type: string
 *               classId:
 *                 type: string
 *                 format: uuid
 *               subjectId:
 *                 type: string
 *                 format: uuid
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               description:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Homework created successfully
 */
router.post('/homework', teacherAdminActions, createHomework);

/**
 * @swagger
 * /api/academics/timetable:
 *   post:
 *     summary: Create a new entry in the master timetable
 *     tags: [Academics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - classId
 *               - subjectId
 *               - teacherId
 *               - dayOfWeek
 *               - startTime
 *               - endTime
 *             properties:
 *               classId:
 *                 type: string
 *               subjectId:
 *                 type: string
 *               teacherId:
 *                 type: string
 *               dayOfWeek:
 *                 type: string
 *                 example: "Sunday"
 *               startTime:
 *                 type: string
 *                 example: "08:00 AM"
 *               endTime:
 *                 type: string
 *                 example: "08:45 AM"
 *     responses:
 *       "201":
 *         description: Timetable entry created successfully
 */
router.post('/timetable', adminActions, createTimeTableEntry);

/**
 * @swagger
 * /api/academics/exams:
 *   post:
 *     summary: Create a new exam definition (e.g., "First Midterm")
 *     tags: [Academics]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - startDate
 *               - endDate
 *             properties:
 *               name:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       "201":
 *         description: Exam definition created successfully
 *       "409":
 *         description: An exam with this name already exists
 */
router.post('/exams', adminActions, createExam);

router.post('/exams/schedule', adminActions, scheduleExam);
router.post('/exams/schedule/:scheduleId/marks', teacherAdminActions, addExamMarks);

// --- Homework, Grades, Attendance ---
router.post('/homework/:homeworkId/grades', teacherAdminActions, addGrade);
router.post('/attendance', teacherAdminActions, recordAttendance);

// --- Timetable & Schedule ---
router.get('/my-schedule', [authMiddleware, hasRole([UserRole.teacher]), belongsToSchool], getMySchedule);

// --- Parent Routes ---
router.get('/students/:studentId/homework', [authMiddleware, hasRole([UserRole.parent])], getHomeworkForStudent);

module.exports = router;
