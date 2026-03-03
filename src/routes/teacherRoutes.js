/**
 * src/routes/teacherRoutes.js
 *
 * Dedicated routes for the authenticated teacher's own scope:
 *   - GET /api/teacher/classes                        → assigned classes only
 *   - GET /api/teacher/classes/:classId/students      → students in assigned class
 *   - GET /api/teacher/exams                          → exam schedules for assigned classes
 *   - GET /api/teacher/exams/:scheduleId              → schedule detail (403 if not assigned)
 */

const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { authMiddleware, hasRole, belongsToSchool } = require('../middleware/authMiddleware');
const { UserRole } = require('@prisma/client');
const { ok, fail } = require('../utils/response');
const { cachePrivate } = require('../middleware/cacheHeaders');
const { assertTeacherAssignedToClass, assertTeacherAssignedToSchedule } = require('../utils/teacherScope');
const prisma = require('../prismaClient');

const teacherOnly = [authMiddleware, hasRole([UserRole.teacher]), belongsToSchool];

// ── inline Zod helpers ──────────────────────────────────────────────────────

const examQuerySchema = z.object({
    classId: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
}).passthrough();

const scheduleIdSchema = z.object({ scheduleId: z.string().uuid() });

function validateQuery(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            return fail(res, 400, result.error.errors.map(e => e.message).join('; '), 'VALIDATION_ERROR');
        }
        next();
    };
}
function validateParams(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            return fail(res, 400, result.error.errors.map(e => e.message).join('; '), 'VALIDATION_ERROR');
        }
        next();
    };
}

// ── GET /api/teacher/classes ────────────────────────────────────────────────

router.get('/classes', teacherOnly, cachePrivate(30), async (req, res) => {
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    try {
        const assignments = await prisma.teacherSubjectAssignment.findMany({
            where: { teacherId, class: { academicYear: { schoolId } } },
            include: {
                class: {
                    select: {
                        id: true,
                        name: true,
                        defaultFee: true,
                        academicYear: { select: { id: true, name: true } },
                        _count: { select: { enrollments: true } }
                    }
                },
                subject: { select: { id: true, name: true } }
            }
        });

        const classMap = new Map();
        assignments.forEach(a => {
            if (a.class && !classMap.has(a.class.id)) {
                classMap.set(a.class.id, {
                    ...a.class,
                    _count: { students: a.class._count?.enrollments || 0 }
                });
            }
        });

        ok(res, Array.from(classMap.values()));
    } catch (error) {
        fail(res, 500, 'Failed to fetch teacher classes.', 'SERVER_ERROR');
    }
});

// ── GET /api/teacher/classes/:classId/students ──────────────────────────────

router.get('/classes/:classId/students', teacherOnly, cachePrivate(30), async (req, res) => {
    const { classId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        try { await assertTeacherAssignedToClass(req, classId); }
        catch (scopeErr) { return fail(res, scopeErr.statusCode || 403, scopeErr.message, scopeErr.code || 'TEACHER_NOT_ASSIGNED'); }

        const students = await prisma.student.findMany({
            where: { schoolId, enrollments: { some: { classId } } },
            select: {
                id: true, fullName: true, gender: true, dob: true,
                nfc_card_id: true, is_nfc_active: true, wallet_balance: true,
                parent: { select: { id: true, fullName: true, email: true } }
            },
            orderBy: { fullName: 'asc' }
        });

        ok(res, students);
    } catch (error) {
        fail(res, 500, 'Failed to fetch class students.', 'SERVER_ERROR');
    }
});

// ── GET /api/teacher/exams ──────────────────────────────────────────────────
/**
 * Returns exam schedules for all classes the teacher is assigned to.
 * Optional filters: classId, from (YYYY-MM-DD), to (YYYY-MM-DD), limit.
 */
