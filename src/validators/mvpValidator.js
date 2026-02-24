// src/validators/mvpValidator.js
// Zod schemas for MVP endpoint request validation.
// Uses the same `validate` middleware pattern from userValidator.js.

const { z } = require('zod');

// ── Auth ──────────────────────────────────────────
const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

const verify2FASchema = z.object({
    email: z.string().email('Invalid email address'),
    code: z.string().min(1, 'Verification code is required'),
});

// ── Classes ───────────────────────────────────────
const createClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').max(100),
    academicYearId: z.string().uuid('Invalid academicYearId format'),
    defaultFee: z.union([z.number(), z.string().transform(Number)]).optional(),
});

const updateClassSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    academicYearId: z.string().uuid('Invalid academicYearId format').optional(),
    defaultFee: z.union([z.number(), z.string().transform(Number)]).optional(),
});

module.exports = {
    loginSchema,
    verify2FASchema,
    createClassSchema,
    updateClassSchema,
};
