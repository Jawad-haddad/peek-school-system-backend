/**
 * __tests__/teacher-homework-crud.test.js
 *
 * Tests teacher-scoped Homework CRUD:
 *   GET    /api/academics/homework?classId=
 *   POST   /api/academics/homework
 *   PATCH  /api/academics/homework/:homeworkId
 *   DELETE /api/academics/homework/:homeworkId
 */

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

const ts = Date.now();
const teacherEmail = `hw.teacher.${ts}@test.com`;

let teacherToken;
let schoolId;
let subjectId;
let assignedClassId;
let unassignedClassId;
let createdHomeworkId;    // will be set by create test

// ── helpers ────────────────────────────────────────────────────────────────

async function login(email, password) {
    const res = await request(app)
        .post('/api/users/login')
        .send({ email, password });
    return res.body?.data?.token || res.body?.token;
}

// ── setup ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
    const adminToken = await login('admin@peek.com', 'password123');
    const meRes = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${adminToken}`);
    schoolId = meRes.body?.data?.schoolId || meRes.body?.schoolId;
    if (!schoolId) throw new Error('Cannot derive schoolId');

    const hash = await bcrypt.hash('HwTeacher1!', 10);
    const teacher = await prisma.user.create({
        data: {
            fullName: 'HW Scope Teacher',
            email: teacherEmail,
            password_hash: hash,
            role: 'teacher',
            schoolId,
            isActive: true,
            emailVerified: true
        }
    });

    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (!academicYear) throw new Error('No current academic year');

    const [cls1, cls2] = await Promise.all([
        prisma.class.create({ data: { name: `HwAss-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } }),
        prisma.class.create({ data: { name: `HwUnasgn-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } })
    ]);
    assignedClassId = cls1.id;
    unassignedClassId = cls2.id;

    const subject = await prisma.subject.create({
        data: { name: `HwSubj-${ts}`, schoolId, classId: cls1.id, teacherId: teacher.id }
    });
    subjectId = subject.id;

    await prisma.teacherSubjectAssignment.create({
        data: { teacherId: teacher.id, classId: cls1.id, subjectId: subject.id }
    });

    teacherToken = await login(teacherEmail, 'HwTeacher1!');
    if (!teacherToken) throw new Error('Teacher login failed');
}, 40000);

afterAll(async () => {
    await prisma.$disconnect();
}, 10000);

// ── tests ──────────────────────────────────────────────────────────────────

describe('Teacher-scoped Homework CRUD', () => {

    // ── CREATE ────────────────────────────────────────────────

    test('teacher can create homework for assigned class', async () => {
        const res = await request(app)
            .post('/api/academics/homework')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: assignedClassId,
                subjectId,
                title: `Test HW ${ts}`,
                dueDate: '2026-12-31',
                description: 'Do the exercises'
            });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        expect(res.body.data.title).toBe(`Test HW ${ts}`);
        createdHomeworkId = res.body.data.id;
    });

    test('teacher cannot create homework for unassigned class → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .post('/api/academics/homework')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: unassignedClassId,
                subjectId,
                title: `Unassigned HW ${ts}`,
                dueDate: '2026-12-31'
            });

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    test('validation: missing title returns 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post('/api/academics/homework')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ classId: assignedClassId, subjectId, dueDate: '2026-12-31' });

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    test('validation: bad dueDate format returns 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post('/api/academics/homework')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ classId: assignedClassId, subjectId, title: 'x', dueDate: 'not-a-date' });

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    // ── LIST ─────────────────────────────────────────────────

    test('teacher can list homework for assigned class only', async () => {
        const res = await request(app)
            .get(`/api/academics/homework?classId=${assignedClassId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
        const ids = res.body.data.map(h => h.id);
        expect(ids).toContain(createdHomeworkId);
    });

    test('teacher listing homework for unassigned class → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .get(`/api/academics/homework?classId=${unassignedClassId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    // ── UPDATE ────────────────────────────────────────────────

    test('teacher can update homework for assigned class', async () => {
        // ensure createdHomeworkId was set
        expect(createdHomeworkId).toBeDefined();

        const res = await request(app)
            .patch(`/api/academics/homework/${createdHomeworkId}`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ title: `Updated HW ${ts}` });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.title).toBe(`Updated HW ${ts}`);
    });

    test('teacher cannot update homework for unassigned class → 403', async () => {
        // Create homework in unassigned class via direct Prisma (bypass scope)
        const hw = await prisma.homework.create({
            data: { title: 'Direct HW', classId: unassignedClassId, subjectId, dueDate: new Date() }
        });

        const res = await request(app)
            .patch(`/api/academics/homework/${hw.id}`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ title: 'Should Fail' });

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    // ── DELETE ────────────────────────────────────────────────

    test('teacher can delete homework for assigned class', async () => {
        // Create a hw specifically for deletion
        const hw = await prisma.homework.create({
            data: { title: 'To Delete', classId: assignedClassId, subjectId, dueDate: new Date() }
        });

        const res = await request(app)
            .delete(`/api/academics/homework/${hw.id}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.deleted).toBe(true);
    });

    test('teacher cannot delete homework for unassigned class → 403', async () => {
        const hw = await prisma.homework.create({
            data: { title: 'Direct HW Delete', classId: unassignedClassId, subjectId, dueDate: new Date() }
        });

        const res = await request(app)
            .delete(`/api/academics/homework/${hw.id}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });
});
