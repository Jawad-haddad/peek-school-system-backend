const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { UserRole } = require('@prisma/client');

const sendMessage = async (req, res) => {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;

    if (!receiverId || !content) {
        return res.status(400).json({ message: 'Receiver ID and content are required.' });
    }

    try {
        const message = await prisma.message.create({
            data: {
                content,
                senderId,
                receiverId
            }
        });

        // Real-time socket emission could go here (if implemented)

        res.status(201).json(message);
    } catch (error) {
        logger.error({ error, senderId, receiverId }, "Error sending message");
        res.status(500).json({ message: 'Failed to send message.' });
    }
};

const getConversation = async (req, res) => {
    const { contactId } = req.params;
    const userId = req.user.id;

    try {
        // Robust check: Ensure contactId is valid (e.g. not null)
        if (!contactId) {
            return res.status(400).json({ message: "Contact ID is required." });
        }

        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    { senderId: userId, receiverId: contactId },
                    { senderId: contactId, receiverId: userId }
                ]
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        res.status(200).json(messages);
    } catch (error) {
        logger.error({ error, userId, contactId }, "Error fetching conversation");
        res.status(500).json({ message: 'Failed to fetch conversation.' });
    }
};

const getContacts = async (req, res) => {
    const userId = req.user.id;
    const role = req.user.role;
    const schoolId = req.user.schoolId;

    try {
        let contacts = [];

        if (role === UserRole.school_admin || role === UserRole.super_admin) {
            const allUsers = await prisma.user.findMany({
                where: { schoolId, isActive: true },
                select: { id: true, fullName: true, role: true }
            });
            contacts = allUsers.map(u => ({ ...u, type: u.role }));

        } else if (role === UserRole.parent) {
            const children = await prisma.student.findMany({
                where: { parentId: userId },
                select: {
                    enrollments: {
                        where: { academicYear: { current: true } },
                        select: {
                            class: {
                                select: {
                                    assignments: {
                                        select: {
                                            teacher: {
                                                select: { id: true, fullName: true, role: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const teachersMap = new Map();
            children.forEach(child => {
                child.enrollments.forEach(enrollment => {
                    enrollment.class.assignments.forEach(assignment => {
                        const teacher = assignment.teacher;
                        if (teacher) {
                            teachersMap.set(teacher.id, { ...teacher, type: 'TEACHER' });
                        }
                    });
                });
            });
            contacts = Array.from(teachersMap.values());

            // Add Admins
            const admins = await prisma.user.findMany({
                where: { schoolId, role: { in: [UserRole.school_admin, 'school_admin', 'ADMIN'] } },
                select: { id: true, fullName: true, role: true }
            });
            admins.forEach(admin => contacts.push({ ...admin, type: 'ADMIN' }));

        } else if (role === UserRole.teacher) {
            const assignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                select: {
                    class: {
                        select: {
                            enrollments: {
                                where: { academicYear: { current: true } },
                                select: {
                                    student: {
                                        select: {
                                            id: true,
                                            fullName: true,
                                            userId: true,
                                            parent: {
                                                select: { id: true, fullName: true, role: true }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const contactMap = new Map();
            assignments.forEach(assignment => {
                assignment.class.enrollments.forEach(enrollment => {
                    const student = enrollment.student;
                    if (student && student.userId) {
                        contactMap.set(student.userId, { id: student.userId, fullName: student.fullName, role: 'student', type: 'STUDENT' });
                    }
                    const parent = enrollment.student.parent;
                    if (parent) {
                        contactMap.set(parent.id, { ...parent, type: 'PARENT' });
                    }
                });
            });

            // Add Admins
            const admins = await prisma.user.findMany({
                where: { schoolId, role: { in: [UserRole.school_admin, 'school_admin', 'ADMIN'] } },
                select: { id: true, fullName: true, role: true }
            });
            admins.forEach(admin => contactMap.set(admin.id, { ...admin, type: 'ADMIN' }));

            contacts = Array.from(contactMap.values());

        } else if (role === 'student') {
            // STUDENT: Enrollment (Current) -> Class -> Teachers
            const studentProfile = await prisma.student.findFirst({ where: { userId: userId } });
            if (studentProfile) {
                const enrollment = await prisma.studentEnrollment.findFirst({
                    where: { studentId: studentProfile.id, academicYear: { current: true } },
                    include: {
                        class: {
                            include: {
                                assignments: {
                                    include: { teacher: { select: { id: true, fullName: true, role: true } } }
                                }
                            }
                        }
                    }
                });

                if (enrollment && enrollment.class) {
                    const teachersMap = new Map();
                    enrollment.class.assignments.forEach(assignment => {
                        if (assignment.teacher) {
                            teachersMap.set(assignment.teacher.id, { ...assignment.teacher, type: 'TEACHER' });
                        }
                    });
                    contacts = Array.from(teachersMap.values());
                }
            }
        }

        const formattedContacts = contacts.map(contact => ({
            id: contact.id,
            name: contact.fullName, // Map fullName to name
            role: contact.role,
            avatar: null,
            type: contact.type || contact.role
        }));

        res.status(200).json(formattedContacts);
    } catch (error) {
        // Even if error, return empty to prevent crash/frontend error if desired? 
        // User said: "If no contacts are found, return [] (empty array), NOT an error."
        // This usually applies to search results. For a database error, 500 is technically correct.
        // But if the user meant "Don't crash if contacts is undefined", I handled that.
        // I will keep 500 for actual DB errors, but ensure logic doesn't throw.
        logger.error({ error, userId }, "Error fetching contacts");
        res.status(500).json({ message: 'Failed to fetch contacts.' });
    }
};

module.exports = {
    sendMessage,
    getConversation,
    getContacts
};
