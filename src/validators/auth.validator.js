const { z } = require('zod');

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

const verify2FASchema = z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().min(6, 'Verification code must be at least 6 characters'),
});

module.exports = {
    loginSchema,
    verify2FASchema,
};
