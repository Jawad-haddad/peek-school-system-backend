/**
 * __tests__/teacher-attendance-full.test.js
 *
 * Tests teacher-scoped attendance endpoints:
 *   - GET /api/attendance/:classId?date=                (day view)
 *   - POST /api/attendance/bulk                         (submit)
 *   - GET /api/attendance/:classId/history?from=&to=    (history)
 *
 * Strategy: stand up a teacher with one assigned class and one unassigned class
 * using direct Prisma inserts (fast, no HTTP admin calls needed).
 */

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

const ts = Date.now();
const teacherEmail = `att.teacher.${ts}@test.com`;

let teacherToken;
let schoolId;
let assignedClassId;
let unassignedClassId;
let enrolledStudentId;       // student enrolled in assignedClass
const TODAY = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD

// ── helpers ────────────────────────────────────────────────────────────────

async function login(email, password) {
    const res = await request(app)
        .post('/api/users/login')
        .send({ email, password });
    return res.body?.data?.token || res.body?.token;
}

// ── setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
    // Use seeded admin credentials to get schoolId
    const adminToken = await login('admin@peek.com', 'password123');
    const meRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`);
    schoolId = meRes.body?.data?.schoolId || meRes.body?.schoolId;
    if (!schoolId) throw new Error('Cannot derive schoolId from admin /me');

    // Create teacher in DB
    const hash = await bcrypt.hash('TeacherAtt1!', 10);
    const teacher = await prisma.user.create({
        data: {
            fullName: 'Att Scope Teacher',
            email: teacherEmail,
            password_hash: hash,
            role: 'teacher',
            schoolId,
            isActive: true,
            emailVerified: true
        }
    });

    const academicYear = await prisma.academicYear.findFirst({
        where: { schoolId, current: true }
    });
    if (!academicYear) throw new Error('No current academic year');

    // Two classes
    const [cls1, cls2] = await Promise.all([
        prisma.class.create({ data: { name: `AttAss-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } }),
        prisma.class.create({ data: { name: `AttUn-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } })
    ]);
    assignedClassId = cls1.id;
    unassignedClassId = cls2.id;

    // Subject + assignment (teacher → assignedClass only)
    const subject = await prisma.subject.create({
        data: { name: `AttSubj-${ts}`, schoolId, classId: cls1.id, teacherId: teacher.id }
    });
    await prisma.teacherSubjectAssignment.create({
        data: { teacherId: teacher.id, classId: cls1.id, subjectId: subject.id }
    });

    // Enroll a real student in assignedClass so bulk submit has a valid studentId
    const parent = await prisma.user.create({
        data: {
            fullName: `Parent-${ts}`,
            email: `parent.${ts}@test.com`,
            password_hash: hash,
            role: 'parent',
            schoolId,
            isActive: true,
            emailVerified: true
        }
    });
    const student = await prisma.student.create({
        data: {
            fullName: `Student-${ts}`,
            schoolId,
            parentId: parent.id
        }
    });
    enrolledStudentId = student.id;
    await prisma.studentEnrollment.create({
        data: { studentId: student.id, classId: cls1.id, academicYearId: academicYear.id }
    });

    // Teacher login
    teacherToken = await login(teacherEmail, 'TeacherAtt1!');
    if (!teacherToken) throw new Error('Teacher login failed');
}, 40000);

afterAll(async () => {
    await prisma.$disconnect();
}, 10000);

// ── tests ──────────────────────────────────────────────────────────────────

describe('Teacher-scoped attendance', () => {

    test('teacher can fetch day attendance for assigned class', async () => {
        const res = await request(app)
            .get(`/api/attendance/${assignedClassId}?date=${TODAY}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        // At least the enrolled student should appear
        const ids = res.body.data.map(r => r.studentId);
        expect(ids).toContain(enrolledStudentId);
    });

    test('teacher cannot fetch day attendance for unassigned class → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .get(`/api/attendance/${unassignedClassId}?date=${TODAY}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    test('teacher can submit bulk attendance for assigned class', async () => {
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: assignedClassId,
                date: TODAY,
                records: [{ studentId: enrolledStudentId, status: 'present' }]
            });

        expect(res.status).toBe(200);
        expect(res.body?.data?.savedCount).toBe(1);
    });

    test('teacher cannot submit bulk for unassigned class → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: unassignedClassId,
                date: TODAY,
                records: [{ studentId: enrolledStudentId, status: 'present' }]
            });

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    test('history endpoint returns entries for days that have records', async () => {
        // Submit attendance first (idempotent upsert — safe to run even after previous test)
        await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: assignedClassId,
                date: TODAY,
                records: [{ studentId: enrolledStudentId, status: 'present' }]
            });

        const res = await request(app)
            .get(`/api/attendance/${assignedClassId}/history?from=2026-01-01&to=2027-12-31&limit=30`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);

        // Each entry should have the summary shape
        const entry = res.body.data[0];
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('present');
        expect(entry).toHaveProperty('absent');
        expect(entry).toHaveProperty('total');

        // meta should carry limit + from + to
        expect(res.body.meta).toHaveProperty('limit', 30);
        expect(res.body.meta).toHaveProperty('from');
        expect(res.body.meta).toHaveProperty('to');
    });

    test('teacher cannot fetch history for unassigned class → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .get(`/api/attendance/${unassignedClassId}/history`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });
});
