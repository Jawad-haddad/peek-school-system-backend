// src/routes/busRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { startTrip, endTrip, updateBusStatus, getBusTripDetails, getStudentBusStatus, getBusRoutes } = require('../controllers/busController');
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
  hasRole([UserRole.super_admin, UserRole.school_admin, UserRole.bus_supervisor]),
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
router.post('/trips', busActions, startTrip);

/**
 * @swagger
 * /api/buses/routes:
 *   get:
 *     summary: Get all available bus routes
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of bus routes
 */
router.get('/routes', [authMiddleware, belongsToSchool], getBusRoutes);

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
 *       "200":
 *         description: Attendance updated
 *       "404":
 *         description: Trip or Student not found
 */
router.patch('/entry/:studentId', busActions, updateBusStatus);

/**
 * @swagger
 * /api/buses/live/{studentId}:
 *   get:
 *     summary: Get live bus status for a student (Parent only)
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Live status returned
 *       "403":
 *         description: Forbidden (Not parent)
 */
router.get('/live/:studentId', [authMiddleware, hasRole([UserRole.parent]), belongsToSchool], getStudentBusStatus);

/**
 * @swagger
 * /api/buses/trip/start:
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
 *         description: Bus trip started successfully
 *       "400":
 *         description: Missing required fields
 *       "500":
 *         description: Server error
 */
router.post('/trip/start', busActions, startTrip);

/**
 * @swagger
 * /api/buses/trip/end:
 *   post:
 *     summary: Mark a bus trip as completed
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId]
 *             properties:
 *               tripId:
 *                 type: string
 *     responses:
 *       "200":
 *         description: Trip ended successfully
 */
router.post('/trip/end', busActions, endTrip);

/**
 * @swagger
 * /api/buses/trips/{tripId}:
 *   get:
 *     summary: Get details and student manifest for a specific bus trip
 *     tags: [Transportation (Buses)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the bus trip
 *     responses:
 *       "200":
 *         description: Bus trip details and manifest retrieved successfully
 *       "404":
 *         description: Bus trip not found
 */
router.get('/trips/:tripId', busActions, getBusTripDetails);

module.exports = router;
