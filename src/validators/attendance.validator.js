const { z } = require('zod');

const validStatuses = ['present', 'absent', 'late', 'excused'];

const bulkAttendanceSchema = z.object({
    classId: z.string().uuid('Invalid class ID format'),
    date: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: 'Invalid ISO date string',
    }),
    records: z.array(z.object({
        studentId: z.string().uuid('Invalid student ID format'),
        status: z.string().refine((val) => validStatuses.includes(val.toLowerCase()), {
            message: "Status must be 'present', 'absent', 'late', or 'excused'",
        }),
    })).min(1, 'At least one attendance record is required'),
});

module.exports = {
    bulkAttendanceSchema,
};
