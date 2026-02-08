// src/routes/academicRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
  createHomework,
  getHomework, // Import new controller
  getHomeworkForStudent,
  addGrade,
  recordAttendance,
  getMySchedule,
  createExam,
  scheduleExam,
  addExamMarks,
  createTimeTableEntry,
  getTeacherClasses,
  createAcademicYear,
  getAcademicYears,
  createTeacher,
  getSubjects,
  getMyStudents
} = require('../controllers/academicController');
const { createSubject } = require('../controllers/schoolController'); // Imported from schoolController
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
const viewActions = [authMiddleware, belongsToSchool]; // General view access

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
// --- Academic Years & Teachers ---
// --- Academic Years & Teachers ---
// Routes for when mounted at /api/academics
router.post('/academic-years', adminActions, createAcademicYear);
router.get('/academic-years', viewActions, getAcademicYears);
router.post('/teachers', adminActions, createTeacher);
router.post('/subjects', adminActions, createSubject); // Ensure createSubject is imported or use one from schoolController? 
// Wait, createSubject is currently in schoolController. If I want it here, I need to import it or move it.
// The user asked to "Fix Subject Management (src/controllers/academicController.js)".
// I moved createSubject logic to academicController implicity by adding getSubjects there (wait, I only added getSubjects to academicController).
// I should import createSubject from schoolController if I want to use it here, or move it.
// Given strict instructions, I will assume I should use the one in academicController if I added it, but I didn't add createSubject there yet.
// I will just link GET /subjects to getSubjects. createSubject is already on schoolRoutes.
// But the prompt said: "Ensure academicRoutes has POST /subjects, GET /subjects".
// So I need to support POST here too.
// I will import createSubject from schoolController for now to avoid duplication error if I didn't remove it there.
// Actually, I can just use the schoolController one if I import it.
// But wait, I am editing academicRoutes.js.
// I will use 'getSubjects' which I added to academicController.
router.get('/subjects', viewActions, getSubjects);

// Routes for when mounted at /api/academic-years (Fix for 404)
router.post('/', adminActions, createAcademicYear);
router.get('/', viewActions, getAcademicYears);

/**
 * @swagger
 * /api/academics/homework:
 *   post:
 *     summary: Create a new homework assignment
 *     tags: [Academics]
...
 */
router.post('/homework', teacherAdminActions, createHomework);

/**
 * @swagger
 * /api/academics/homework:
 *   get:
 *     summary: Get homework assignments
 *     tags: [Academics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classId
 *         schema:
 *           type: string
 *         description: Filter by class ID
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *         description: Filter by student ID (resolves to class)
 *     responses:
 *       "200":
 *         description: List of homework assignments
 */
router.get('/homework', viewActions, getHomework);

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
router.get('/my-students', [authMiddleware, hasRole([UserRole.teacher]), belongsToSchool], getMyStudents);

/**
 * @swagger
 * /api/academics/teachers/{id}/classes:
 *   get:
 *     summary: Get all classes and subjects assigned to a specific teacher
 *     tags: [Academics]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the teacher
 *     responses:
 *       "200":
 *         description: List of classes and subjects retrieved successfully
 */
router.get('/teachers/:id/classes', adminActions, getTeacherClasses);

// --- Parent Routes ---
// Legacy route kept for compatibility, prefer /api/academics/homework?studentId=...
router.get('/students/:studentId/homework', [authMiddleware, hasRole([UserRole.parent])], getHomeworkForStudent);

module.exports = router;
