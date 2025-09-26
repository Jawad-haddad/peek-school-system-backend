// src/routes/userRoutes.js

const express = require('express');
const router = express.Router();
const { 
    registerUser, 
    loginUser, 
    getUserProfile, 
    forgotPassword, 
    resetPassword,
    registerDevice // <-- Import the new function
} = require('../controllers/userController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { validate, registerUserSchema } = require('../validators/userValidator');
const { loginLimiter } = require('../middleware/rateLimiter');

// Auth routes
router.post('/register', validate(registerUserSchema), registerUser);
router.post('/login', loginLimiter, loginUser);

// Password reset routes
router.post('/forgot-password', loginLimiter, forgotPassword);
router.post('/reset-password', resetPassword);

// Profile route
router.get('/me', authMiddleware, getUserProfile);

// Device registration route (must be authenticated)
router.post('/register-device', authMiddleware, registerDevice);

module.exports = router;