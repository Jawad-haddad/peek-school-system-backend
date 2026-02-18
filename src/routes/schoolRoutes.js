const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
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
router.post('/classes', schoolAdminActions, createClass);
// router.post('/students', schoolAdminActions, addStudentToSchool); // Deprecated/Renamed
router.post('/students', schoolAdminActions, createStudent); // New createStudent with User account
router.post('/teachers', schoolAdminActions, createTeacher); // New createTeacher
router.post('/enrollments', schoolAdminActions, enrollStudentInClass);
router.get('/students/export', schoolAdminActions, exportStudentsToCsv);
router.get('/teachers', schoolAdminActions, getAllTeachers);
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
router.delete('/classes/:classId', schoolAdminActions, deleteClass);
router.put('/classes/:classId', schoolAdminActions, updateClass); // New


module.exports = router;