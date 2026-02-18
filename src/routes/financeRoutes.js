// src/routes/financeRoutes.js
const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const {
    createFeeStructure, issueInvoice, recordPayment, topUpWallet
} = require('../controllers/financeController');
const { UserRole } = require('@prisma/client');

/**
 * @swagger
 * tags:
 *   - name: Finance
 *     description: APIs for managing financial operations like invoices, payments, and student wallets
 */

// Middleware for finance/admin users
const financeAdminActions = [authMiddleware, hasRole([UserRole.finance, UserRole.school_admin]), belongsToSchool];

/**
 * @swagger
 * /api/finance/fee-structures:
 *   post:
 *     summary: Create a new fee structure for a class
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               classId:
 *                 type: string
 *               description:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     amount:
 *                       type: number
 *     responses:
 *       "201":
 *         description: Fee structure created successfully
 */
router.post('/fee-structures', financeAdminActions, createFeeStructure);

/**
 * @swagger
 * /api/finance/invoices:
 *   post:
 *     summary: Issue a new invoice to a student
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               studentId:
 *                 type: string
 *               feeStructureId:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       "201":
 *         description: Invoice issued successfully
 */
router.post('/invoices', financeAdminActions, issueInvoice);

/**
 * @swagger
 * /api/finance/invoices/{invoiceId}/payments:
 *   post:
 *     summary: Record a payment for a specific invoice
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [card, cash, bank_transfer]
 *     responses:
 *       "201":
 *         description: Payment recorded successfully
 */
router.post('/invoices/:invoiceId/payments', financeAdminActions, recordPayment);

/**
 * @swagger
 * /api/finance/wallet/topup:
 *   post:
 *     summary: Add funds to a student's wallet
 *     tags: [Finance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               studentId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       "200":
 *         description: Wallet topped up successfully
 */
router.post('/wallet/topup', [authMiddleware, hasRole([UserRole.parent, UserRole.school_admin]), belongsToSchool], topUpWallet);

/**
 * @swagger
 * /api/finance/wallet/history/{studentId}:
 *   get:
 *     summary: Get wallet transaction history for a student
 *     tags: [Finance]
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
 *         description: Transaction history retrieved successfully
 *       "403":
 *         description: Access denied
 */
router.get('/wallet/:studentId/history', [authMiddleware, hasRole([UserRole.parent, UserRole.school_admin, UserRole.finance])], require('../controllers/financeController').getWalletHistory);

module.exports = router;
