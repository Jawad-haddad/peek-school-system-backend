const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { createBusTrip, recordBusAttendance } = require('../controllers/busController');
const { UserRole } = require('@prisma/client');

const busActions = [
    authMiddleware,
    hasRole([UserRole.bus_supervisor, UserRole.school_admin]),
];

router.post('/trips', busActions, createBusTrip);
// This route is now active
router.post('/attendance', busActions, recordBusAttendance);

module.exports = router;