// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    verifyTwoFactorCode, // <-- تم استيراد الدالة الجديدة
    getUserProfile,
    forgotPassword,
    resetPassword,
    registerDevice
} = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate, registerUserSchema } = require('../validators/userValidator');
const { loginLimiter } = require('../middleware/rateLimiter');

// Auth routes
router.post('/register', validate(registerUserSchema), registerUser);
router.post('/login', loginLimiter, loginUser);

// NEW Route for 2FA verification
router.post('/login/verify', loginLimiter, verifyTwoFactorCode);

// Password reset routes
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);

// Profile route
router.get('/me', authMiddleware, getUserProfile);

// Device registration route
router.post('/register-device', authMiddleware, registerDevice);

module.exports = router;