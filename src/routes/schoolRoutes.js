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
    updateStudent, // The new import
    deleteStudent  // The new import
} = require('../controllers/schoolController');
const { UserRole } = require('@prisma/client');

// Middleware for school admin actions
const schoolAdminActions = [authMiddleware, hasRole([UserRole.school_admin]), belongsToSchool];

// --- SUPER ADMIN ROUTE ---
router.post('/', [authMiddleware, hasRole([UserRole.super_admin])], createSchool);

// --- SCHOOL ADMIN ROUTES ---
router.post('/academic-years', schoolAdminActions, createAcademicYear);
router.post('/subjects', schoolAdminActions, createSubject);
router.post('/classes', schoolAdminActions, createClass);
router.post('/students', schoolAdminActions, addStudentToSchool);
router.post('/enrollments', schoolAdminActions, enrollStudentInClass);
router.get('/students/export', schoolAdminActions, exportStudentsToCsv);

// --- NEW ROUTES FOR UPDATE AND DELETE ---
router.put('/students/:studentId', schoolAdminActions, updateStudent);
router.delete('/students/:studentId', schoolAdminActions, deleteStudent);


module.exports = router;