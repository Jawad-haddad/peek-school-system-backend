/**
 * src/validators/homeworkGrades.validator.js
 *
 * Zod schemas for homework grading endpoints.
 */

const { z } = require('zod');

/** params: { homeworkId } */
const gradeParamsSchema = z.object({
    homeworkId: z.string().uuid()
});

/** body: { grades: [ { studentId, grade, comment? } ] } */
const submitGradesSchema = z.object({
    grades: z.array(
        z.object({
            studentId: z.string().uuid(),
            grade: z.number({ invalid_type_error: 'grade must be a number' }).min(0),
            comment: z.string().max(1000).optional()
        }).strict()
    ).min(1, 'grades array must be non-empty')
}).strict();

module.exports = { gradeParamsSchema, submitGradesSchema };
