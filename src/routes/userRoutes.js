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
const { loginSchema, verify2FASchema } = require('../validators/mvpValidator');
const { loginLimiter } = require('../middleware/rateLimiter');

// Auth routes
router.post('/register', validate(registerUserSchema), registerUser);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and get JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       "200":
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     role: { type: string, enum: [ADMIN, TEACHER, PARENT] }
 *                     schoolId: { type: string, format: uuid, nullable: true }
 *       "401":
 *         description: Invalid credentials
 */
router.post('/login', loginLimiter, validate(loginSchema), loginUser);

/**
 * @swagger
 * /api/auth/login/verify:
 *   post:
 *     summary: Complete 2FA login verification
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code: { type: string }
 *     responses:
 *       "200":
 *         description: Login successful (same shape as /login)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     fullName: { type: string }
 *                     email: { type: string }
 *                     role: { type: string, enum: [ADMIN, TEACHER, PARENT] }
 *                     schoolId: { type: string, format: uuid, nullable: true }
 *       "400":
 *         description: Invalid or expired verification code
 */
router.post('/login/verify', loginLimiter, validate(verify2FASchema), verifyTwoFactorCode);

// Password reset routes
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', loginLimiter, resetPassword);

// Profile route
router.get('/me', authMiddleware, getUserProfile);

// Device registration route
router.post('/register-device', authMiddleware, registerDevice);

module.exports = router;