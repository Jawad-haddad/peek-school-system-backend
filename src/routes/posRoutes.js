// src/routes/posRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { createPosOrder, addCanteenItem } = require('../controllers/posController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: POS (Canteen)
 *     description: APIs for managing the Point of Sale system for the school canteen
 */

// Middleware for admin-only actions
const adminActions = [
  authMiddleware,
  hasRole([UserRole.school_admin]),
];

// Middleware for staff who can create orders
const staffActions = [
  authMiddleware,
  hasRole([UserRole.canteen_staff, UserRole.school_admin]),
];

/**
 * @swagger
 * /api/pos/items:
 *   post:
 *     summary: Add a new item to the canteen menu
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, price, category]
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *     responses:
 *       "201":
 *         description: Canteen item added successfully
 */
router.post('/items', adminActions, addCanteenItem);

/**
 * @swagger
 * /api/pos/orders:
 *   post:
 *     summary: Create a new purchase order from the canteen
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, itemIds]
 *             properties:
 *               studentId:
 *                 type: string
 *                 format: uuid
 *               itemIds:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     quantity:
 *                       type: integer
 *     responses:
 *       "201":
 *         description: Order created successfully
 *       "402":
 *         description: Insufficient wallet balance
 *       "404":
 *         description: Student not found
 */
router.post('/orders', staffActions, createPosOrder);

module.exports = router;
