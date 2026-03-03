/**
 * src/validators/homework.validator.js
 *
 * Zod schemas for Homework CRUD endpoints.
 */

const { z } = require('zod');

const createHomeworkSchema = z.object({
    classId: z.string().uuid(),
    subjectId: z.string().uuid(),
    title: z.string().min(1, 'Title is required').max(200),
    description: z.string().max(2000).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'dueDate must be YYYY-MM-DD or ISO date'),
    maxPoints: z.number().int().min(0).optional()
}).strict();

const updateHomeworkSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'dueDate must be YYYY-MM-DD or ISO date').optional(),
    maxPoints: z.number().int().min(0).optional()
}).strict();

const homeworkQuerySchema = z.object({
    classId: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).optional(),
    page: z.coerce.number().int().min(1).optional()
}).passthrough();

const homeworkIdParamSchema = z.object({
    homeworkId: z.string().uuid()
});

module.exports = {
    createHomeworkSchema,
    updateHomeworkSchema,
    homeworkQuerySchema,
    homeworkIdParamSchema
};
