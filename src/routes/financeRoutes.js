const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { 
    createFeeStructure, 
    issueInvoice, 
    recordPayment,
    topUpWallet // Ensure this is imported
} = require('../controllers/financeController');
const { UserRole } = require('@prisma/client');

// --- Parent Routes ---
router.post('/wallet/topup', [authMiddleware, hasRole([UserRole.parent])], topUpWallet);

// --- Finance & Admin Routes ---
const financeAdminActions = [
    authMiddleware,
    hasRole([UserRole.finance, UserRole.school_admin])
];
router.post('/fee-structures', financeAdminActions, createFeeStructure);
router.post('/invoices', financeAdminActions, issueInvoice);
router.post('/invoices/:invoiceId/payments', financeAdminActions, recordPayment);

module.exports = router;