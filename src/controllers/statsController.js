const prisma = require('../prismaClient');
const logger = require('../config/logger');

const getFeeStats = async (req, res) => {
    const schoolId = req.user.schoolId;

    try {
        // Level 1: School Level Total
        const totalStudents = await prisma.student.count({ where: { schoolId } });

        const totalOutstanding = await prisma.student.aggregate({
            where: { schoolId },
            _sum: {
                balance: true,
                totalFee: true,
                paid: true
            }
        });

        // Level 2: By Class
        const students = await prisma.student.findMany({
            where: { schoolId },
            select: {
                totalFee: true,
                paid: true,
                balance: true,
                enrollments: {
                    where: { academicYear: { current: true } },
                    select: { class: { select: { id: true, name: true } } }
                }
            }
        });

        // Group by Class
        const classStatsMap = new Map();

        students.forEach(student => {
            const enrollment = student.enrollments[0];
            const classId = enrollment?.class?.id || 'Unassigned';
            const className = enrollment?.class?.name || 'Unassigned';

            if (!classStatsMap.has(classId)) {
                classStatsMap.set(classId, {
                    classId,
                    className,
                    totalFee: 0,
                    paid: 0,
                    outstandingAmount: 0 // balance
                });
            }

            const stats = classStatsMap.get(classId);
            stats.totalFee += parseFloat(student.totalFee || 0);
            stats.paid += parseFloat(student.paid || 0);
            stats.outstandingAmount += parseFloat(student.balance || 0);
        });

        const classBreakdown = Array.from(classStatsMap.values());



        res.status(200).json({
            schoolSummary: {
                totalStudents: totalStudents || 0,
                totalOutstanding: totalOutstanding._sum.balance || 0,
                totalFee: totalOutstanding._sum.totalFee || 0,
                totalPaid: totalOutstanding._sum.paid || 0
            },
            breakdown: classBreakdown
        });

    } catch (error) {
        logger.error({ error, schoolId }, "Error fetching fee stats");
        res.status(500).json({ message: "Failed to fetch fee statistics." });
    }
};

const getStudentFees = async (req, res) => {
    const schoolId = req.user.schoolId;
    const { classId } = req.params;

    try {
        const students = await prisma.student.findMany({
            where: {
                schoolId,
                enrollments: {
                    some: {
                        classId: classId,
                        academicYear: { current: true }
                    }
                }
            },
            select: {
                id: true,
                fullName: true,
                totalFee: true,
                paid: true,
                balance: true
            },
            orderBy: {
                balance: 'desc' // Sort by balance descending
            }
        });

        res.status(200).json(students);

    } catch (error) {
        logger.error({ error, schoolId, classId }, "Error fetching student fees");
        res.status(500).json({ message: "Failed to fetch student fees." });
    }
};

module.exports = {
    getFeeStats,
    getStudentFees
};
