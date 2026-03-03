// src/routes/platformRoutes.js
const express = require('express');
const router = express.Router();

const { onboardSchool } = require('../controllers/platformController');
const { authMiddleware, hasRole } = require('../middleware/authMiddleware');
const { validate } = require('../validators/userValidator'); // Use standard validator wrapper
const { onboardSchoolSchema } = require('../validators/platform.validator');

// Must be super_admin to execute onboarding operations
router.post(
    '/onboard-school',
    authMiddleware,
    hasRole(['super_admin']),
    validate(onboardSchoolSchema),
    onboardSchool
);

module.exports = router;
