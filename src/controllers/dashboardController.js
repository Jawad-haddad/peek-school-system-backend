// src/controllers/dashboardController.js
const prisma = require('../prismaClient');
const logger = require('../config/logger');

const getAdminStats = async (req, res) => {
    const schoolId = req.user.schoolId;
    if (!schoolId) {
        return res.status(403).json({ message: "Forbidden: Not associated with a school." });
    }

    try {
        // Run all database queries in parallel for maximum efficiency
        const [studentCount, teacherCount, totalRevenue, classCount] = await Promise.all([
            // Count total students in the school
            prisma.student.count({ where: { schoolId } }),

            // Count total teachers in the school
            prisma.user.count({ where: { schoolId, role: 'teacher' } }),

            // Calculate total revenue from all successful payments
            prisma.payment.aggregate({
                _sum: { amount: true },
                where: { invoice: { student: { schoolId } } }
            }),

            // Count total active classes
            prisma.class.count({ where: { academicYear: { schoolId, current: true } } })
        ]);

        const stats = {
            students: studentCount,
            teachers: teacherCount,
            revenue: totalRevenue._sum.amount || 0,
            classes: classCount
        };

        res.status(200).json(stats);

    } catch (error) {
        logger.error({ error, schoolId }, "Failed to fetch admin dashboard stats");
        res.status(500).json({ message: "Failed to fetch dashboard statistics." });
    }
};

module.exports = {
    getAdminStats,
};