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
    exportStudentsToCsv // <-- Import the new function
} = require('../controllers/schoolController');
const { UserRole } = require('@prisma/client');

// SUPER ADMIN routes
router.post('/', [authMiddleware, hasRole([UserRole.super_admin])], createSchool);

// SCHOOL ADMIN routes
const schoolAdminActions = [
    authMiddleware,
    hasRole([UserRole.school_admin]),
    belongsToSchool
];

router.post('/academic-years', schoolAdminActions, createAcademicYear);
router.post('/subjects', schoolAdminActions, createSubject);
router.post('/classes', schoolAdminActions, createClass);
router.post('/students', schoolAdminActions, addStudentToSchool);
router.post('/enrollments', schoolAdminActions, enrollStudentInClass);
// New route for exporting students
router.get('/students/export', schoolAdminActions, exportStudentsToCsv);

module.exports = router;