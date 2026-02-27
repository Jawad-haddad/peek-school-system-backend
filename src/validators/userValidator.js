// src/validators/userValidator.js
const { z } = require('zod');
const { fail } = require('../utils/response');

const registerUserSchema = z.object({
    fullName: z.string()
        .min(2, 'Full name must be at least 2 characters')
        .max(100, 'Full name must be less than 100 characters'),
    email: z.string()
        .email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password must be less than 128 characters'),
    role: z.string()
        .optional(),
    schoolId: z.string()
        .uuid('Invalid school ID format')
        .optional(),
});

const validate = (schema) => (req, res, next) => {
    try {
        schema.parse(req.body);
        next();
    } catch (e) {
        if (e instanceof z.ZodError) {
            const details = e.issues.map(issue => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', details);
        }
        next(e);
    }
};

const validateQuery = (schema) => (req, res, next) => {
    try {
        schema.parse(req.query);
        next();
    } catch (e) {
        if (e instanceof z.ZodError) {
            const details = e.issues.map(issue => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', details);
        }
        next(e);
    }
};

const validateParams = (schema) => (req, res, next) => {
    try {
        schema.parse(req.params);
        next();
    } catch (e) {
        if (e instanceof z.ZodError) {
            const details = e.issues.map(issue => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            return fail(res, 400, 'Validation failed', 'VALIDATION_ERROR', details);
        }
        next(e);
    }
};

module.exports = { validate, validateQuery, validateParams, registerUserSchema };