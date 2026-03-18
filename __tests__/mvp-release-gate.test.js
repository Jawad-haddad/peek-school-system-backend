// __tests__/mvp-release-gate.test.js
const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

let app;
let prisma;
let postgresContainer;

let superAdminToken;
let superAdminEmail = `super.mvp.${Date.now()}@test.com`;

let schoolId;
let classId;
let academicYearId;
let subjectId;
let studentId;
let parentToken;
let parentEmail;

let schoolAdminEmail = `admin.mvp.${Date.now()}@mvpschool.com`;
let schoolAdminToken;

let teacherEmail = `teacher.mvp.${Date.now()}@mvpschool.com`;
let teacherId;
let teacherToken;

jest.setTimeout(60000);

beforeAll(async () => {
    postgresContainer = await new PostgreSqlContainer("postgres:15-alpine")
        .withDatabase("school_system")
        .withUsername("user")
        .withPassword("password")
        .start();

    process.env.DATABASE_URL = postgresContainer.getConnectionUri();
    process.env.PORT = '0';

    execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });

    app = require('../index');
    prisma = require('../src/prismaClient');

    const password_hash = await bcrypt.hash('MvpPass123!', 10);
    await prisma.user.create({
        data: {
            fullName: 'MVP Super Admin',
            email: superAdminEmail,
            role: 'super_admin',
            password_hash,
            isActive: true,
            emailVerified: true
        }
    });
});

afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (postgresContainer) await postgresContainer.stop();
});

describe('MVP Release Gate E2E', () => {

    // 1. Super Admin operations & School Provisioning
    it('login super admin', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: superAdminEmail, password: 'MvpPass123!' });
        expect(res.status).toBe(200);
        superAdminToken = res.body.data.token;
    });

    it('provision school via Onboarding API', async () => {
        const res = await request(app)
            .post('/api/platform/onboard-school')
            .set('Authorization', `Bearer ${superAdminToken}`)
            .send({
                school: { name: 'MVP School', city: 'MVP City' },
                admin: { fullName: 'MVP Admin', email: schoolAdminEmail, password: 'StrongPassword123!' },
                academicYear: { name: '2030-2031', startDate: '2030-09-01', endDate: '2031-06-30', isCurrent: true },
                classes: [{ name: 'MVP Class 1A', defaultFee: 500 }]
            });
        expect(res.status).toBe(200);
        schoolId = res.body.data.schoolId;
        classId = res.body.data.classIds[0];
        academicYearId = res.body.data.academicYearId;
    });

    // 2. Login Admin
    it('login admin', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: schoolAdminEmail, password: 'StrongPassword123!' });
        expect(res.status).toBe(200);
        schoolAdminToken = res.body.data.token;
    });

    // 3. Admin creates Teacher
    it('create teacher', async () => {
        const res = await request(app)
            .post('/api/academics/teachers')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                fullName: 'MVP Teacher',
                email: teacherEmail,
                password: 'TeacherPass123!'
            });
        
        // Wait, academics/teachers post route or school/teachers?
        // Let's accept 200 or 201
        expect([200, 201]).toContain(res.status);
        teacherId = res.body.data ? res.body.data.id : res.body.id;
    });

    // 4. Admin creates Subject
    it('create subject', async () => {
        const res = await request(app)
            .post('/api/academics/subjects')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                name: 'MVP Math',
                classId: classId,
                teacherId: teacherId
            });
        expect([200, 201]).toContain(res.status);
        subjectId = res.body.data ? res.body.data.id : res.body.id;
    });

    // 5. Admin creates Class (already created one but verifying the route works)
    it('create class', async () => {
        const res = await request(app)
            .post('/api/school/classes')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                name: 'MVP Class 1B',
                academicYearId: academicYearId,
                defaultFee: 500
            });
        expect([200, 201]).toContain(res.status);
    });

    // 6. Admin creates Student (Happy Path)
    it('create student', async () => {
        const res = await request(app)
            .post('/api/school/students')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                fullName: 'MVP Student',
                classId: classId
            });
        expect([200, 201]).toContain(res.status);
        
        // Find the generated parent email (usually parent_email@peek.com or something derived if not passed)
        // Let's resolve student from DB to be safe
        const student = await prisma.student.findUnique({
            where: { id: res.body.data.student.id },
            include: { parent: true }
        });
        studentId = student.id;
        parentEmail = student.parent.email;
    });

    // 7. Login Teacher
    it('login teacher', async () => {
        const res = await request(app).post('/api/auth/login').send({ email: teacherEmail, password: 'TeacherPass123!' });
        expect(res.status).toBe(200);
        teacherToken = res.body.data.token;
    });

    // 8. Teacher Submits Attendance Bulk
    it('attendance bulk submit', async () => {
        const todayFormat = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .post('/api/attendance/bulk')
            .set('Authorization', `Bearer ${teacherToken}`)
            .send({
                classId: classId,
                date: todayFormat,
                records: [{ studentId: studentId, status: 'present' }]
            });
        
        // In this app, teachers can only submit attendance if they are explicitly assigned to the class.
        // Wait, did we assign the teacher to the class? 
        // We assigned the teacher to a subject linked to the class. 
        // If it throws 403 TEACHER_NOT_ASSIGNED, we better test via Admin or make sure teacher is assigned.
        // The assignment happens automatically via `TeacherSubjectAssignment` on subject creation.
        expect(res.status).toBe(200);
    });

    // 9. Fetch Attendance
    it('attendance fetch', async () => {
        const todayFormat = new Date().toISOString().slice(0, 10);
        const res = await request(app)
            .get(`/api/attendance/${classId}?date=${todayFormat}`)
            .set('Authorization', `Bearer ${teacherToken}`);
        expect(res.status).toBe(200);
    });

    // 10. Login Parent
    it('login parent', async () => {
        // Assume default password for auto-generated parent is 'Parent123!' or similar based on the platform config.
        // We will reset password directly via prisma to be safe since we don't know the exact default password string.
        const password_hash = await bcrypt.hash('ParentPass123!', 10);
        await prisma.user.update({
            where: { email: parentEmail },
            data: { password_hash }
        });

        const res = await request(app).post('/api/auth/login').send({ email: parentEmail, password: 'ParentPass123!' });
        expect(res.status).toBe(200);
        parentToken = res.body.data.token;
    });

    // 11. Broadcast Create & Announcements Read
    it('broadcast create + announcements read', async () => {
        // Admin creates broadcast
        const createRes = await request(app)
            .post('/api/communication/broadcast')
            .set('Authorization', `Bearer ${schoolAdminToken}`)
            .send({
                title: 'Welcome to MVP',
                content: 'This is a test broadcast.',
                audience: 'ALL'
            });
        expect(createRes.status).toBe(201);

        // Parent reads announcements
        const readRes = await request(app)
            .get('/api/communication/announcements')
            .set('Authorization', `Bearer ${parentToken}`);
        expect(readRes.status).toBe(200);
        expect(readRes.body.data.length).toBeGreaterThan(0);
        expect(readRes.body.data[0].title).toBe('Welcome to MVP');
    });

});
