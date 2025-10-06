const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');
const { UserRole } = require('@prisma/client');

// --- TEACHER & ADMIN CONTROLLERS ---

const createHomework = async (req, res) => {
    // This function is complete
    const { title, classId, subjectId, dueDate, description } = req.body;
    try {
        const homework = await prisma.homework.create({
            data: { title, description, classId, subjectId, dueDate: new Date(dueDate) },
            include: { subject: { select: { name: true } } }
        });
        const enrollments = await prisma.studentEnrollment.findMany({
            where: { classId: classId },
            select: { student: { select: { parentId: true } } }
        });
        const parentIds = [...new Set(enrollments.map(e => e.student.parentId))];
        parentIds.forEach(parentId => {
            if (parentId) {
                sendNotification({
                    userId: parentId,
                    title: 'New Homework Assigned',
                    body: `A new homework for ${homework.subject.name} titled "${homework.title}" has been assigned.`,
                    data: { homeworkId: homework.id, screen: 'HomeworkDetails' }
                });
            }
        });
        logger.info({ homeworkId: homework.id, classId, teacherId: req.user.id }, "New homework created");
        res.status(201).json(homework);
    } catch (error) {
        logger.error({ error, classId, teacherId: req.user.id }, "Error creating homework");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

const addGrade = async (req, res) => {
    // This function is complete
    const { homeworkId } = req.params;
    const { studentId, grade, comments } = req.body;
    try {
        const newGrade = await prisma.grade.create({
            data: { grade, comments, studentId, homeworkId },
        });
        logger.info({ gradeId: newGrade.id, studentId, homeworkId }, "Grade added successfully");
        res.status(201).json(newGrade);
    } catch (error) {
        logger.error({ error, studentId, homeworkId }, "Error adding grade");
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'A grade has already been submitted for this student for this homework.' });
        }
        res.status(500).json({ message: 'Failed to add grade.' });
    }
};

const recordAttendance = async (req, res) => {
     // This function is complete
    const { studentId, status, date, reason } = req.body;
    try {
        const attendanceRecord = await prisma.attendance.create({
            data: { studentId, status, date: new Date(date), reason },
        });
        logger.info({ studentId, status, date }, "Attendance recorded successfully");
        res.status(201).json(attendanceRecord);
    } catch (error) {
        logger.error({ error, studentId, status, date }, "Error recording attendance");
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Attendance for this student on this date has already been recorded.' });
        }
        res.status(500).json({ message: 'Failed to record attendance.' });
    }
};

const getMySchedule = async (req, res) => {
     // This function is complete
    const teacherId = req.user.id;
    try {
        const assignments = await prisma.teacherSubjectAssignment.findMany({
            where: { teacherId },
            include: {
                subject: { select: { name: true } },
                class: { select: { name: true } },
            },
        });
        res.status(200).json(assignments);
    } catch (error) {
        logger.error({ error, teacherId }, "Error fetching teacher schedule");
        res.status(500).json({ message: 'Failed to fetch schedule.' });
    }
};

const createExam = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { name, startDate, endDate } = req.body;
    if (!name || !startDate || !endDate) {
        return res.status(400).json({ message: 'Exam name, start date, and end date are required.' });
    }
    try {
        const exam = await prisma.exam.create({
            data: { name, startDate: new Date(startDate), endDate: new Date(endDate), schoolId }
        });
        logger.info({ examId: exam.id, schoolId }, "New exam created");
        res.status(201).json(exam);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: `An exam with the name "${name}" already exists in your school.` });
        }
        logger.error({ error, schoolId }, "Error creating exam");
        res.status(500).json({ message: 'Failed to create exam.' });
    }
};

const scheduleExam = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { examId, classId, subjectId, date, startTime, endTime, roomNo } = req.body;
    if (!examId || !classId || !subjectId || !date || !startTime || !endTime) {
        return res.status(400).json({ message: 'Exam ID, Class ID, Subject ID, date, start time, and end time are required.' });
    }
    try {
        const schedule = await prisma.examSchedule.create({
            data: { examId, classId, subjectId, date: new Date(date), startTime, endTime, roomNo }
        });
        logger.info({ examScheduleId: schedule.id, schoolId }, "New exam scheduled");
        res.status(201).json(schedule);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'This exam has already been scheduled for this class and subject.' });
        }
        logger.error({ error, schoolId }, "Error scheduling exam");
        res.status(500).json({ message: 'Failed to schedule exam.' });
    }
};



const addExamMarks = async (req, res) => {
    const { scheduleId } = req.params;
    const { studentId, marksObtained, comments } = req.body;
    if (!studentId || marksObtained === undefined) {
        return res.status(400).json({ message: 'Student ID and marks are required.' });
    }
    try {
        const mark = await prisma.examMark.upsert({
            where: { examScheduleId_studentId: { examScheduleId: scheduleId, studentId: studentId } },
            update: { marksObtained, comments },
            create: { examScheduleId: scheduleId, studentId, marksObtained, comments }
        });
        logger.info({ examMarkId: mark.id, studentId, scheduleId }, "Exam marks added/updated");
        res.status(201).json(mark);
    } catch (error) {
        logger.error({ error, studentId, scheduleId }, "Error adding exam marks");
        res.status(500).json({ message: 'Failed to add exam marks.' });
    }
};

const createTimeTableEntry = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { classId, subjectId, teacherId, dayOfWeek, startTime, endTime } = req.body;
    if (!classId || !subjectId || !teacherId || !dayOfWeek || !startTime || !endTime) {
        return res.status(400).json({ message: 'All fields are required.' });
    }
    try {
        const entry = await prisma.timeTableEntry.create({
            data: { classId, subjectId, teacherId, dayOfWeek, startTime, endTime, schoolId }
        });
        logger.info({ entryId: entry.id, classId, teacherId }, "New timetable entry created");
        res.status(201).json(entry);
    } catch (error) {
        logger.error({ error, classId, teacherId }, "Error creating timetable entry");
        res.status(500).json({ message: 'Failed to create timetable entry.' });
    }
};

// --- PARENT CONTROLLERS ---

const getHomeworkForStudent = async (req, res) => {
    // This function is complete
    const { studentId } = req.params;
    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, parentId: req.user.id },
            include: { enrollments: { where: { academicYear: { isActive: true } } } }
        });
        if (!student) { return res.status(403).json({ message: 'Forbidden: You are not the parent of this student.' }); }
        if (student.enrollments.length === 0) { return res.status(200).json([]); }
        const classId = student.enrollments[0].classId;
        const homework = await prisma.homework.findMany({
            where: { classId },
            orderBy: { dueDate: 'asc' },
            include: { subject: { select: { name: true } } }
        });
        res.status(200).json(homework);
    } catch (error) {
        logger.error({ error, studentId }, "Error getting homework for student");
        res.status(500).json({ message: 'Something went wrong.' });
    }
};

module.exports = {
    createHomework,
    getHomeworkForStudent,
    addGrade,
    recordAttendance,
    getMySchedule,
    createExam,
    scheduleExam,
    createTimeTableEntry,
    addExamMarks
};