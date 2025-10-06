// src/routes/busRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { createBusTrip, recordBusAttendance } = require('../controllers/busController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Transportation (Buses)
 *     description: APIs for managing bus trips and student attendance
 */

// Middleware for bus supervisors or admins
const busActions = [
  authMiddleware,
  hasRole([UserRole.bus_supervisor, UserRole.school_admin]),
  belongsToSchool
];

/**
 * @swagger
 * /api/buses/trips:
 *   post:
 *     summary: Create a new bus trip record for the day
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, direction, routeName]
 *             properties:
 *               date:
 *                 type: string
 *                 format: date
 *               direction:
 *                 type: string
 *                 enum: [pickup, dropoff]
 *               routeName:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Bus trip created successfully
 */
router.post('/trips', busActions, createBusTrip);

/**
 * @swagger
 * /api/buses/attendance:
 *   post:
 *     summary: Record a student's attendance on a bus trip (boarding or drop-off)
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId, studentId, status]
 *             properties:
 *               tripId:
 *                 type: string
 *                 format: uuid
 *               studentId:
 *                 type: string
 *                 format: uuid
 *               status:
 *                 type: string
 *                 enum: [boarded_on, dropped_off]
 *     responses:
 *       "201":
 *         description: Bus attendance recorded successfully
 *       "404":
 *         description: Trip or Student not found
 */
router.post('/attendance', busActions, recordBusAttendance);

module.exports = router;
