const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');

/**
 * Submits attendance for a whole class in bulk.
 * Upserts records to handle corrections.
 * Sends notifications for absent students.
 */
const submitClassAttendance = async (req, res) => {
    const { classId, date, records } = req.body;
    const schoolId = req.user.schoolId;

    // --- Top-level shape validation ---
    if (!classId || typeof classId !== 'string') {
        return res.status(400).json({ message: "classId (string) is required." });
    }
    if (!date || typeof date !== 'string') {
        return res.status(400).json({ message: "date (string, YYYY-MM-DD) is required." });
    }
    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ message: "records (non-empty array) is required." });
    }

    // --- Date validation ---
    const attendanceDate = new Date(date);
    if (isNaN(attendanceDate.getTime())) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
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
        return res.status(400).json({ message: "Validation failed for one or more records.", errors });
    }

    try {
        // 1. Validate Class
        const classExists = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId } }
        });
        if (!classExists) {
            return res.status(404).json({ message: "Class not found in your school." });
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

        logger.info({ classId, date, count: records.length }, "Bulk attendance submitted successfully");
        res.status(200).json({ savedCount: records.length, date, classId });

    } catch (error) {
        logger.error({ error, classId }, "Error submitting bulk attendance");
        res.status(500).json({ message: "Failed to submit attendance." });
    }
};

/**
 * Retrieves attendance records for a specific class and date.
 */
const getClassAttendance = async (req, res) => {
    const { classId } = req.params;
    const { date } = req.query;
    const schoolId = req.user.schoolId;

    if (!classId || !date) {
        return res.status(400).json({ message: "Class ID and date query parameter are required." });
    }

    try {
        const attendanceDate = new Date(date);

        // 1. Fetch all students enrolled in the class (Active Academic Year assumed or current state)
        // We want to return the list of students + their attendance status (if any).
        // This gives the frontend the full "Grid" to view.

        const students = await prisma.student.findMany({
            where: {
                schoolId,
                enrollments: {
                    some: { classId }
                }
            },
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

        // 2. Transform Data
        // Flatten the structure: { id, name, status: 'present' | 'absent' | null, ... }
        const result = students.map(student => {
            const record = student.attendance[0]; // Should be at most one due to unique constraint
            return {
                studentId: student.id,
                fullName: student.fullName,
                status: record ? record.status : null, // Null indicates not marked yet
                reason: record ? record.reason : null
            };
        });

        res.status(200).json(result);

    } catch (error) {
        logger.error({ error, classId }, "Error fetching class attendance");
        res.status(500).json({ message: "Failed to fetch attendance." });
    }
};

module.exports = { submitClassAttendance, getClassAttendance };
