// src/controllers/parentController.js

const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');

/**
 * GET /api/parent/attendance/:studentId?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns attendance records and a summary for the parent's own child.
 * Security:
 *   - authMiddleware + hasRole([parent]) applied at the route level
 *   - Ownership: student.parentId must equal req.user.id
 *   - Tenant:    student.schoolId must match req.user.schoolId (when present)
 */
const getChildAttendance = async (req, res) => {
    const { studentId } = req.params;
    const { from, to } = req.query;

    try {
        // 1. Look up student
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, parentId: true, schoolId: true },
        });

        if (!student) {
            return fail(res, 404, 'Student not found.', 'NOT_FOUND');
        }

        // 2. Ownership check — parent can only view their own child
        if (student.parentId !== req.user.id) {
            return fail(res, 403, 'Forbidden: you can only view attendance for your own child.', 'FORBIDDEN_PARENT');
        }

        // 3. Tenant check — school must match when the user is scoped to a school
        if (req.user.schoolId && student.schoolId !== req.user.schoolId) {
            return fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        }

        // 4. Date range (default: last 14 days)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const now = new Date();
        let fromDate, toDate;

        if (from && dateRegex.test(from)) {
            fromDate = new Date(`${from}T00:00:00.000Z`);
        } else {
            fromDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 14));
        }

        if (to && dateRegex.test(to)) {
            toDate = new Date(`${to}T23:59:59.999Z`);
        } else {
            toDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
        }

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return fail(res, 400, 'Invalid date values.', 'VALIDATION_ERROR');
        }

        // 5. Query attendance records
        const records = await prisma.attendance.findMany({
            where: {
                studentId,
                date: { gte: fromDate, lte: toDate },
            },
            select: {
                id: true,
                date: true,
                status: true,
                reason: true,
            },
            orderBy: { date: 'desc' },
        });

        // 6. Compute summary
        const summary = { present: 0, absent: 0, late: 0, excused: 0, totalDays: records.length };
        for (const r of records) {
            if (summary[r.status] !== undefined) {
                summary[r.status]++;
            }
        }

        ok(res, { records, summary });

    } catch (error) {
        logger.error({ error, studentId }, 'Error fetching child attendance');
        fail(res, 500, 'Failed to fetch attendance.', 'SERVER_ERROR');
    }
};

/**
 * GET /api/parent/invoices/:studentId
 *
 * Returns full invoice list for the parent's own child.
 * Security: same ownership + tenant pattern as getChildAttendance.
 */
const getChildInvoices = async (req, res) => {
    const { studentId } = req.params;

    try {
        // 1. Look up student
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { id: true, parentId: true, schoolId: true },
        });

        if (!student) {
            return fail(res, 404, 'Student not found.', 'NOT_FOUND');
        }

        // 2. Ownership check
        if (student.parentId !== req.user.id) {
            return fail(res, 403, 'Forbidden: you can only view invoices for your own child.', 'FORBIDDEN_PARENT');
        }

        // 3. Tenant check
        if (req.user.schoolId && student.schoolId !== req.user.schoolId) {
            return fail(res, 403, 'Access denied: resource belongs to another school.', 'TENANT_FORBIDDEN');
        }

        // 4. Query invoices
        const invoices = await prisma.invoice.findMany({
            where: { studentId },
            include: {
                feeStructure: { select: { name: true } },
                payments: {
                    select: { id: true, amount: true, paymentDate: true, method: true },
                    orderBy: { paymentDate: 'desc' },
                },
            },
            orderBy: { issueDate: 'desc' },
        });

        ok(res, { invoices });

    } catch (error) {
        logger.error({ error, studentId }, 'Error fetching child invoices');
        fail(res, 500, 'Failed to fetch invoices.', 'SERVER_ERROR');
    }
};

module.exports = { getChildAttendance, getChildInvoices };
