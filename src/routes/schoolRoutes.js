const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { validate } = require('../validators/userValidator');
const { createClassSchema, updateClassSchema } = require('../validators/mvpValidator');
const {
    createSchool,
    createAcademicYear,
    createSubject,
    createClass,
    enrollStudentInClass,
    exportStudentsToCsv,
    updateStudent,
    deleteStudent,
    createStudent,
    createTeacher,
    getAllTeachers,
    getAllClasses,
    getStudents,
    updateTeacher,
    deleteTeacher,
    deleteClass,
    updateClass
} = require('../controllers/schoolController');
const { toggleStudentNfc } = require('../controllers/studentController');
const { getAllExams } = require('../controllers/examController'); // Kept for backward compatibility
const { getFeeStats } = require('../controllers/statsController'); // Imported for stats alias
const { getClassTimetable } = require('../controllers/academicController'); // Import for timetable route
const { UserRole } = require('@prisma/client');

// Middleware for school admin actions
const schoolAdminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];

// --- SUPER ADMIN ROUTE ---
router.post('/', [authMiddleware, hasRole([UserRole.super_admin])], createSchool);

// --- SCHOOL ADMIN ROUTES ---
router.post('/academic-years', schoolAdminActions, createAcademicYear);
router.post('/subjects', schoolAdminActions, createSubject);
/**
 * @swagger
 * /api/school/classes:
 *   post:
 *     summary: Create a new class (school_admin only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, academicYearId]
 *             properties:
 *               name: { type: string }
 *               academicYearId: { type: string, format: uuid }
 *               defaultFee: { type: number }
 *     responses:
 *       "201":
 *         description: Class created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 name: { type: string }
 *                 academicYearId: { type: string, format: uuid }
 *                 academicYear:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                 defaultFee: { type: number }
 *                 _count:
 *                   type: object
 *                   properties:
 *                     students: { type: integer }
 *       "400":
 *         description: Missing required fields
 *       "404":
 *         description: Academic year not found in school
 *       "409":
 *         description: Duplicate class name for academic year
 */
router.post('/classes', schoolAdminActions, validate(createClassSchema), createClass);
// router.post('/students', schoolAdminActions, addStudentToSchool); // Deprecated/Renamed
router.post('/students', schoolAdminActions, createStudent); // New createStudent with User account
router.post('/teachers', schoolAdminActions, createTeacher); // New createTeacher
router.post('/enrollments', schoolAdminActions, enrollStudentInClass);
router.get('/students/export', schoolAdminActions, exportStudentsToCsv);
router.get('/teachers', schoolAdminActions, getAllTeachers);
/**
 * @swagger
 * /api/school/classes:
 *   get:
 *     summary: List classes (school_admin + teacher)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: Array of class objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, format: uuid }
 *                   name: { type: string }
 *                   academicYearId: { type: string, format: uuid }
 *                   academicYear:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       name: { type: string }
 *                   defaultFee: { type: number }
 *                   _count:
 *                     type: object
 *                     properties:
 *                       students: { type: integer }
 */
router.get('/classes', [authMiddleware, hasRole([UserRole.school_admin, UserRole.teacher]), belongsToSchool], getAllClasses);
router.get('/students', schoolAdminActions, getStudents);

// NEW ROUTES (Fixing 404s)
router.get('/exams', [authMiddleware, hasRole([UserRole.school_admin, UserRole.teacher]), belongsToSchool], getAllExams); // Deprecated: Use /api/exams
router.get('/stats/fees', schoolAdminActions, getFeeStats);
router.get('/classes/:classId/timetable', [authMiddleware, hasRole([UserRole.school_admin, UserRole.teacher]), belongsToSchool], getClassTimetable);

// --- NEW ROUTES FOR UPDATE AND DELETE ---
router.put('/students/:studentId', schoolAdminActions, updateStudent);
router.patch('/students/:studentId/nfc-status', schoolAdminActions, toggleStudentNfc);
router.delete('/students/:studentId', schoolAdminActions, deleteStudent);

router.put('/teachers/:teacherId', schoolAdminActions, updateTeacher); // New
router.delete('/teachers/:teacherId', schoolAdminActions, deleteTeacher); // New
/**
 * @swagger
 * /api/school/classes/{classId}:
 *   delete:
 *     summary: Delete a class (school_admin only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       "204":
 *         description: Class deleted
 *       "404":
 *         description: Class not found in school
 */
router.delete('/classes/:classId', schoolAdminActions, deleteClass);
/**
 * @swagger
 * /api/school/classes/{classId}:
 *   put:
 *     summary: Update a class (school_admin only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               academicYearId: { type: string, format: uuid }
 *               defaultFee: { type: number }
 *     responses:
 *       "200":
 *         description: Updated class object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string, format: uuid }
 *                 name: { type: string }
 *                 academicYearId: { type: string, format: uuid }
 *                 academicYear:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     name: { type: string }
 *                 defaultFee: { type: number }
 *                 _count:
 *                   type: object
 *                   properties:
 *                     students: { type: integer }
 *       "404":
 *         description: Class or academic year not found in school
 *       "409":
 *         description: Duplicate class name for academic year
 */
router.put('/classes/:classId', schoolAdminActions, validate(updateClassSchema), updateClass);


module.exports = router;