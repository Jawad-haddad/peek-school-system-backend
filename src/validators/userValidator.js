// src/validators/userValidator.js
const { z } = require('zod');

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
        // M6 FIX: Guard against non-Zod errors
        if (e instanceof z.ZodError) {
            const errors = e.issues.map(issue => ({
                field: issue.path.join('.'),
                message: issue.message,
            }));
            return res.status(400).json({
                message: 'Validation failed',
                errors,
            });
        }
        // Re-throw unexpected errors to the global error handler
        next(e);
    }
};

module.exports = { validate, registerUserSchema };