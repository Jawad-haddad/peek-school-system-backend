const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { 
    createHomework, 
    getHomeworkForStudent, 
    addGrade, 
    recordAttendance, 
    getMySchedule 
} = require('../controllers/academicController');
const { UserRole } = require('@prisma/client');

// --- Teacher & School Admin Routes ---

// Route to create homework
router.post(
    '/homework', 
    authMiddleware, 
    hasRole([UserRole.teacher, UserRole.school_admin]), 
    createHomework
);

// Route to add a grade to a homework for a specific student
router.post(
  '/homework/:homeworkId/grades',
  authMiddleware,
  hasRole([UserRole.teacher, UserRole.school_admin]),
  addGrade
);

// Route to record student attendance
router.post(
  '/attendance',
  authMiddleware,
  hasRole([UserRole.teacher, UserRole.school_admin]),
  recordAttendance
);

// Route for a teacher to get their own schedule
router.get(
  '/my-schedule',
  authMiddleware,
  hasRole([UserRole.teacher]),
  getMySchedule
);


// --- Parent Routes ---

// Route for a parent to get homework for their student
router.get(
    '/students/:studentId/homework', 
    authMiddleware, 
    hasRole([UserRole.parent]),
    getHomeworkForStudent
);

module.exports = router;