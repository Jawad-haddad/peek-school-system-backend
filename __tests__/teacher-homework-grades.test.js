/**
 * __tests__/teacher-homework-grades.test.js
 *
 * Tests teacher-scoped homework grading:
 *   GET  /api/academics/homework/:homeworkId/grades  (roster + existing)
 *   POST /api/academics/homework/:homeworkId/grades  (bulk upsert)
 *
 * Each test run creates isolated DB objects; no shared mutation between suites.
 */

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

const ts = Date.now();
const teacherEmail = `grade.teacher.${ts}@test.com`;

let teacherToken;
let schoolId;
let subjectId;
let assignedClassId;
let unassignedClassId;
let enrolledStudentId;
let homeworkId;           // homework with maxPoints=10 in assignedClass
let homeworkNoMaxId;      // homework with no maxPoints in assignedClass
let unassignedHomeworkId; // homework in unassignedClass

// ── helpers ────────────────────────────────────────────────────────────────
async function login(email, password) {
    const r = await request(app).post('/api/users/login').send({ email, password });
    return r.body?.data?.token || r.body?.token;
}

// ── setup ──────────────────────────────────────────────────────────────────
beforeAll(async () => {
    const adminToken = await login('admin@peek.com', 'password123');
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${adminToken}`);
    schoolId = me.body?.data?.schoolId || me.body?.schoolId;
    if (!schoolId) throw new Error('Cannot derive schoolId');

    const hash = await bcrypt.hash('GradeTeacher1!', 10);
    const teacher = await prisma.user.create({
        data: {
            fullName: 'Grade Teacher', email: teacherEmail, password_hash: hash,
            role: 'teacher', schoolId, isActive: true, emailVerified: true
        }
    });

    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (!academicYear) throw new Error('No current academic year');

    // Two classes
    const [cls1, cls2] = await Promise.all([
        prisma.class.create({ data: { name: `GrAss-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } }),
        prisma.class.create({ data: { name: `GrUnasgn-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } })
    ]);
    assignedClassId = cls1.id;
    unassignedClassId = cls2.id;

    // Subject + assignment (teacher → assignedClass only)
    const subject = await prisma.subject.create({
        data: { name: `GrSubj-${ts}`, schoolId, classId: cls1.id, teacherId: teacher.id }
    });
    subjectId = subject.id;
    await prisma.teacherSubjectAssignment.create({
        data: { teacherId: teacher.id, classId: cls1.id, subjectId }
    });

    // Enroll a student in assignedClass
    const parent = await prisma.user.create({
        data: {
            fullName: `Parent-${ts}`, email: `parent.gr.${ts}@test.com`, password_hash: hash,
            role: 'parent', schoolId, isActive: true, emailVerified: true
        }
    });
    const student = await prisma.student.create({
        data: { fullName: `Student-${ts}`, schoolId, parentId: parent.id }
    });
    enrolledStudentId = student.id;
    await prisma.studentEnrollment.create({
        data: { studentId: student.id, classId: cls1.id, academicYearId: academicYear.id }
    });

    // Two homework items in assignedClass (with / without maxPoints)
    // Note: use raw SQL to set maxPoints because the Prisma client may be cached
    // from before the schema migration while the DLL is locked by other test runners.
    const [hw, hwNoMax] = await Promise.all([
        prisma.homework.create({ data: { title: `HW-${ts}`, classId: cls1.id, subjectId, dueDate: new Date() } }),
        prisma.homework.create({ data: { title: `HW2-${ts}`, classId: cls1.id, subjectId, dueDate: new Date() } })
    ]);
    // Set maxPoints=10 on the first homework via raw SQL
    await prisma.$executeRaw`UPDATE "Homework" SET "maxPoints" = 10 WHERE id = ${hw.id}`;
    homeworkId = hw.id;
    homeworkNoMaxId = hwNoMax.id;

    // Homework in unassigned class
    const hwUn = await prisma.homework.create({
        data: { title: `HWUn-${ts}`, classId: cls2.id, subjectId, dueDate: new Date() }
    });
    unassignedHomeworkId = hwUn.id;

    teacherToken = await login(teacherEmail, 'GradeTeacher1!');
    if (!teacherToken) throw new Error('Teacher login failed');
}, 40000);

afterAll(async () => { await prisma.$disconnect(); }, 10000);

// ── tests ──────────────────────────────────────────────────────────────────
describe('Teacher-scoped Homework Grades', () => {

    // ── GET roster ────────────────────────────────────────────────────────

    test('teacher can fetch grades roster for assigned homework', async () => {
        const res = await request(app)
            .get(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('homework');
        expect(res.body.data).toHaveProperty('students');
        expect(res.body.data.homework.maxPoints).toBe(10);
        // enrolled student should appear with null grade initially
        const student = res.body.data.students.find(s => s.id === enrolledStudentId);
        expect(student).toBeDefined();
        expect(student.grade).toBeNull();
    });

    test('teacher cannot fetch grades roster for unassigned homework → 403', async () => {
        const res = await request(app)
            .get(`/api/academics/homework/${unassignedHomeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    // ── POST bulk submit ───────────────────────────────────────────────────

    test('teacher can submit grades for assigned homework', async () => {
        const res = await request(app)
            .post(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [{ studentId: enrolledStudentId, grade: 8, comment: 'Good work' }] });

        expect(res.status).toBe(200);
        expect(res.body.data.savedCount).toBe(1);
    });

    test('submitted grade appears in subsequent roster fetch', async () => {
        const res = await request(app)
            .get(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`);

        const student = res.body.data.students.find(s => s.id === enrolledStudentId);
        expect(student.grade).toBe(8);
        expect(student.comment).toBe('Good work');
    });

    test('teacher cannot submit grades for unassigned homework → 403', async () => {
        const res = await request(app)
            .post(`/api/academics/homework/${unassignedHomeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [{ studentId: enrolledStudentId, grade: 5 }] });

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    // ── maxPoints validation ───────────────────────────────────────────────

    test('grade > maxPoints rejected with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [{ studentId: enrolledStudentId, grade: 15 }] }); // exceeds maxPoints=10

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    test('grade without maxPoints cap accepted', async () => {
        const res = await request(app)
            .post(`/api/academics/homework/${homeworkNoMaxId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [{ studentId: enrolledStudentId, grade: 999 }] });

        expect(res.status).toBe(200);
    });

    // ── body validation ────────────────────────────────────────────────────

    test('empty grades array rejected with 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [] });

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    // ── roster enforcement ─────────────────────────────────────────────────

    test('student not enrolled in class rejected with 400 VALIDATION_ERROR', async () => {
        const outsiderId = '00000000-0000-0000-0000-000000000099';
        const res = await request(app)
            .post(`/api/academics/homework/${homeworkId}/grades`)
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({ grades: [{ studentId: outsiderId, grade: 5 }] });

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });
});
