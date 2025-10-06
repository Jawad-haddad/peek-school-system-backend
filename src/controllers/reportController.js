// src/controllers/reportController.js
const prisma = require('../prismaClient');
const logger = require('../config/logger');

/**
 * Generates a performance report for a single student.
 * Accessible by: school_admin, parent (of the student)
 */
const getStudentPerformanceReport = async (req, res) => {
    const { studentId } = req.params;
    const requestingUser = req.user;

    try {
        // Validation: Check if the student exists and if the user is authorized to view the report
        const student = await prisma.student.findUnique({ where: { id: studentId } });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        // Authorization check: Allow admin of the same school or the direct parent
        const isAdmin = requestingUser.role === 'school_admin' && requestingUser.schoolId === student.schoolId;
        const isParent = requestingUser.role === 'parent' && requestingUser.id === student.parentId;

        if (!isAdmin && !isParent) {
            return res.status(403).json({ message: "Forbidden: You are not authorized to view this report." });
        }

        // Run all data queries in parallel for efficiency
        const [homeworkGrades, examMarks] = await Promise.all([
            // 1. Get all homework grades for the student
            prisma.grade.findMany({
                where: { studentId },
                include: { homework: { include: { subject: { select: { name: true } } } } }
            }),
            // 2. Get all exam marks for the student
            prisma.examMark.findMany({
                where: { studentId },
                include: { examSchedule: { include: { exam: true, subject: true } } }
            })
        ]);

        const report = {
            studentInfo: {
                id: student.id,
                fullName: student.fullName,
            },
            homeworkGrades,
            examMarks
        };

        res.status(200).json(report);

    } catch (error) {
        logger.error({ error, studentId }, "Failed to generate student performance report");
        res.status(500).json({ message: "Failed to generate report." });
    }
};

module.exports = {
    getStudentPerformanceReport,
};