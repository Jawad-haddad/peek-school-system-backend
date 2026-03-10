// __tests__/stats-student-count.test.js
const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

let app, prisma, postgresContainer;
let schoolAdminEmail = `admin.stats.${Date.now()}@test.com`;
let adminToken;
let schoolId, classId, academicYearId;

jest.setTimeout(60000);

beforeAll(async () => {
    // 1. Ephemeral Postgres
    postgresContainer = await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('school_system')
        .withUsername('user')
        .withPassword('password')
        .start();

    process.env.DATABASE_URL = postgresContainer.getConnectionUri();
    process.env.PORT = '0';

    execSync('npx prisma db push --skip-generate', { env: process.env, stdio: 'inherit' });

    app = require('../index');
    prisma = require('../src/prismaClient');

    // Setup Super Admin and Onboard
    const superAdmin = await prisma.user.create({
        data: {
            fullName: 'Super Admin',
            email: `super.${Date.now()}@test.com`,
            role: 'super_admin',
            password_hash: await bcrypt.hash('SuperPass123!', 10),
            isActive: true,
            emailVerified: true,
        },
    });

    const superAdminTokenRes = await request(app)
        .post('/api/auth/login')
        .send({ email: superAdmin.email, password: 'SuperPass123!' });

    const onboardRes = await request(app)
        .post('/api/platform/onboard-school')
        .set('Authorization', `Bearer ${superAdminTokenRes.body.data.token}`)
        .send({
            school: { name: `Stats School`, city: 'Test City' },
            admin: { fullName: 'School Admin', email: schoolAdminEmail, password: 'AdminPass123!' },
            academicYear: { name: '2030-2031', startDate: '2030-09-01', endDate: '2031-06-30', isCurrent: true },
            classes: [{ name: 'Class 1A', defaultFee: 500 }],
        });

    schoolId = onboardRes.body.data.schoolId;
    classId = onboardRes.body.data.classIds[0];
    academicYearId = onboardRes.body.data.academicYearId;

    const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: schoolAdminEmail, password: 'AdminPass123!' });
    adminToken = adminLogin.body.data.token;
});

afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (postgresContainer) await postgresContainer.stop();
});

describe('Stats: Student Count Bug', () => {
    it('Dashboard stats endpoint should return accurate enrolled student count', async () => {
        // Create 1 student
        const createRes = await request(app)
            .post('/api/school/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({
                fullName: 'Stats Student',
                classId: classId,
                parentEmail: `parent.stats.${Date.now()}@test.com`,
            });
        expect(createRes.status).toBe(201);

        // Fetch dashboard stats
        const res = await request(app)
            .get('/api/dashboard/admin-stats')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        // Using res.body directly since this endpoint doesn't use the standard success envelope
        expect(res.body.students).toBe(1);
    });
});
