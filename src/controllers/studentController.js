const prisma = require('../prismaClient');

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
        // Check if NFC ID is already in use by ANY student (globally unique constraint in schema)
        // Schema says: nfc_card_id String? @unique
        // So checking global uniqueness is required (or let Prisma throw P2002)
        // However, we want a nice 409 message.

        const existing = await prisma.student.findUnique({
            where: { nfc_card_id }
        });

        if (existing && existing.id !== id) {
            return res.status(409).json({ message: "This NFC card is already assigned to another student." });
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
        console.error("Error updating NFC card:", error);
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

    // POS systems might authenticate as a general 'school_admin' or specific 'canteen_staff' role.
    // We should ideally filter by the logged-in user's schoolId to ensure they can't scan a card from another school if card IDs collide (though they are unique).
    // Given they are unique, finding by cardId is safe, but we must check schoolId.

    const schoolId = req.user.schoolId;

    try {
        const student = await prisma.student.findUnique({
            where: { nfc_card_id: cardId },
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
            return res.status(404).json({ message: "Card not registered." });
        }

        if (student.schoolId !== schoolId) {
            // Card exists but belongs to a different school (if we assume cardIds are unique across system)
            return res.status(404).json({ message: "Student not found in this school context." });
        }

        if (!student.is_nfc_active) {
            return res.status(403).json({ message: "This NFC card is deactivated." });
        }

        res.status(200).json(student);

    } catch (error) {
        console.error("Error fetching student by NFC:", error);
        res.status(500).json({ message: "Failed to fetch student." });
    }
};

/**
 * Retrieves children for a parent with detailed info.
 */
const getChildren = async (req, res) => {
    const parentId = req.user.id;
    try {
        const children = await prisma.student.findMany({
            where: { parentId },
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
        console.error("Error fetching children:", error);
        res.status(500).json({ message: "Failed to fetch children." });
    }
};

module.exports = { updateStudentNfc, getStudentByNfc, getChildren };

