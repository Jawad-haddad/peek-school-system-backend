// src/routes/academicRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
  createHomework,
  getHomework, // Import new controller
  getHomeworkForStudent,
  addGrade,
  // recordAttendance, // DEPRECATED: Use attendanceController.submitClassAttendance instead
  getMySchedule,
  getTeacherClasses,
  getAcademicYears,
  getSubjects,
  getMyStudents,
  getClassStudents,
  createTimeTableEntry,
  createAcademicYear, // Re-imported for aliasing
  createTeacher,      // Re-imported for aliasing

} = require('../controllers/academicController');
const { getAllClasses, getAllTeachers, createSubject } = require('../controllers/schoolController'); // Re-imported for backward compatibility
const { validate } = require('../validators/userValidator');
const { createSubjectSchema } = require('../validators/academics.validator');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Academics
 *     description: APIs for managing academic operations like homework, exams, and timetables
 */

// Middleware sets
const teacherAdminActions = [authMiddleware, hasRole([UserRole.super_admin, UserRole.school_admin, UserRole.teacher]), belongsToSchool];
const adminActions = [authMiddleware, hasRole([UserRole.super_admin, UserRole.school_admin]), belongsToSchool];
const viewActions = [authMiddleware, hasRole([UserRole.super_admin, UserRole.school_admin, UserRole.teacher, UserRole.parent]), belongsToSchool]; // Restricted view access

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

// --- Academic Years & Subjects (View Only) ---
router.get('/academic-years', viewActions, getAcademicYears);
router.get('/subjects', viewActions, getSubjects);

// --- Backward Compatibility for /api/academic-years mount ---
router.get('/', viewActions, getAcademicYears);
router.post('/', adminActions, createAcademicYear);

// --- Classes ---
router.get('/classes', [authMiddleware, hasRole([UserRole.teacher, UserRole.school_admin]), belongsToSchool], getAllClasses);
/**
 * @swagger
 * /api/academics/classes/{classId}/students:
 *   get:
 *     summary: Get all students enrolled in a class
 *     tags: [Academics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "200":
 *         description: Array of students
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   fullName: { type: string }
 *                   gender: { type: string, nullable: true }
 *                   dob: { type: string, format: date-time, nullable: true }
 *                   nfc_card_id: { type: string, nullable: true }
 *                   is_nfc_active: { type: boolean }
 *                   wallet_balance: { type: number }
 *                   parent:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       fullName: { type: string }
 *                       email: { type: string }
 *       "404":
 *         description: Class not found in school
 */
router.get('/classes/:classId/students', viewActions, getClassStudents);

// --- Teachers ---
router.get('/teachers', [authMiddleware, hasRole([UserRole.teacher, UserRole.school_admin]), belongsToSchool], getAllTeachers);
router.post('/teachers', adminActions, createTeacher);

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

// --- Grades & Attendance ---
router.post('/homework/:homeworkId/grades', teacherAdminActions, addGrade);
// DEPRECATED: Single-record attendance. Use POST /api/attendance/bulk instead.
// router.post('/attendance', teacherAdminActions, recordAttendance);

// --- Teacher Specific ---
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
router.get('/teachers/:id/classes', [authMiddleware, hasRole([UserRole.school_admin, UserRole.teacher]), belongsToSchool], getTeacherClasses);

// --- Parent Routes ---
// Legacy route kept for compatibility, prefer /api/academics/homework?studentId=...
router.get('/students/:studentId/homework', [authMiddleware, hasRole([UserRole.parent])], getHomeworkForStudent);

// Fix 404 for /api/academics/subjects
router.post('/subjects', adminActions, validate(createSubjectSchema), createSubject);

module.exports = router;
