/**
 * __tests__/teacher-exams-view.test.js
 *
 * Tests teacher-scoped exam schedule viewing:
 *   GET /api/teacher/exams?classId=&from=&to=&limit=
 *   GET /api/teacher/exams/:scheduleId
 */

const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

const ts = Date.now();
const teacherEmail = `exam.view.${ts}@test.com`;

let teacherToken;
let schoolId;
let subjectId;
let assignedClassId;
let unassignedClassId;
let assignedScheduleId;
let unassignedScheduleId;

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

    const hash = await bcrypt.hash('ExamView1!', 10);
    const teacher = await prisma.user.create({
        data: {
            fullName: 'ExamView Teacher', email: teacherEmail, password_hash: hash,
            role: 'teacher', schoolId, isActive: true, emailVerified: true
        }
    });

    const academicYear = await prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (!academicYear) throw new Error('No current academic year');

    // Two classes
    const [cls1, cls2] = await Promise.all([
        prisma.class.create({ data: { name: `ExAss-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } }),
        prisma.class.create({ data: { name: `ExUnasgn-${ts}`, academicYearId: academicYear.id, defaultFee: 0 } })
    ]);
    assignedClassId = cls1.id;
    unassignedClassId = cls2.id;

    // Subject + assignment for assignedClass only
    const subject = await prisma.subject.create({
        data: { name: `ExSubj-${ts}`, schoolId, classId: cls1.id, teacherId: teacher.id }
    });
    subjectId = subject.id;
    await prisma.teacherSubjectAssignment.create({
        data: { teacherId: teacher.id, classId: cls1.id, subjectId }
    });

    // Exam master record
    const exam = await prisma.exam.create({
        data: { name: `Exam-${ts}`, startDate: new Date(), endDate: new Date(), schoolId }
    });

    // Schedule in assignedClass
    const [sched1, sched2] = await Promise.all([
        prisma.examSchedule.create({
            data: {
                examId: exam.id, classId: cls1.id, subjectId, date: new Date('2026-06-01'),
                startTime: '09:00', endTime: '10:00'
            }
        }),
        prisma.examSchedule.create({
            data: {
                examId: exam.id, classId: cls2.id, subjectId, date: new Date('2026-06-02'),
                startTime: '09:00', endTime: '10:00'
            }
        })
    ]);
    assignedScheduleId = sched1.id;
    unassignedScheduleId = sched2.id;

    teacherToken = await login(teacherEmail, 'ExamView1!');
    if (!teacherToken) throw new Error('Teacher login failed');
}, 40000);

afterAll(async () => { await prisma.$disconnect(); }, 10000);

// ── tests ──────────────────────────────────────────────────────────────────
describe('Teacher-scoped Exam View', () => {

    // ── LIST ───────────────────────────────────────────────────────────────

    test('teacher can list exam schedules for assigned classes', async () => {
        const res = await request(app)
            .get('/api/teacher/exams')
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);

        // Should include the assigned schedule
        const ids = res.body.data.map(s => s.scheduleId);
        expect(ids).toContain(assignedScheduleId);
        // Should NOT include the unassigned schedule
        expect(ids).not.toContain(unassignedScheduleId);
    });

    test('teacher can filter exam list by assignedClassId', async () => {
        const res = await request(app)
            .get(`/api/teacher/exams?classId=${assignedClassId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        const ids = res.body.data.map(s => s.scheduleId);
        expect(ids).toContain(assignedScheduleId);
    });

    test('teacher cannot filter by unassigned classId → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .get(`/api/teacher/exams?classId=${unassignedClassId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    test('from/to date filter → invalid format rejected with 400', async () => {
        const res = await request(app)
            .get('/api/teacher/exams?from=not-a-date')
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    test('from/to date filter works and returns correct schedules', async () => {
        // Only schedules from 2026-06-01 to 2026-06-01 — should include assigned (Jun 1)
        const res = await request(app)
            .get('/api/teacher/exams?from=2026-06-01&to=2026-06-01')
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        const ids = res.body.data.map(s => s.scheduleId);
        expect(ids).toContain(assignedScheduleId);
    });

    // ── DETAIL ─────────────────────────────────────────────────────────────

    test('teacher can fetch detail for assigned schedule', async () => {
        const res = await request(app)
            .get(`/api/teacher/exams/${assignedScheduleId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveProperty('schedule');
        expect(res.body.data).toHaveProperty('roster');
        expect(res.body.data.schedule.id).toBe(assignedScheduleId);
        expect(Array.isArray(res.body.data.roster)).toBe(true);
    });

    test('teacher cannot fetch detail for unassigned schedule → 403 TEACHER_NOT_ASSIGNED', async () => {
        const res = await request(app)
            .get(`/api/teacher/exams/${unassignedScheduleId}`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(403);
        expect(res.body?.error?.code).toBe('TEACHER_NOT_ASSIGNED');
    });

    test('invalid UUID scheduleId rejected with 400', async () => {
        const res = await request(app)
            .get('/api/teacher/exams/not-a-uuid')
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(400);
        expect(res.body?.error?.code).toBe('VALIDATION_ERROR');
    });

    test('response includes correct shape: scheduleId, examName, className, subject, date', async () => {
        const res = await request(app)
            .get('/api/teacher/exams')
            .set('Authorization', `Bearer ${teacherToken}`);

        const schedule = res.body.data.find(s => s.scheduleId === assignedScheduleId);
        expect(schedule).toBeDefined();
        expect(schedule).toHaveProperty('scheduleId');
        expect(schedule).toHaveProperty('examName');
        expect(schedule).toHaveProperty('className');
        expect(schedule).toHaveProperty('subject');
        expect(schedule).toHaveProperty('date');
        expect(schedule).toHaveProperty('startTime');
        expect(schedule).toHaveProperty('endTime');
    });
});
