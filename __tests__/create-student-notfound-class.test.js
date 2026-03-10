const request = require('supertest');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const { execSync } = require('child_process');
const bcrypt = require('bcryptjs');

let app, prisma, postgresContainer;
let adminToken, schoolId, classId;

jest.setTimeout(60000);

beforeAll(async () => {
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

    const superAdmin = await prisma.user.create({
        data: {
            fullName: 'Super Admin',
            email: `super.${Date.now()}@test.com`,
            role: 'super_admin',
            password_hash: await bcrypt.hash('password123', 10),
            isActive: true,
            emailVerified: true
        }
    });

    const saLogin = await request(app).post('/api/auth/login').send({ email: superAdmin.email, password: 'password123' });
    const saToken = saLogin.body.data.token;

    const onboardRes = await request(app)
        .post('/api/platform/onboard-school')
        .set('Authorization', `Bearer ${saToken}`)
        .send({
            school: { name: 'Test School', city: 'City' },
            admin: { fullName: 'Admin', email: `admin.${Date.now()}@test.com`, password: 'password123' },
            academicYear: { name: '2030-2031', startDate: '2030-01-01', endDate: '2030-12-31', isCurrent: true },
            classes: [{ name: 'Class 1A', defaultFee: 100 }]
        });

    schoolId = onboardRes.body.data.schoolId;
    classId = onboardRes.body.data.classIds[0];

    const adminEmail = onboardRes.body.data.adminEmail;

    const adminLogin = await request(app).post('/api/auth/login').send({ email: adminEmail, password: 'password123' });
    adminToken = adminLogin.body.data.token;
});

afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (postgresContainer) await postgresContainer.stop();
});

describe('POST /api/school/students (404 Class Not Found)', () => {
    it('Should return 404 NOT_FOUND when the classId does not exist', async () => {
        const payload = {
            fullName: 'Missing Class Student',
            classId: '00000000-0000-0000-0000-000000000000', // valid UUID format but not in DB
            parentEmail: `parent.missing.${Date.now()}@test.com`
        };

        const res = await request(app)
            .post('/api/school/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
        expect(res.body.error.message).toMatch(/Class not found/i);
    });

    it('Should return 201 when the classId is valid (positive assertion)', async () => {
        const payload = {
            fullName: 'Valid Class Student',
            classId: classId,
            parentEmail: `parent.valid.${Date.now()}@test.com`
        };

        const res = await request(app)
            .post('/api/school/students')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(payload);

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
    });
});
