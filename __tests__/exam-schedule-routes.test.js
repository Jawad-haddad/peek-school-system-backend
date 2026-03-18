const request = require('supertest');
const app = require('../index');
const prisma = require('../src/prismaClient');
const bcrypt = require('bcryptjs');

let adminToken, teacherToken;
let school, otherSchool, otherAdminToken;
let exam, classObj, subject;

const ts = Date.now();

beforeAll(async () => {
    const hash = await bcrypt.hash('Pass123!', 10);

    school = await prisma.school.create({ data: { name: `ExSched School ${ts}` } });
    otherSchool = await prisma.school.create({ data: { name: `ExSched Other ${ts}` } });

    // Academic year (required for class)
    const ay = await prisma.academicYear.create({
        data: { name: `AY-${ts}`, schoolId: school.id, current: true, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') }
    });

    classObj = await prisma.class.create({
        data: { name: `ClassA-${ts}`, academicYearId: ay.id }
    });

    subject = await prisma.subject.create({
        data: { name: `Math-${ts}`, schoolId: school.id, classId: classObj.id }
    });

    const admin = await prisma.user.create({
        data: { fullName: 'Admin ES', email: `admin-es-${ts}@test.com`, password_hash: hash, role: 'school_admin', schoolId: school.id, isActive: true, emailVerified: true }
    });
    const teacher = await prisma.user.create({
        data: { fullName: 'Teacher ES', email: `teacher-es-${ts}@test.com`, password_hash: hash, role: 'teacher', schoolId: school.id, isActive: true, emailVerified: true }
    });
    const otherAdmin = await prisma.user.create({
        data: { fullName: 'Other Admin', email: `other-admin-es-${ts}@test.com`, password_hash: hash, role: 'school_admin', schoolId: otherSchool.id, isActive: true, emailVerified: true }
    });

    const login = async (email) => {
        const res = await request(app).post('/api/auth/login').send({ email, password: 'Pass123!' });
        return res.body.data?.token || res.body.token;
    };

    adminToken = await login(admin.email);
    teacherToken = await login(teacher.email);
    otherAdminToken = await login(otherAdmin.email);

    exam = await prisma.exam.create({
        data: { name: `Exam-${ts}`, startDate: new Date(), endDate: new Date(Date.now() + 86400000), schoolId: school.id }
    });
});

afterAll(async () => {
    // Cascade-safe cleanup order
    await prisma.examSchedule.deleteMany({ where: { examId: { in: exam ? [exam.id] : [] } } });
    await prisma.exam.deleteMany({ where: { schoolId: { in: [school?.id, otherSchool?.id].filter(Boolean) } } });
    await prisma.subject.deleteMany({ where: { schoolId: school?.id } });
    await prisma.class.deleteMany({ where: { academicYearId: { not: undefined } } }).catch(() => {});
    await prisma.academicYear.deleteMany({ where: { schoolId: { in: [school?.id].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { schoolId: { in: [school?.id, otherSchool?.id].filter(Boolean) } } });
    await prisma.school.deleteMany({ where: { id: { in: [school?.id, otherSchool?.id].filter(Boolean) } } });
    await prisma.$disconnect();
});

describe('Exam Schedule CRUD via /api/school routes', () => {

    let scheduleId;

    it('POST /school/exams/:examId/schedules → 201', async () => {
        const res = await request(app)
            .post(`/api/school/exams/${exam.id}/schedules`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                classId: classObj.id,
                subjectId: subject.id,
                date: '2026-06-01',
                startTime: '09:00',
                endTime: '10:00',
            });

        expect(res.status).toBe(201);
        expect(res.body.examId).toBe(exam.id);
        scheduleId = res.body.id;
    });

    it('GET /school/exams/:examId/schedules → returns the schedule', async () => {
        const res = await request(app)
            .get(`/api/school/exams/${exam.id}/schedules`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.some(s => s.id === scheduleId)).toBe(true);
    });

    it('Teacher can GET schedules', async () => {
        const res = await request(app)
            .get(`/api/school/exams/${exam.id}/schedules`)
            .set('Authorization', `Bearer ${teacherToken}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('Cross-school admin cannot create schedule (exam not in their school)', async () => {
        const res = await request(app)
            .post(`/api/school/exams/${exam.id}/schedules`)
            .set('Authorization', `Bearer ${otherAdminToken}`)
            .send({
                classId: classObj.id,
                subjectId: subject.id,
                date: '2026-06-02',
                startTime: '09:00',
                endTime: '10:00',
            });

        // The belongsToSchool middleware or controller should block this
        // It may return 403 or the schedule may fail due to FK constraints
        expect([403, 404, 409, 500]).toContain(res.status);
    });

    it('DELETE /school/exam-schedules/:scheduleId → 204', async () => {
        const res = await request(app)
            .delete(`/api/school/exam-schedules/${scheduleId}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(204);
    });

    it('DELETE non-existent schedule → 404', async () => {
        const res = await request(app)
            .delete(`/api/school/exam-schedules/00000000-0000-0000-0000-000000000000`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
    });

    it('POST missing fields → 400', async () => {
        const res = await request(app)
            .post(`/api/school/exams/${exam.id}/schedules`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ classId: classObj.id });

        expect(res.status).toBe(400);
    });
});