router.get('/exams', teacherOnly, validateQuery(examQuerySchema), cachePrivate(30), async (req, res) => {
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;
    const { classId, from, to, limit: rawLimit } = req.query;
    const limit = Math.min(parseInt(rawLimit, 10) || 50, 200);

    try {
        // Resolve teacher's assigned classIds (scoped to school)
        const assignments = await prisma.teacherSubjectAssignment.findMany({
            where: { teacherId, class: { academicYear: { schoolId } } },
            select: { classId: true }
        });
        const assignedIds = [...new Set(assignments.map(a => a.classId))];
        if (assignedIds.length === 0) return ok(res, [], { limit });

        // If a specific classId is requested, verify it's assigned
        if (classId && !assignedIds.includes(classId)) {
            return fail(res, 403, 'You are not assigned to this class.', 'TEACHER_NOT_ASSIGNED');
        }

        const targetIds = classId ? [classId] : assignedIds;

        // Date range filter
        const dateWhere = {};
        if (from) dateWhere.gte = new Date(`${from}T00:00:00.000Z`);
        if (to) dateWhere.lte = new Date(`${to}T23:59:59.999Z`);

        const schedules = await prisma.examSchedule.findMany({
            where: {
                classId: { in: targetIds },
                ...(Object.keys(dateWhere).length ? { date: dateWhere } : {})
            },
            include: {
                exam: { select: { id: true, name: true } },
                class: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true } }
            },
            orderBy: { date: 'asc' },
            take: limit
        });

        const data = schedules.map(s => ({
            scheduleId: s.id,
            examId: s.exam.id,
            examName: s.exam.name,
            classId: s.class.id,
            className: s.class.name,
            subject: s.subject ? { id: s.subject.id, name: s.subject.name } : null,
            date: s.date,
            startTime: s.startTime,
            endTime: s.endTime,
            roomNo: s.roomNo ?? null
        }));

        ok(res, data, { limit });
    } catch (error) {
        fail(res, 500, 'Failed to fetch exam schedules.', 'SERVER_ERROR');
    }
});

// ── GET /api/teacher/exams/:scheduleId ─────────────────────────────────────
/**
 * Returns full schedule detail + class roster summary.
 * 403 TEACHER_NOT_ASSIGNED if the schedule belongs to an unassigned class.
 */
router.get('/exams/:scheduleId', teacherOnly, validateParams(scheduleIdSchema), cachePrivate(30), async (req, res) => {
    const { scheduleId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        // Teacher scope guard
        try { await assertTeacherAssignedToSchedule(req, scheduleId); }
        catch (scopeErr) { return fail(res, scopeErr.statusCode || 403, scopeErr.message, scopeErr.code || 'TEACHER_NOT_ASSIGNED'); }

        const schedule = await prisma.examSchedule.findFirst({
            where: { id: scheduleId },
            include: {
                exam: { select: { id: true, name: true, startDate: true, endDate: true } },
                class: { select: { id: true, name: true } },
                subject: { select: { id: true, name: true } }
            }
        });

        if (!schedule) return fail(res, 404, 'Exam schedule not found.', 'NOT_FOUND');

        // Class roster summary (students enrolled in the schedule's class, in this school)
        const enrollments = await prisma.studentEnrollment.findMany({
            where: {
                classId: schedule.classId,
                student: { schoolId }
            },
            include: { student: { select: { id: true, fullName: true } } },
            orderBy: { student: { fullName: 'asc' } }
        });

        ok(res, {
            schedule: {
                id: schedule.id,
                examId: schedule.exam.id,
                examName: schedule.exam.name,
                classId: schedule.class.id,
                className: schedule.class.name,
                subject: schedule.subject ? { id: schedule.subject.id, name: schedule.subject.name } : null,
                date: schedule.date,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                roomNo: schedule.roomNo ?? null
            },
            roster: enrollments.map(e => ({ id: e.student.id, fullName: e.student.fullName }))
        });
    } catch (error) {
        fail(res, 500, 'Failed to fetch exam schedule.', 'SERVER_ERROR');
    }
});

module.exports = router;

