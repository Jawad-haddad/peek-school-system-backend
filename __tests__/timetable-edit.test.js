// __tests__/timetable-edit.test.js
const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

let app, prisma, postgresContainer;
let schoolAdminToken, superAdminToken;
let schoolId, classId, subjectId, teacherId;
const ts = Date.now();

jest.setTimeout(60000);

beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('school_system').withUsername('user').withPassword('password').start();
    process.env.DATABASE_URL = postgresContainer.getConnectionUri();
    process.env.PORT = '0';
    execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });

    app = require('../index');
    prisma = require('../src/prismaClient');

    // Seed super_admin
    const hash = await bcrypt.hash('Pass123!', 10);
    await prisma.user.create({
        data: { fullName: 'TT SA', email: `tt.sa.${ts}@test.com`, role: 'super_admin', password_hash: hash, isActive: true, emailVerified: true }
    });

    const saRes = await request(app).post('/api/auth/login').send({ email: `tt.sa.${ts}@test.com`, password: 'Pass123!' });
    superAdminToken = saRes.body.data.token;

    // Onboard school
    const onRes = await request(app).post('/api/platform/onboard-school')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
            school: { name: `TT School ${ts}`, city: 'City' },
            admin: { fullName: 'TT Admin', email: `ttadmin.${ts}@test.com`, password: 'Pass123!' },
            academicYear: { name: '2030-2031', startDate: '2030-09-01', endDate: '2031-06-30', isCurrent: true },
            classes: [{ name: 'TT Class 1A', defaultFee: 100 }]
        });
    schoolId = onRes.body.data.schoolId;
    classId = onRes.body.data.classIds[0];

    const adRes = await request(app).post('/api/auth/login').send({ email: `ttadmin.${ts}@test.com`, password: 'Pass123!' });
    schoolAdminToken = adRes.body.data.token;

    // Create teacher
    const tRes = await request(app).post('/api/academics/teachers')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .send({ fullName: 'TT Teacher', email: `ttteacher.${ts}@test.com`, password: 'Pass123!' });
    teacherId = tRes.body.data ? tRes.body.data.id : tRes.body.id;

    // Create subject for the class
    const sRes = await request(app).post('/api/academics/subjects')
        .set('Authorization', `Bearer ${schoolAdminToken}`)
        .send({ name: 'TT Math', classId });
    subjectId = sRes.body.data ? sRes.body.data.id : sRes.body.id;
});

afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (postgresContainer) await postgresContainer.stop();
});

describe('Timetable Edit Dependencies', () => {

    it('GET /api/academics/subjects → loads subjects for school', async () => {
        const res = await request(app).get('/api/academics/subjects')
            .set('Authorization', `Bearer ${schoolAdminToken}`);
        expect(res.status).toBe(200);
        // Should contain our subject
        const names = (res.body.data || res.body).map(s => s.name);
        expect(names).toContain('TT Math');
    });

    it('GET /api/academics/teachers → loads teachers for school', async () => {
        const res = await request(app).get('/api/academics/teachers')
            .set('Authorization', `Bearer ${schoolAdminToken}`);
        expect(res.status).toBe(200);
        const names = (res.body.data || res.body).map(t => t.fullName);
        expect(names).toContain('TT Teacher');
    });

    let createdEntryId;

    it('POST /api/academics/timetable → create entry succeeds with valid data', async () => {
        const res = await request(app).post('/api/academics/timetable')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                classId,
                subjectId,
                teacherId,
                dayOfWeek: 'Monday',
                startTime: '08:00 AM',
                endTime: '08:45 AM'
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('id');
        createdEntryId = res.body.data.id;
    });

    it('PUT /api/academics/timetable/:entryId → update entry succeeds', async () => {
        const res = await request(app).put(`/api/academics/timetable/${createdEntryId}`)
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({ dayOfWeek: 'Tuesday', startTime: '09:00 AM', endTime: '09:45 AM' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.dayOfWeek).toBe('Tuesday');
    });

    it('GET /api/school/classes/:classId/timetable → returns envelope with entries', async () => {
        const res = await request(app).get(`/api/school/classes/${classId}/timetable`)
            .set('Authorization', `Bearer ${schoolAdminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.data[0]).toHaveProperty('subject');
        expect(res.body.data[0]).toHaveProperty('teacher');
    });

    it('cross-school subject is blocked', async () => {
        // Create another school + subject directly
        const otherSchool = await prisma.school.create({ data: { name: `Other TT School ${ts}` } });
        const otherYear = await prisma.academicYear.create({
            data: { name: '2030-2031', startDate: new Date('2030-09-01'), endDate: new Date('2031-06-30'), schoolId: otherSchool.id }
        });
        const otherClass = await prisma.class.create({
            data: { name: 'Other Class', academicYearId: otherYear.id }
        });
        const otherSubject = await prisma.subject.create({
            data: { name: 'Other Math', schoolId: otherSchool.id, classId: otherClass.id }
        });

        const res = await request(app).post('/api/academics/timetable')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                classId,
                subjectId: otherSubject.id,
                teacherId,
                dayOfWeek: 'Wednesday',
                startTime: '10:00 AM',
                endTime: '10:45 AM'
            });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('cross-school teacher is blocked', async () => {
        const otherSchool = await prisma.school.create({ data: { name: `Other TT School2 ${ts}` } });
        const hash = await bcrypt.hash('Pass123!', 10);
        const otherTeacher = await prisma.user.create({
            data: { fullName: 'Foreign Teacher', email: `foreign.${ts}@test.com`, role: 'teacher', password_hash: hash, isActive: true, emailVerified: true, schoolId: otherSchool.id }
        });

        const res = await request(app).post('/api/academics/timetable')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                classId,
                subjectId,
                teacherId: otherTeacher.id,
                dayOfWeek: 'Thursday',
                startTime: '11:00 AM',
                endTime: '11:45 AM'
            });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
});
