// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  verifyTwoFactorCode,
  getUserProfile,
  forgotPassword,
  resetPassword,
  registerDevice,
} = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate, registerUserSchema } = require('../validators/userValidator');
const { loginLimiter } = require('../middleware/rateLimiter');

/**
 * @swagger
 * tags:
 *   - name: Users & Auth
 *     description: User registration, login, and profile management
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users & Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - role
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               role:
 *                 type: string
 *                 enum: [parent, teacher]
 *     responses:
 *       "201":
 *         description: User registered successfully.
 *       "400":
 *         description: Invalid input data.
 *       "409":
 *         description: Email already exists.
 */
router.post('/register', validate(registerUserSchema), registerUser);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Users & Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       "200":
 *         description: Returns a JWT token for successful login, or a message if 2FA is required.
 *       "401":
 *         description: Invalid email or password.
 */
router.post('/login', loginLimiter, loginUser);

/**
 * @swagger
 * /api/users/login/verify:
 *   post:
 *     summary: Verify 2FA code to complete login
 *     tags: [Users & Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *     responses:
 *       "200":
 *         description: 2FA successful, returns a JWT token.
 *       "400":
 *         description: Invalid or expired verification code.
 */
router.post('/login/verify', loginLimiter, verifyTwoFactorCode);

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get the profile of the currently logged-in user
 *     tags: [Users & Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       "200":
 *         description: The user's profile information.
 *       "401":
 *         description: Not authorized, token failed or expired.
 */
router.get('/me', authMiddleware, getUserProfile);

router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/register-device', authMiddleware, registerDevice);

module.exports = router;
