const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { getFeeStats, getStudentFees } = require('../controllers/statsController');
const { UserRole } = require('@prisma/client');

const adminActions = [authMiddleware, hasRole([UserRole.school_admin, UserRole.super_admin]), belongsToSchool];

router.get('/overview', adminActions, getFeeStats); // Frontend calls /api/school/reports/overview
router.get('/stats/fees', adminActions, getFeeStats);
router.get('/stats/fees/class/:classId', adminActions, getStudentFees);

module.exports = router;
