// src/validators/platform.validator.js
const { z } = require('zod');

const classSchema = z.object({
    name: z.string().min(1, 'Class name is required'),
    defaultFee: z.number().min(0).default(0),
});

const onboardSchoolSchema = z.object({
    school: z.object({
        name: z.string().min(1, 'School name is required'),
        city: z.string().optional(),
        phone: z.string().optional()
    }),
    admin: z.object({
        fullName: z.string().min(1, 'Admin full name is required'),
        email: z.string().email('Invalid admin email format'),
        password: z.string().min(8, 'Password must be at least 8 characters long')
    }),
    academicYear: z.object({
        name: z.string().min(1, 'Academic year name is required'),
        startDate: z.string().refine(val => !isNaN(Date.parse(val)), 'Invalid start date format'),
        endDate: z.string().refine(val => !isNaN(Date.parse(val)), 'Invalid end date format'),
        isCurrent: z.boolean().default(true)
    }),
    classes: z.array(classSchema).optional()
});

module.exports = {
    onboardSchoolSchema
};
