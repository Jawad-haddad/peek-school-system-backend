const prisma = require('../prismaClient');
const { sendNotification } = require('../services/notificationService');
const logger = require('../config/logger');

const createAnnouncement = async (req, res) => {
    const { title, content, scope, classId } = req.body;
    const schoolId = req.user.schoolId;

    if (!title || !content || !scope) {
        return res.status(400).json({ message: 'Title, content, and scope are required.' });
    }

    if (scope === 'CLASS' && !classId) {
        return res.status(400).json({ message: 'Class ID is required for CLASS scope announcements.' });
    }

    try {
        const announcement = await prisma.announcement.create({
            data: {
                title,
                content,
                scope, // 'SCHOOL' or 'CLASS'
                classId: scope === 'CLASS' ? classId : null,
                schoolId
            }
        });

        // Notifications
        if (scope === 'SCHOOL') {
            // Notify all parents in the school (Optional: could be expensive, maybe just rely on app feed or topic subscription)
            // For now, let's assume we want to notify all users or just parents. 
            // Implementation detail: Logic to find all target users.
            // Simplified: Send to school topic if using topics, or skip loop for now to avoid timeout on large schools.
            // Requirement said "Allow sending to the whole School". 
            // We will send a notification if feasible.
        } else if (scope === 'CLASS') {
            const enrollments = await prisma.studentEnrollment.findMany({
                where: { classId: classId },
                select: { student: { select: { parentId: true } } }
            });
            const parentIds = [...new Set(enrollments.map(e => e.student.parentId))];
            parentIds.forEach(parentId => {
                if (parentId) {
                    sendNotification({
                        userId: parentId,
                        title: `Announcement: ${title}`,
                        body: content.substring(0, 100), // specific message or snippet
                        preferenceType: 'schoolAnnouncements', // Mapping to 'schoolAnnouncements' pref
                        data: { announcementId: announcement.id, screen: 'AnnouncementDetails' }
                    });
                }
            });
        }

        logger.info({ announcementId: announcement.id, schoolId, scope }, "New announcement created");
        res.status(201).json(announcement);
    } catch (error) {
        logger.error({ error, schoolId, title }, "Error creating announcement");
        res.status(500).json({ message: 'Failed to create announcement.' });
    }
};

const getAnnouncements = async (req, res) => {
    const { schoolId, id: userId, role } = req.user;

    try {
        let whereClause = {
            schoolId,
            OR: [
                { scope: 'SCHOOL' }
            ]
        };

        if (role === 'parent') {
            // Find all classes children are enrolled in
            const students = await prisma.student.findMany({
                where: { parentId: userId },
                select: {
                    enrollments: {
                        where: { academicYear: { isActive: true } },
                        select: { classId: true }
                    }
                }
            });

            const classIds = students.flatMap(s => s.enrollments.map(e => e.classId));
            if (classIds.length > 0) {
                whereClause.OR.push({ scope: 'CLASS', classId: { in: classIds } });
            }

        } else if (role === 'teacher') {
            // Find all classes teacher is assigned to (optional, or just show all school announcements + explicit class ones?)
            // Usually teachers see school announcements. If they want to see class announcements, they presumably should see ones they teach.
            // For strict filtering:
            const assignments = await prisma.teacherSubjectAssignment.findMany({
                where: { teacherId: userId },
                select: { classId: true }
            });
            const classIds = [...new Set(assignments.map(a => a.classId))];
            if (classIds.length > 0) {
                whereClause.OR.push({ scope: 'CLASS', classId: { in: classIds } });
            }
        }
        // School admins see everything or filter? Requirement: "Fetch announcements relevant to the user's school and (if applicable) their class."
        // Admin creates them, so maybe they see all. For now sticking to relevancy.

        const announcements = await prisma.announcement.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: { class: { select: { name: true } } }
        });

        res.status(200).json(announcements);

    } catch (error) {
        logger.error({ error, userId }, "Error fetching announcements");
        res.status(500).json({ message: 'Failed to fetch announcements.' });
    }
};

const sendBroadcast = async (req, res) => {
    // Wrapper for createAnnouncement to match requested route /broadcast
    // Map frontend 'message' to 'content' if needed
    if (req.body.message && !req.body.content) {
        req.body.content = req.body.message;
    }
    // Map frontend 'target' to 'scope' if needed
    if (req.body.target === 'all' || !req.body.scope) {
        req.body.scope = 'SCHOOL';
    }

    return createAnnouncement(req, res);
};

module.exports = {
    createAnnouncement,
    getAnnouncements,
    sendBroadcast
};
