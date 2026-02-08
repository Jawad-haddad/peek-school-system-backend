const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
    createSchool,
    addStudentToSchool,
    createAcademicYear,
    createSubject,
    createClass,
    enrollStudentInClass,
    exportStudentsToCsv,
    updateStudent,
    deleteStudent,
    createStudent, // New
    createTeacher, // New
    getAllTeachers, // New
    getAllClasses,
    getStudents,
    updateTeacher,
    deleteTeacher,
    deleteClass
} = require('../controllers/schoolController');
const { getAllExams } = require('../controllers/examController'); // Imported
const { getClassTimetable } = require('../controllers/academicController'); // Imported
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
router.get('/classes', schoolAdminActions, getAllClasses);
router.get('/students', schoolAdminActions, getStudents);

// NEW ROUTES (Fixing 404s)
router.get('/exams', schoolAdminActions, getAllExams);
router.get('/classes/:classId/timetable', schoolAdminActions, getClassTimetable);

// --- NEW ROUTES FOR UPDATE AND DELETE ---
// --- NEW ROUTES FOR UPDATE AND DELETE ---
router.put('/students/:studentId', schoolAdminActions, updateStudent);
router.delete('/students/:studentId', schoolAdminActions, deleteStudent);

router.put('/teachers/:teacherId', schoolAdminActions, updateTeacher); // New
router.delete('/teachers/:teacherId', schoolAdminActions, deleteTeacher); // New
router.delete('/classes/:classId', schoolAdminActions, deleteClass); // New


module.exports = router;