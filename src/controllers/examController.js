const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');

// 1. Exam Management

const createExam = async (req, res) => {
    const schoolId = req.user.schoolId;
    // Log payload for debugging


    const { name, date, startTime, endTime, startDate } = req.body; // Added startDate fallback support

    if (!name) {
        return res.status(400).json({ message: "Exam name is required." });
    }

    try {
        let startDateTime, endDateTime;

        // Strategy 1: separate date + time (Preferred by Frontend now)
        if (date && startTime && endTime) {
            startDateTime = new Date(`${date}T${startTime}`);
            endDateTime = new Date(`${date}T${endTime}`);
        }
        // Strategy 2: Legacy startDate/endDate (Fallback)
        else if (startDate && req.body.endDate) {
            startDateTime = new Date(startDate);
            endDateTime = new Date(req.body.endDate);
        } else {
            return res.status(400).json({ message: "Date, startTime, and endTime are required." });
        }

        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            return res.status(400).json({ message: "Invalid date or time format." });
        }

        if (startDateTime >= endDateTime) {
            return res.status(400).json({ message: "End time must be after start time." });
        }

        const exam = await prisma.exam.create({
            data: {
                name,
                startDate: startDateTime,
                endDate: endDateTime,
                schoolId
            }
        });
        res.status(201).json(exam);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "An exam with this name already exists." });
        }
        logger.error({ error, schoolId }, "Error creating exam");
        res.status(500).json({ message: "Failed to create exam." });
    }
};

const createExamSchedule = async (req, res) => {
    const { examId, classId, subjectId, date, startTime, endTime, roomNo } = req.body;

    if (!examId || !classId || !subjectId || !date || !startTime || !endTime) {
        return res.status(400).json({ message: "All schedule fields are required." });
    }

    try {
        const schedule = await prisma.examSchedule.create({
            data: {
                examId,
                classId,
                subjectId,
                date: new Date(date),
                startTime,
                endTime,
                roomNo
            }
        });
        res.status(201).json(schedule);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "Schedule conflict: Exam already scheduled for this class/subject." });
        }
        logger.error({ error, examId }, "Error scheduling exam");
        res.status(500).json({ message: "Failed to schedule exam." });
    }
};

// 2. Grade Entry (Bulk)

const submitBulkMarks = async (req, res) => {
    // Support both params (new route) and body (legacy/direct)
    const examScheduleId = req.params.scheduleId || req.body.examScheduleId;
    const { marks } = req.body; // marks: [{ studentId, marksObtained, comments }]

    if (!examScheduleId || !Array.isArray(marks)) {
        return res.status(400).json({ message: "examScheduleId and marks array are required." });
    }

    try {
        // Fetch Schedule details for notification context
        const schedule = await prisma.examSchedule.findUnique({
            where: { id: examScheduleId },
            include: { subject: { select: { name: true } } }
        });

        if (!schedule) {
            return res.status(404).json({ message: "Exam schedule not found." });
        }

        const subjectName = schedule.subject.name;
        const notificationPromises = [];
        const upsertOperations = [];

        for (const entry of marks) {
            const { studentId, marksObtained, comments } = entry;

            // Upsert Mark
            upsertOperations.push(
                prisma.examMark.upsert({
                    where: {
                        examScheduleId_studentId: {
                            examScheduleId,
                            studentId
                        }
                    },
                    update: { marksObtained, comments },
                    create: { examScheduleId, studentId, marksObtained, comments }
                })
            );

            // Queue Notification (Optimize: batch fetch parents if needed, but per-loop is okay for typical class sizes)
            notificationPromises.push((async () => {
                const student = await prisma.student.findUnique({
                    where: { id: studentId },
                    select: { parentId: true, fullName: true }
                });

                if (student && student.parentId) {
                    await sendNotification({
                        userId: student.parentId,
                        title: 'New Grade Published',
                        body: `New grades published for ${subjectName}. Check ${student.fullName}'s results.`,
                        data: { screen: 'ExamResults', examScheduleId },
                        preferenceType: 'academic'
                    });
                }
            })());
        }

        // Execute DB updates transactionally
        await prisma.$transaction(upsertOperations);

        // Send notifications asynchronously
        Promise.allSettled(notificationPromises).then(results => {
            // Optional: Log failures
        });

        logger.info({ examScheduleId, count: marks.length }, "Bulk marks submitted");
        res.status(200).json({ message: "Marks submitted successfully." });

    } catch (error) {
        logger.error({ error, examScheduleId }, "Error submitting bulk marks");
        res.status(500).json({ message: "Failed to submit marks." });
    }
};

