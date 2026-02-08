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

        if (role === UserRole.school_admin || role === UserRole.super_admin || role === 'ADMIN') {
            const allUsers = await prisma.user.findMany({
                where: { schoolId, isActive: true },
                select: { id: true, fullName: true, role: true }
            });
            contacts = allUsers.filter(u => u.id !== userId).map(u => ({ ...u, type: u.role, name: u.fullName }));

        } else if (role === UserRole.parent || role === 'PARENT') {
            // PARENT: Find my Kids -> Kid Enrollments -> Class -> TeacherAssignments -> Teachers
            const myKids = await prisma.student.findMany({
                where: { parentId: userId },
                select: { id: true }
            });
            const kidIds = myKids.map(k => k.id);

            const enrollments = await prisma.studentEnrollment.findMany({
                where: {
                    studentId: { in: kidIds },
                    academicYear: { current: true }
                },
                select: { classId: true }
            });
            const classIds = [...new Set(enrollments.map(e => e.classId))];

            if (classIds.length > 0) {
                const teacherMap = new Map();

                // 1. Check Assignments (Preferred)
                const assignments = await prisma.teacherSubjectAssignment.findMany({
                    where: { classId: { in: classIds } },
                    include: {
                        teacher: { select: { id: true, fullName: true, role: true } },
                        subject: { select: { name: true } }
                    }
                });

                assignments.forEach(a => {
                    if (a.teacher) {
                        teacherMap.set(a.teacher.id, {
                            id: a.teacher.id,
                            name: a.teacher.fullName,
                            role: a.teacher.role,
                            type: 'TEACHER',
                            subject: a.subject.name
                        });
                    }
                });

                // 2. Check Subjects directly (Fallback/Coverage)
                const subjects = await prisma.subject.findMany({
                    where: { classId: { in: classIds }, teacherId: { not: null } },
                    include: { teacher: { select: { id: true, fullName: true, role: true } } }
                });

                subjects.forEach(s => {
                    if (s.teacher && !teacherMap.has(s.teacher.id)) {
                        teacherMap.set(s.teacher.id, {
                            id: s.teacher.id,
                            name: s.teacher.fullName,
                            role: s.teacher.role,
                            type: 'TEACHER', // Derived from Role
                            subject: s.name
                        });
                    }
                });

                contacts = Array.from(teacherMap.values());
            }

            // Add Admins
            const admins = await prisma.user.findMany({
                where: { schoolId, role: { in: [UserRole.school_admin, 'school_admin'] } },
                select: { id: true, fullName: true, role: true }
            });
            admins.forEach(a => contacts.push({ ...a, name: a.fullName, type: 'ADMIN' }));

        } else if (role === UserRole.teacher || role === 'TEACHER') {
            // TEACHER: My Assignments -> Class -> Enrollments -> Students -> Parents
            const myAssignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                select: { classId: true }
            });
            const classIds = [...new Set(myAssignments.map(a => a.classId))];

            if (classIds.length > 0) {
                const classEnrollments = await prisma.studentEnrollment.findMany({
                    where: {
                        classId: { in: classIds },
                        academicYear: { current: true }
                    },
                    include: {
                        student: {
                            include: {
                                parent: { select: { id: true, fullName: true, role: true, email: true } },
                                user: { select: { id: true, fullName: true, role: true } }
                            }
                        }
                    }
                });

                const contactMap = new Map();
                classEnrollments.forEach(e => {
                    // Contact: Parent
                    if (e.student.parent) {
                        const p = e.student.parent;
                        contactMap.set(p.id, {
                            id: p.id,
                            name: p.fullName,
                            role: p.role,
                            type: 'PARENT',
                            description: `Parent of ${e.student.fullName}`
                        });
                    }
                    // Contact: Student (if user exists)
                    if (e.student.userId && e.student.user) {
                        const s = e.student.user;
                        contactMap.set(s.id, {
                            id: s.id,
                            name: s.fullName,
                            role: 'student',
                            type: 'STUDENT',
                            description: 'Student'
                        });
                    }
                });
                contacts = Array.from(contactMap.values());
            }

            // Add Admins
            const admins = await prisma.user.findMany({
                where: { schoolId, role: { in: [UserRole.school_admin, 'school_admin'] } },
                select: { id: true, fullName: true, role: true }
            });
            admins.forEach(a => contacts.push({ ...a, name: a.fullName, type: 'ADMIN' }));
        }

        res.status(200).json(contacts);
    } catch (error) {
        console.error("Error fetching contacts:", error);
        res.status(200).json([]); // Return empty list on error to prevent crash
    }
};

module.exports = {
    sendMessage,
    getConversation,
    getContacts
};
