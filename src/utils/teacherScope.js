/**
 * src/utils/teacherScope.js
 *
 * Helper functions to enforce teacher access is scoped ONLY to their
 * assigned classes, subjects, and related objects.
 * 
 * On violation → throws an error object with { statusCode: 403, code: 'TEACHER_NOT_ASSIGNED', message }
 * Callers should catch and send via `fail()`.
 */

const prisma = require('../prismaClient');

/**
 * Checks that the currently-authenticated teacher has at least one
 * TeacherSubjectAssignment for the given classId (scoped to their school).
 *
 * @param {import('express').Request} req
 * @param {string} classId
 * @throws {{ statusCode: 403, code: 'TEACHER_NOT_ASSIGNED', message: string }}
 */
const assertTeacherAssignedToClass = async (req, classId) => {
    const teacherId = req.user.id;
    const schoolId = req.user.schoolId;

    const assignment = await prisma.teacherSubjectAssignment.findFirst({
        where: {
            teacherId,
            classId,
            // Verify the class belongs to the teacher's school via its academicYear
            class: { academicYear: { schoolId } }
        },
        select: { id: true }
    });

    if (!assignment) {
        const err = new Error('You are not assigned to this class.');
        err.statusCode = 403;
        err.code = 'TEACHER_NOT_ASSIGNED';
        throw err;
    }
};

/**
 * Checks that the currently-authenticated teacher is assigned to
 * the class that the given examSchedule belongs to.
 *
 * @param {import('express').Request} req
 * @param {string} scheduleId   (examSchedule id)
 * @throws {{ statusCode: 403, code: 'TEACHER_NOT_ASSIGNED', message: string }}
 */
const assertTeacherAssignedToSchedule = async (req, scheduleId) => {
    const teacherId = req.user.id;

    const schedule = await prisma.examSchedule.findUnique({
        where: { id: scheduleId },
        select: { classId: true }
    });

    if (!schedule) {
        const err = new Error('Exam schedule not found.');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    await assertTeacherAssignedToClass(req, schedule.classId);
};

/**
 * Checks that the currently-authenticated teacher is assigned to
 * the class that the given homework belongs to.
 *
 * @param {import('express').Request} req
 * @param {string} homeworkId
 * @throws {{ statusCode: 403, code: 'TEACHER_NOT_ASSIGNED', message: string }}
 */
const assertTeacherAssignedToHomework = async (req, homeworkId) => {
    const homework = await prisma.homework.findUnique({
        where: { id: homeworkId },
        select: { classId: true }
    });

    if (!homework) {
        const err = new Error('Homework not found.');
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
    }

    await assertTeacherAssignedToClass(req, homework.classId);
};

module.exports = {
    assertTeacherAssignedToClass,
    assertTeacherAssignedToSchedule,
    assertTeacherAssignedToHomework
};
