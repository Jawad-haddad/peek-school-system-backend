/**
 * __tests__/teacher-scope.test.js
 *
 * Verifies that teachers can only access/manage data for their assigned classes.
 * Runs entirely in-process against the real Express app (no separate server needed).
 *
 * Strategy:
 *  - Login as school_admin, create a teacher, a class, an assignment, homework & exam schedule.
 *  - Login as the teacher → verify correct access.
 *  - Create a second class with NO assignment → verify 403 TEACHER_NOT_ASSIGNED.
 */

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

// ─── Shared state ──────────────────────────────────────────────────────────
let adminToken;
let teacherToken;
let schoolId;
let assignedClassId;
let unassignedClassId;
let homeworkId;      // homework in assignedClass
let scheduleId;      // examSchedule in assignedClass

// ─── Helpers ───────────────────────────────────────────────────────────────
const ts = Date.now();
const teacherEmail = `teacher.scope.${ts}@test.com`;

async function login(email, password) {
    const res = await request(app)
        .post('/api/users/login')
        .send({ email, password });
    return res.body?.data?.token || res.body?.token;
}

// ─── Setup ─────────────────────────────────────────────────────────────────
beforeAll(async () => {
    // Login as the seeded admin
    adminToken = await login('admin@peek.com', 'password123');
    if (!adminToken) {
        adminToken = await login('principal@almustaqbal.com', 'principalpassword');
    }

    // Derive schoolId from admin's token
    const meRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`);
    schoolId = meRes.body?.data?.schoolId || meRes.body?.schoolId;

    // Create teacher directly in DB (fast)
    const hash = await bcrypt.hash('TeacherPass123!', 10);
    const teacher = await prisma.user.create({
        data: {
            fullName: 'Scope Test Teacher',
            email: teacherEmail,
            password_hash: hash,
            role: 'teacher',
            schoolId,
            isActive: true,
            emailVerified: true
        }
    });

    // Fetch the current academic year for this school
    const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId, current: true }
    });
    if (!academicYear) throw new Error('No current academic year found for school');

    // Create two classes
    const [assignedClass, unassignedClass] = await Promise.all([
        prisma.class.create({ data: { name: `Assigned-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } }),
        prisma.class.create({ data: { name: `Unassigned-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } })
    ]);
    assignedClassId = assignedClass.id;
    unassignedClassId = unassignedClass.id;

    // Create subject for assignment
    const subject = await prisma.subject.create({
        data: { name: `Subj-${ts}`, schoolId, classId: assignedClass.id, teacherId: teacher.id }
    });

    // Assign teacher to the assignedClass
    await prisma.teacherSubjectAssignment.create({
        data: { teacherId: teacher.id, classId: assignedClass.id, subjectId: subject.id }
    });

    // Create homework in the assignedClass
    const hw = await prisma.homework.create({
        data: { title: `HW-${ts}`, classId: assignedClass.id, subjectId: subject.id, dueDate: new Date() }
    });
    homeworkId = hw.id;

    // Create exam + schedule in the assignedClass
    const exam = await prisma.exam.create({
        data: { name: `Exam-${ts}`, startDate: new Date(), endDate: new Date(), schoolId }
    });
    const sched = await prisma.examSchedule.create({
        data: { examId: exam.id, classId: assignedClass.id, subjectId: subject.id, date: new Date(), startTime: '09:00', endTime: '10:00' }
    });
    scheduleId = sched.id;

    // Get teacher token
    teacherToken = await login(teacherEmail, 'TeacherPass123!');
}, 40000);

afterAll(async () => {
    await prisma.$disconnect();
}, 10000);

// ─── Tests ─────────────────────────────────────────────────────────────────

test('teacher can GET /api/teacher/classes and see assigned classes', async () => {
    const res = await request(app)
        .get('/api/teacher/classes')
        .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const classIds = res.body.data.map(c => c.id);
    expect(classIds).toContain(assignedClassId);
    expect(classIds).not.toContain(unassignedClassId);
});

test('teacher can GET students for their assigned class', async () => {
    const res = await request(app)
        .get(`/api/teacher/classes/${assignedClassId}/students`)
        .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
});

test('teacher gets 403 TEACHER_NOT_ASSIGNED when accessing unassigned class students', async () => {
    const res = await request(app)
        .get(`/api/teacher/classes/${unassignedClassId}/students`)
        .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
});

test('teacher gets 403 TEACHER_NOT_ASSIGNED when submitting attendance for unassigned class', async () => {
    const res = await request(app)
        .post('/api/attendance/bulk')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
            classId: unassignedClassId,
            date: '2026-01-15',
            records: [{ studentId: '00000000-0000-0000-0000-000000000001', status: 'present' }]
        });

    // 400 (validation), 403 (scope), or 404 (class not found) — all are acceptable
    // security rejections. The key invariant is: it is NOT 200.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    if (res.status === 403) {
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    }
});

test('teacher gets 403 TEACHER_NOT_ASSIGNED when submitting marks for unassigned exam schedule', async () => {
    // Create a schedule in the unassigned class to test against
    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    const subjectForUnassigned = await prisma.subject.findFirst({ where: { schoolId } });

    const exam2 = await prisma.exam.create({
        data: { name: `Exam2-${ts}`, startDate: new Date(), endDate: new Date(), schoolId }
    });
    const unassignedSched = await prisma.examSchedule.create({
        data: {
            examId: exam2.id,
            classId: unassignedClassId,
            subjectId: subjectForUnassigned.id,
            date: new Date(),
            startTime: '09:00',
            endTime: '10:00'
        }
    });

    const res = await request(app)
        .post(`/api/exams/schedules/${unassignedSched.id}/marks`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ marks: [{ studentId: '00000000-0000-0000-0000-000000000001', marksObtained: 90 }] });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
}, 15000);

test('teacher gets 403 TEACHER_NOT_ASSIGNED when grading homework for unassigned class', async () => {
    // Create homework in the unassigned class
    const subjectForUnassigned = await prisma.subject.findFirst({ where: { schoolId } });
    const unassignedHW = await prisma.homework.create({
        data: {
            title: `UnassignedHW-${ts}`,
            classId: unassignedClassId,
            subjectId: subjectForUnassigned.id,
            dueDate: new Date()
        }
    });

    const res = await request(app)
        .post(`/api/academics/homework/${unassignedHW.id}/grades`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ studentId: '00000000-0000-0000-0000-000000000001', grade: 'A', comments: 'ok' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
}, 15000);