// 3. Parent Report

const getStudentGrades = async (req, res) => {
    const { studentId } = req.params;

    // Security check: verify parent owns student (if needed, dependent on middleware)

    try {
        const marks = await prisma.examMark.findMany({
            where: { studentId },
            include: {
                examSchedule: {
                    include: {
                        exam: { select: { name: true } },
                        subject: { select: { name: true } }
                    }
                }
            },
            orderBy: {
                examSchedule: { date: 'desc' }
            }
        });

        // Group by Exam Name
        // Structure: { "Midterm Spring 2026": [ { subject: "Math", mark: 90, ... }, ... ] }
        const grouped = marks.reduce((acc, curr) => {
            const examName = curr.examSchedule.exam.name;
            if (!acc[examName]) {
                acc[examName] = [];
            }
            acc[examName].push({
                subject: curr.examSchedule.subject.name,
                marksObtained: curr.marksObtained,
                comments: curr.comments,
                date: curr.examSchedule.date
            });
            return acc;
        }, {});

        res.status(200).json(grouped);

    } catch (error) {
        logger.error({ error, studentId }, "Error fetching student grades");
        res.status(500).json({ message: "Failed to fetch grades." });
    }
};

const getExamSchedules = async (req, res) => {
    const { examId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const schedules = await prisma.examSchedule.findMany({
            where: { examId },
            include: {
                subject: { select: { name: true } },
                class: { select: { name: true } }
            },
            orderBy: { date: 'asc' }
        });
        res.status(200).json(schedules);
    } catch (error) {
        logger.error({ error, examId }, "Error fetching exam schedules");
        res.status(500).json({ message: "Failed to fetch exam schedules." });
    }
};

const getAllExams = async (req, res) => {
    const schoolId = req.user.schoolId;
    if (!schoolId) {
        return res.status(400).json({ message: "School ID is missing from user context." });
    }
    try {
        const exams = await prisma.exam.findMany({
            where: { schoolId },
            include: {
                school: true,
                schedules: true
            },
            orderBy: { startDate: 'desc' }
        });



        // Return empty array instead of null/undefined if something goes weird, though findMany returns []
        res.status(200).json(exams || []);
    } catch (error) {
        logger.error({ error, schoolId }, "Error fetching exams");
        // Return empty array on error? No, 500 is appropriate for DB error, but user asked to not crash.
        // "return a clean JSON empty list [] instead of crashing if no exams are found."
        // Prisma findMany returns [] if no exams found, so 500 only happens on connection error.
        // I will keep 500 for connection errors but ensure the logic above is safe.
        res.status(500).json({ message: "Failed to fetch exams." });
    }
};

const updateExam = async (req, res) => {
    const { examId } = req.params;
    const schoolId = req.user.schoolId;
    const { name, startDate, endDate } = req.body;

    try {
        const exam = await prisma.exam.findFirst({ where: { id: examId, schoolId } });
        if (!exam) {
            return res.status(404).json({ message: "Exam not found." });
        }

        const dataToUpdate = {};
        if (name) dataToUpdate.name = name;
        if (startDate) dataToUpdate.startDate = new Date(startDate);
        if (endDate) dataToUpdate.endDate = new Date(endDate);

        const updatedExam = await prisma.exam.update({
            where: { id: examId },
            data: dataToUpdate
        });

        res.status(200).json(updatedExam);
    } catch (error) {
        logger.error({ error, examId }, "Error updating exam");
        res.status(500).json({ message: "Failed to update exam." });
    }
};

const deleteExam = async (req, res) => {
    const { examId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const exam = await prisma.exam.findFirst({ where: { id: examId, schoolId } });
        if (!exam) {
            return res.status(404).json({ message: "Exam not found." });
        }

        await prisma.exam.delete({ where: { id: examId } });
        res.status(204).send();
    } catch (error) {
        logger.error({ error, examId }, "Error deleting exam");
        res.status(500).json({ message: "Failed to delete exam." });
    }
};

module.exports = {
    createExam,
    createExamSchedule,
    submitBulkMarks,
    getStudentGrades,
    getAllExams,
    getAllExams,
    getExamSchedules,
    updateExam,
    deleteExam
};
