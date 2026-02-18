const prisma = require('../prismaClient');
const logger = require('../config/logger');
const { UserRole } = require('@prisma/client');

const sendMessage = async (req, res) => {
    const { receiverId, content } = req.body;
    const senderId = req.user.id;
    const senderSchoolId = req.user.schoolId;

    if (!receiverId || !content) {
        return res.status(400).json({ message: 'Receiver ID and content are required.' });
    }

    try {
        // C7 FIX: Enforce school-scope isolation — users can only message within their school
        const receiver = await prisma.user.findUnique({
            where: { id: receiverId },
            select: { id: true, schoolId: true }
        });

        if (!receiver) {
            return res.status(404).json({ message: 'Receiver not found.' });
        }

        if (senderSchoolId && receiver.schoolId && senderSchoolId !== receiver.schoolId) {
            return res.status(403).json({ message: 'Cannot message users outside your school.' });
        }

        const message = await prisma.message.create({
            data: {
                content,
                senderId,
                receiverId
            }
        });

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

        // 1. ADMIN: Return ALL Teachers and ALL Parents
        if (role === UserRole.school_admin || role === UserRole.super_admin || role === 'ADMIN') {
            const allUsers = await prisma.user.findMany({
                where: {
                    schoolId,
                    isActive: true,
                    role: { in: [UserRole.teacher, UserRole.parent] }
                },
                select: { id: true, fullName: true, role: true }
            });
            contacts = allUsers.map(u => ({ ...u, type: u.role, name: u.fullName }));

            // 2. PARENT: See Teachers of their Children
        } else if (role === UserRole.parent || role === 'PARENT') {

            // Find Students -> Enrolled Classes
            const myKids = await prisma.student.findMany({
                where: { parentId: userId },
                select: {
                    fullName: true,
                    enrollments: {
                        where: { academicYear: { current: true } },
                        select: { classId: true }
                    }
                }
            });

            // Map ClassId -> Student Name(s)
            const classToStudentMap = new Map();
            myKids.forEach(kid => {
                kid.enrollments.forEach(enrollment => {
                    if (!classToStudentMap.has(enrollment.classId)) {
                        classToStudentMap.set(enrollment.classId, []);
                    }
                    classToStudentMap.get(enrollment.classId).push(kid.fullName);
                });
            });

            // Extract all class IDs
            const classIds = Array.from(classToStudentMap.keys());

            if (classIds.length > 0) {
                // Find Teachers assigned to these classes
                const assignments = await prisma.teacherSubjectAssignment.findMany({
                    where: { classId: { in: classIds } },
                    include: {
                        teacher: { select: { id: true, fullName: true, role: true } },
                        subject: { select: { name: true } }
                    }
                });

                const teacherMap = new Map();
                assignments.forEach(a => {
                    if (a.teacher) {
                        const studentNames = classToStudentMap.get(a.classId) || [];
                        const studentNameStr = studentNames.join(', ');

                        if (!teacherMap.has(a.teacher.id)) {
                            teacherMap.set(a.teacher.id, {
                                id: a.teacher.id,
                                name: a.teacher.fullName,
                                role: 'TEACHER',
                                type: 'TEACHER',
                                subject: a.subject.name,
                                studentName: studentNameStr, // Added Field
                                description: `Teacher (${a.subject.name}) of ${studentNameStr}`
                            });
                        } else {
                            // Append subject if different
                            const existing = teacherMap.get(a.teacher.id);
                            if (!existing.subject.includes(a.subject.name)) {
                                existing.subject += `, ${a.subject.name}`;
                                // Check if student name is already in description (e.g. same student, new subject)
                                // or new student, same teacher.
                                // Logic: "Teacher (Math, Science) of Leo"
                                existing.description = `Teacher (${existing.subject}) of ${existing.studentName}`;
                            }
                            // Append student name if new (e.g. Teacher teaches Sibling in another class)
                            if (!existing.studentName.includes(studentNameStr)) {
                                existing.studentName += `, ${studentNameStr}`;
                                existing.description = `Teacher (${existing.subject}) of ${existing.studentName}`;
                            }
                        }
                    }
                });
                contacts = Array.from(teacherMap.values());
            }

            // Always add Admin for support
            const admins = await prisma.user.findMany({
                where: { schoolId, role: { in: [UserRole.school_admin, 'school_admin'] } },
                select: { id: true, fullName: true, role: true }
            });
            admins.forEach(a => contacts.push({ ...a, name: a.fullName, type: 'ADMIN' }));

            // 3. TEACHER: See Parents of their Students
        } else if (role === UserRole.teacher || role === 'TEACHER') {

            // Find Classes assigned to this teacher
            const myAssignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                select: { classId: true }
            });
            const classIds = [...new Set(myAssignments.map(a => a.classId))];

            if (classIds.length > 0) {
                // Find Students in these classes -> Include Parent
                const classEnrollments = await prisma.studentEnrollment.findMany({
                    where: {
                        classId: { in: classIds },
                        academicYear: { current: true }
                    },
                    include: {
                        student: {
                            select: {
                                fullName: true,
                                parent: {
                                    select: { id: true, fullName: true, role: true, email: true }
                                }
                            }
                        }
                    }
                });

                const parentMap = new Map();
                classEnrollments.forEach(e => {
                    const student = e.student;
                    const parent = student.parent;

                    if (parent) {
                        if (!parentMap.has(parent.id)) {
                            parentMap.set(parent.id, {
                                id: parent.id,
                                name: parent.fullName,
                                role: 'PARENT',
                                type: 'PARENT',
                                description: `Parent of ${student.fullName}`
                            });
                        } else {
                            // If parent has multiple kids in teacher's classes
                            const existing = parentMap.get(parent.id);
                            if (!existing.description.includes(student.fullName)) {
                                existing.description += `, ${student.fullName}`;
                            }
                        }
                    }
                });
                contacts = Array.from(parentMap.values());
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
        logger.error({ error: error.message, userId }, "Error fetching contacts");
        res.status(500).json({ message: 'Failed to fetch contacts.' });
    }
};

module.exports = {
    sendMessage,
    getConversation,
    getContacts
};
