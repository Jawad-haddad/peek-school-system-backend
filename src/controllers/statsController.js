const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { ok, fail } = require('../utils/response');
const { tenantWhere } = require('../utils/tenant');

const getFeeStats = async (req, res) => {
    try {
        // Level 1: School Level Total — tenant-scoped
        const totalStudents = await prisma.student.count({ where: tenantWhere(req) });

        const totalOutstanding = await prisma.student.aggregate({
            where: tenantWhere(req),
            _sum: {
                balance: true,
                totalFee: true,
                paid: true
            }
        });

        // Level 2: By Class — tenant-scoped
        const students = await prisma.student.findMany({
            where: tenantWhere(req),
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
                    outstandingAmount: 0
                });
            }

            const stats = classStatsMap.get(classId);
            stats.totalFee += parseFloat(student.totalFee || 0);
            stats.paid += parseFloat(student.paid || 0);
            stats.outstandingAmount += parseFloat(student.balance || 0);
        });

        const classBreakdown = Array.from(classStatsMap.values());

        ok(res, {
            schoolSummary: {
                totalStudents: totalStudents || 0,
                totalOutstanding: totalOutstanding._sum.balance || 0,
                totalFee: totalOutstanding._sum.totalFee || 0,
                totalPaid: totalOutstanding._sum.paid || 0
            },
            breakdown: classBreakdown
        });

    } catch (error) {
        logger.error({ error }, "Error fetching fee stats");
        fail(res, 500, 'Failed to fetch fee statistics.', 'SERVER_ERROR');
    }
};

const getStudentFees = async (req, res) => {
    const { classId } = req.params;

    try {
        const students = await prisma.student.findMany({
            where: tenantWhere(req, {
                enrollments: {
                    some: {
                        classId: classId,
                        academicYear: { current: true }
                    }
                }
            }),
            select: {
                id: true,
                fullName: true,
                totalFee: true,
                paid: true,
                balance: true
            },
            orderBy: {
                balance: 'desc'
            }
        });

        ok(res, students);

    } catch (error) {
        logger.error({ error, classId }, "Error fetching student fees");
        fail(res, 500, 'Failed to fetch student fees.', 'SERVER_ERROR');
    }
};

module.exports = {
    getFeeStats,
    getStudentFees
};
