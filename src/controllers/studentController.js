const prisma = require('../prismaClient');
const logger = require('../config/logger');

/**
 * Updates a student's NFC card ID.
 * Helper for linking physical cards to digital student profiles.
 */
const updateStudentNfc = async (req, res) => {
    const { id } = req.params; // Student ID
    const { nfc_card_id } = req.body;
    const schoolId = req.user.schoolId;

    if (!nfc_card_id) {
        return res.status(400).json({ message: "nfc_card_id is required." });
    }

    try {
        // Check if NFC ID is already in use within this school (FIX-2: Multi-tenant NFC)
        // Schema constraint: @@unique([schoolId, nfc_card_id])
        const existing = await prisma.student.findFirst({
            where: { nfc_card_id, schoolId }
        });

        if (existing && existing.id !== id) {
            return res.status(409).json({ message: "This NFC card is already assigned to another student in your school." });
        }

        // Verify student belongs to the school
        const student = await prisma.student.findFirst({
            where: { id, schoolId }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found in your school." });
        }

        const updatedStudent = await prisma.student.update({
            where: { id },
            data: { nfc_card_id, is_nfc_active: true }
        });

        res.status(200).json({
            message: "Student NFC card updated successfully.",
            student: { id: updatedStudent.id, nfc_card_id: updatedStudent.nfc_card_id }
        });

    } catch (error) {
        logger.error({ error: error.message }, "Error updating NFC card");
        // Fallback for race condition on unique constraint
        if (error.code === 'P2002') {
            return res.status(409).json({ message: "This NFC card is already assigned to another student." });
        }
        res.status(500).json({ message: "Failed to update NFC card." });
    }
};

/**
 * Retrieves a student by their NFC card ID.
 * Used by POS systems to identify students.
 */
const getStudentByNfc = async (req, res) => {
    const { cardId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const student = await prisma.student.findFirst({
            where: { nfc_card_id: cardId, schoolId },
            select: {
                id: true,
                fullName: true,
                wallet_balance: true,
                daily_spending_limit: true,
                is_nfc_active: true,
                schoolId: true
            }
        });

        if (!student) {
            return res.status(404).json({ message: "Card not registered or student not in this school." });
        }

        if (!student.is_nfc_active) {
            return res.status(403).json({ message: "This NFC card is deactivated." });
        }

        res.status(200).json(student);

    } catch (error) {
        logger.error({ error: error.message }, "Error fetching student by NFC");
        res.status(500).json({ message: "Failed to fetch student." });
    }
};

/**
 * Retrieves children for a parent with detailed info.
 */
const getChildren = async (req, res) => {
    const parentId = req.user.id;
    const schoolId = req.user.schoolId; // Optional: If parents are school-scoped

    try {
        const whereClause = { parentId };
        if (schoolId) {
            whereClause.schoolId = schoolId;
        }

        const children = await prisma.student.findMany({
            where: whereClause,
            include: {
                enrollments: {
                    where: { academicYear: { current: true } },
                    include: { class: { select: { name: true } } }
                },
                attendance: {
                    orderBy: { date: 'desc' },
                    take: 5 // Last 5 records for overview
                },
                grades: {
                    orderBy: {
                        homework: { dueDate: 'desc' }
                    },
                    take: 10,
                    include: {
                        homework: { include: { subject: { select: { name: true } } } }
                    }
                },
                invoices: {
                    orderBy: { issueDate: 'desc' },
                    take: 5
                },
                walletTxns: {
                    orderBy: { createdAt: 'desc' },
                    take: 5
                },
                school: { select: { name: true } }
            }
        });
        res.status(200).json(children);
    } catch (error) {
        logger.error({ error: error.message }, "Error fetching children");
        res.status(500).json({ message: "Failed to fetch children." });
    }
};

const getStudentById = async (req, res) => {
    const { studentId } = req.params;
    const schoolId = req.user.schoolId;

    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId },
            include: {
                parent: { select: { id: true, fullName: true, email: true, phoneNumber: true } },
                enrollments: {
                    where: { academicYear: { current: true } },
                    include: { class: { select: { id: true, name: true } } }
                }
            }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found." });
        }

        res.status(200).json(student);
    } catch (error) {
        logger.error({ error: error.message, studentId }, "Error fetching student details");
        res.status(500).json({ message: "Failed to fetch student details." });
    }
};

/**
 * Toggles the NFC active status for a student.
 */
const toggleStudentNfc = async (req, res) => {
    const { studentId } = req.params; // Note: usage in route might use :studentId or :id
    const { is_nfc_active } = req.body;
    const schoolId = req.user.schoolId;

    if (typeof is_nfc_active !== 'boolean') {
        return res.status(400).json({ message: "is_nfc_active must be a boolean." });
    }

    try {
        const student = await prisma.student.findFirst({
            where: { id: studentId, schoolId }
        });

        if (!student) {
            return res.status(404).json({ message: "Student not found in your school." });
        }

        const updatedStudent = await prisma.student.update({
            where: { id: studentId },
            data: { is_nfc_active }
        });

        res.status(200).json({
            message: `Student NFC ${is_nfc_active ? 'activated' : 'deactivated'} successfully.`,
            student: updatedStudent
        });

    } catch (error) {
        logger.error({ error: error.message }, "Error toggling NFC status");
        res.status(500).json({ message: "Failed to toggle NFC status." });
    }
};

module.exports = { updateStudentNfc, getStudentByNfc, getChildren, getStudentById, toggleStudentNfc };