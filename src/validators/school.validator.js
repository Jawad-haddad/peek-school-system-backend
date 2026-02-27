const { z } = require('zod');
const { UserRole } = require('@prisma/client');

const createStudentSchema = z.object({
    fullName: z.string().min(1, 'Student Name is required'),
    classId: z.string().uuid('Invalid basic class format (UUID expected)'),
    // Explicitly forbidding client from setting schoolId directly
    schoolId: z.undefined().or(z.null()).optional(),
}).passthrough(); // Allow other fields like dob, parentEmail, etc.

const createTeacherSchema = z.object({
    fullName: z.string().min(1, 'Teacher Name is required'),
    email: z.string().email('Invalid teacher email address'),
    // Explicitly forbidding client from setting schoolId
    schoolId: z.undefined().or(z.null()).optional(),
}).passthrough();

module.exports = {
    createStudentSchema,
    createTeacherSchema,
};
