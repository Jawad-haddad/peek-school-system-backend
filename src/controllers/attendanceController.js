const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');
const { getTenant, tenantWhere } = require('../utils/tenant');

/**
 * Submits attendance for a whole class in bulk.
 * Upserts records to handle corrections.
 * Sends notifications for absent students.
 */
const submitClassAttendance = async (req, res) => {
    const { classId, date, records } = req.body;
    // Force schoolId from tenant — ignore any client-supplied schoolId
    const { schoolId } = getTenant(req);

    // --- Top-level shape validation ---
    if (!classId || typeof classId !== 'string') {
        return fail(res, 400, 'classId (string) is required.', 'VALIDATION_ERROR');
    }
    if (!date || typeof date !== 'string') {
        return fail(res, 400, 'date (string, YYYY-MM-DD) is required.', 'VALIDATION_ERROR');
    }
    if (!Array.isArray(records) || records.length === 0) {
        return fail(res, 400, 'records (non-empty array) is required.', 'VALIDATION_ERROR');
    }

    // --- Date validation (Strict YYYY-MM-DD + UTC Force) ---
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        return fail(res, 400, 'Invalid date format. Strictly use YYYY-MM-DD.', 'VALIDATION_ERROR');
    }
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);
    if (isNaN(attendanceDate.getTime())) {
        return fail(res, 400, 'Invalid date value.', 'VALIDATION_ERROR');
    }

    // --- Per-record validation ---
    const ALLOWED_STATUSES = ['present', 'absent', 'late', 'excused'];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        if (!record.studentId || typeof record.studentId !== 'string') {
            errors.push({ index: i, field: 'studentId', message: 'studentId (string) is required.' });
            continue;
        }

        if (!record.status || typeof record.status !== 'string') {
            errors.push({ index: i, field: 'status', message: 'status (string) is required.' });
            continue;
        }

        // Normalize to lowercase for casing tolerance
        const normalized = record.status.toLowerCase();
        if (!ALLOWED_STATUSES.includes(normalized)) {
            errors.push({
                index: i,
                field: 'status',
                message: `Invalid status "${record.status}". Allowed: ${ALLOWED_STATUSES.join(', ')}`
            });
            continue;
        }

        // Write normalized value back so downstream code uses lowercase
        record.status = normalized;
    }

    if (errors.length > 0) {
        return fail(res, 400, 'Validation failed for one or more records.', 'VALIDATION_ERROR', errors);
    }

    try {
        // 1. Validate Class belongs to tenant's school
        const classExists = await prisma.class.findFirst({
            where: { id: classId, academicYear: tenantWhere(req) }
        });
        if (!classExists) {
            return fail(res, 404, 'Class not found in your school.', 'NOT_FOUND');
        }

        const upsertOperations = [];
        const notificationPromises = [];

        // 2. Process Records — collect absent student IDs first for batch fetch
        const absentStudentIds = records
            .filter(r => r.status === 'absent')
            .map(r => r.studentId);

        // Batch-fetch all absent students in one query (eliminates N+1)
        let absentStudentsMap = new Map();
        if (absentStudentIds.length > 0) {
            const absentStudents = await prisma.student.findMany({
                where: { id: { in: absentStudentIds } },
                select: { id: true, parentId: true, fullName: true }
            });
            absentStudents.forEach(s => absentStudentsMap.set(s.id, s));
        }

        for (const record of records) {
            const { studentId, status, reason } = record;

            // Prepare Upsert Operation
            upsertOperations.push(
                prisma.attendance.upsert({
                    where: {
                        studentId_date: {
                            studentId: studentId,
                            date: attendanceDate
                        }
                    },
                    update: { status, reason },
                    create: { studentId, status, reason, date: attendanceDate }
                })
            );

            // Send notification for absent students using pre-fetched data
            if (status === 'absent') {
                const student = absentStudentsMap.get(studentId);
                if (student && student.parentId) {
                    notificationPromises.push(
                        sendNotification({
                            userId: student.parentId,
                            title: 'Attendance Alert',
                            body: `Your child, ${student.fullName}, was marked absent today (${date}).`,
                            data: { screen: 'AttendanceHistory', date: date },
                            preferenceType: 'academic'
                        })
                    );
                }
            }
        }

        // 3. Execute Database Operations Transactionally
        await prisma.$transaction(upsertOperations);

        // 4. Send Notifications asynchronously (don't block response)
        Promise.allSettled(notificationPromises).then(results => {
            // Log errors if any
            results.forEach(result => {
                if (result.status === 'rejected') {
                    logger.error({ error: result.reason }, "Failed to send specific attendance notification");
                }
            });
        });

        logger.info({ classId, date, count: records.length, userId: req.user.id, schoolId, audit: true, action: 'ATTENDANCE_BULK_SUBMIT' }, "Bulk attendance submitted successfully");
        ok(res, { savedCount: records.length, date, classId });

    } catch (error) {
        logger.error({ error, classId }, "Error submitting bulk attendance");
        fail(res, 500, 'Failed to submit attendance.', 'SERVER_ERROR');
    }
};

/**
 * Retrieves attendance records for a specific class and date.
 */
const getClassAttendance = async (req, res) => {
    const { classId } = req.params;
    const { date } = req.query;

    if (!classId || !date) {
        return fail(res, 400, 'Class ID and date query parameter are required.', 'VALIDATION_ERROR');
    }

    try {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return fail(res, 400, 'Invalid date format. Strictly use YYYY-MM-DD.', 'VALIDATION_ERROR');
        }
        const attendanceDate = new Date(`${date}T00:00:00.000Z`);
        if (isNaN(attendanceDate.getTime())) {
            return fail(res, 400, 'Invalid date value.', 'VALIDATION_ERROR');
        }

        // Tenant-scoped student query: only students from this school enrolled in this class
        const students = await prisma.student.findMany({
            where: tenantWhere(req, {
                enrollments: {
                    some: { classId }
                }
            }),
            select: {
                id: true,
                fullName: true,
                attendance: {
                    where: { date: attendanceDate },
                    select: { status: true, reason: true }
                }
            },
            orderBy: { fullName: 'asc' }
        });

        // Transform Data
        const result = students.map(student => {
            const record = student.attendance[0]; // Should be at most one due to unique constraint
            return {
                studentId: student.id,
                fullName: student.fullName,
                status: record ? record.status : null, // Null indicates not marked yet
                reason: record ? record.reason : null
            };
        });

        ok(res, result);

    } catch (error) {
        logger.error({ error, classId }, "Error fetching class attendance");
        fail(res, 500, 'Failed to fetch attendance.', 'SERVER_ERROR');
    }
};

module.exports = { submitClassAttendance, getClassAttendance };
