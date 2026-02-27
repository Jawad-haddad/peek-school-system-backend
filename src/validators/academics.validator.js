const { z } = require('zod');

// ── Academic Years ──────────────────────────────────
const createAcademicYearSchema = z.object({
    name: z.string().min(1, 'Academic Year name is required'),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO start date string' }),
    endDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO end date string' }),
    isCurrent: z.boolean().optional(),
})
    .strict()
    .refine((data) => {
        // Only refine dates if they both parsed validly above
        if (!isNaN(Date.parse(data.startDate)) && !isNaN(Date.parse(data.endDate))) {
            return new Date(data.endDate) > new Date(data.startDate);
        }
        return true; // Skip this refine if previous validation failed to prevent double-messaging
    }, {
        message: "End date must be after start date",
        path: ["endDate"]
    });

const updateAcademicYearSchema = z.object({
    name: z.string().min(1, 'Academic Year name cannot be empty').optional(),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO start date string' }).optional(),
    endDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid ISO end date string' }).optional(),
    isCurrent: z.boolean().optional(),
})
    .strict()
    .refine((data) => {
        if (data.startDate && data.endDate) {
            if (!isNaN(Date.parse(data.startDate)) && !isNaN(Date.parse(data.endDate))) {
                return new Date(data.endDate) > new Date(data.startDate);
            }
        }
        return true;
    }, {
        message: "End date must be after start date",
        path: ["endDate"]
    });


// ── Classes ─────────────────────────────────────────
const createClassSchema = z.object({
    name: z.string().min(1, 'Class name is required').max(100),
    academicYearId: z.string().uuid('Invalid academicYearId format (UUID expected)'),
    defaultFee: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val >= 0, { message: 'defaultFee must be a positive number' })
        .optional(),
}).strict();

const updateClassSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    academicYearId: z.string().uuid('Invalid academicYearId format').optional(),
    defaultFee: z.union([z.number(), z.string().transform(Number)])
        .refine(val => val >= 0, { message: 'defaultFee must be a positive number' })
        .optional(),
}).strict();


// ── Subjects ────────────────────────────────────────
const createSubjectSchema = z.object({
    name: z.string().min(1, 'Subject name is required'),
    classId: z.string().uuid('Invalid classId format (UUID expected)'),
    code: z.string().optional(),
    teacherId: z.string().uuid('Invalid teacherId format (UUID expected)').optional()
}).strict();

const updateSubjectSchema = z.object({
    name: z.string().min(1, 'Subject name cannot be empty').optional(),
    classId: z.string().uuid('Invalid classId format').optional(),
    code: z.string().optional(),
    teacherId: z.string().uuid('Invalid teacherId format').optional().or(z.null())
}).strict();

module.exports = {
    createAcademicYearSchema,
    updateAcademicYearSchema,
    createClassSchema,
    updateClassSchema,
    createSubjectSchema,
    updateSubjectSchema
};
