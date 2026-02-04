const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');

/**
 * Submits attendance for a whole class in bulk.
 * Upserts records to handle corrections.
 * Sends notifications for absent students.
 */
const submitClassAttendance = async (req, res) => {
    const { classId, date, records } = req.body; // records: [{ studentId, status, reason }]
    const schoolId = req.user.schoolId;

    if (!classId || !date || !Array.isArray(records)) {
        return res.status(400).json({ message: "Class ID, date, and records array are required." });
    }

    try {
        // 1. Validate Class
        const classExists = await prisma.class.findFirst({
            where: { id: classId, academicYear: { schoolId } }
        });
        if (!classExists) {
            return res.status(404).json({ message: "Class not found in your school." });
        }

        const attendanceDate = new Date(date);
        const upsertOperations = [];
        const notificationPromises = [];

        // 2. Process Records
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

            // Check for Absent Notification Trigger
            if (status === 'absent') {
                // We need to fetch the student to get the parentId
                // Optimization: In a real high-throughput scenario, we'd fetch all students in one query beforehand.
                // For a class size < 40, individual fetches or a filtered list query is acceptable.
                // Let's queue a task to fetch and notify.
                notificationPromises.push(
                    (async () => {
                        const student = await prisma.student.findUnique({
                            where: { id: studentId },
                            select: { parentId: true, fullName: true }
                        });
                        if (student && student.parentId) {
                            await sendNotification({
                                userId: student.parentId,
                                title: 'Attendance Alert',
                                body: `Your child, ${student.fullName}, was marked absent today (${date}).`,
                                data: { screen: 'AttendanceHistory', date: date },
                                preferenceType: 'academic'
                            });
                        }
                    })()
                );
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
        res.status(200).json({ message: "Attendance submitted successfully." });

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
