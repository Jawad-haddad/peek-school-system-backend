// src/validators/userValidator.js

const { z } = require('zod');
const { UserRole } = require('@prisma/client');

// Schema defines the rules for the registration data
const registerUserSchema = z.object({
    body: z.object({
        fullName: z.string({
            required_error: 'Full name is required',
        }).min(3, 'Full name must be at least 3 characters long'),

        email: z.string({
            required_error: 'Email is required',
        }).email('Invalid email address'),

        password: z.string({
            required_error: 'Password is required',
        }).min(8, 'Password must be at least 8 characters long'),

        role: z.nativeEnum(UserRole, {
            errorMap: () => ({ message: 'Invalid user role provided' }),
        }),

        schoolId: z.string().uuid('Invalid school ID format').optional(),
    }),
});

// A generic middleware function to validate requests against a schema
// src/validators/userValidator.js

// src/validators/userValidator.js

const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (e) {
        // THE FIX: Zod's error array is named 'issues', not 'errors'.
        const formattedErrors = e.issues.map(err => ({
            field: err.path[err.path.length - 1],
            message: err.message
        }));

        return res.status(400).json({ 
            status: 'error',
            message: 'Invalid request data provided.',
            errors: formattedErrors
        });
    }
};
// Ensure both the schema and the validate function are exported correctly
module.exports = {
    registerUserSchema,
    validate,
};