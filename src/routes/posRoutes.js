// src/routes/posRoutes.js

const express = require('express');
const router = express.Router();
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { createPosOrder, addCanteenItem } = require('../controllers/posController');
const { UserRole } = require('@prisma/client');

// Define middleware for routes accessible only by school admins
const adminActions = [
    authMiddleware,
    hasRole([UserRole.school_admin]),
];

// Route for admins to add new items to their canteen
router.post('/items', adminActions, addCanteenItem);

// Route for canteen staff or admins to create orders
router.post(
    '/orders', 
    [authMiddleware, hasRole([UserRole.canteen_staff, UserRole.school_admin])], 
    createPosOrder
);

module.exports = router;