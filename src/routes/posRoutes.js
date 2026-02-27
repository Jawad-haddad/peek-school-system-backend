// src/routes/posRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
  createPosOrder,
  addCanteenItem,
  getCanteenItems,
  updateCanteenItem,
  deleteCanteenItem,
  verifyCard
} = require('../controllers/posController');
const { UserRole } = require('@prisma/client');
const { validate, validateParams } = require('../validators/userValidator');
const {
  createItemSchema, updateItemSchema, orderSchema,
  idParamSchema, nfcIdParamSchema
} = require('../validators/pos.validator');

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
  hasRole([UserRole.canteen_staff, UserRole.school_admin, UserRole.teacher]), // Added Teacher
];

// Open access for viewing items (Authenticated School Users)
const viewItemsActions = [
  authMiddleware,
  belongsToSchool
];

/**
 * @swagger
 * /api/pos/items:
 *   get:
 *     summary: Get all canteen items for the school
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: List of canteen items
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
router.get('/items', viewItemsActions, getCanteenItems);
router.get('/products', viewItemsActions, getCanteenItems); // Alias for Frontend consistency
router.post('/items', adminActions, validate(createItemSchema), addCanteenItem);

/**
 * @swagger
 * /api/pos/items/{id}:
 *   put:
 *     summary: Update a canteen item
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *               isAvailable:
 *                 type: boolean
 *     responses:
 *       "200":
 *         description: Item updated successfully
 *   delete:
 *     summary: Delete a canteen item
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Item deleted successfully
 */
router.put('/items/:id', adminActions, validateParams(idParamSchema), validate(updateItemSchema), updateCanteenItem);
router.delete('/items/:id', adminActions, validateParams(idParamSchema), deleteCanteenItem);

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
router.post('/orders', staffActions, validate(orderSchema), createPosOrder);

/**
 * @swagger
 * /api/pos/verify-card/{nfcId}:
 *   get:
 *     summary: Verify if an NFC card is valid and active for the school
 *     tags: [POS (Canteen)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nfcId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       "200":
 *         description: Card is valid
 *       "403":
 *         description: Card is frozen
 *       "404":
 *         description: Card not found or not in school
 */
router.get('/verify-card/:nfcId', staffActions, validateParams(nfcIdParamSchema), verifyCard);

module.exports = router;
