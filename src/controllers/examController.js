const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');

// 1. Exam Management

const createExam = async (req, res) => {
    const schoolId = req.user.schoolId;
    // New Inputs: date, startTime, endTime
    // Using 'date' as per prompt ("Inputs: date..."), previous code used 'examDate' in one version, 'date' in another.
    // The prompt explicitly says: "Inputs: date (YYYY-MM-DD)..."
    const { name, date, startTime, endTime } = req.body;

    if (!name || !date || !startTime || !endTime) {
        return res.status(400).json({ message: "Name, date, startTime, and endTime are required." });
    }

    try {
        // startDateTime = ISO string of date + startTime
        const startDateTime = new Date(`${date}T${startTime}`);
        const endDateTime = new Date(`${date}T${endTime}`);

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
    const { examScheduleId, marks } = req.body; // marks: [{ studentId, marksObtained, comments }]

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

module.exports = {
    createExam,
    createExamSchedule,
    submitBulkMarks,
    getStudentGrades
};
